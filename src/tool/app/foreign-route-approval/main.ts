import type { WorkBook } from "xlsx-js-style";
import { buildApprovalWorkbook } from "./export";
import { analyzeApprovals, inferSeason, listAirlines, outputFilename, validateDates } from "./logic";
import { TEMPLATE_URL, type AirportCatalog, type Analysis, type ExportOptions, type ParsedSource, type SourceKind } from "./models";
import { readAirportCatalog, readApprovals } from "./workbook";
import { clearResult, message, showAirlines, showPreview, showResult } from "./view";

const element = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const state: Partial<Record<SourceKind, { workbook: WorkBook; name: string }>> = {};
const versions: Record<SourceKind, number> = { open: 0, temporary: 0 };
const selectedAirlines = new Set(["CSG"]);
let template: Uint8Array | undefined;
let catalog: AirportCatalog | undefined;
let analysis: Analysis | undefined;
let revision = 0;
let exporting = false;
let templateRequest = 0;
const errorText = (e: unknown): string => e instanceof Error ? e.message : String(e);
const options = (): ExportOptions => ({ effective: element<HTMLInputElement>("effective").value, expiry: element<HTMLInputElement>("expiry").value, season: element<HTMLInputElement>("season").value });

function updateButtons(): void {
  element<HTMLButtonElement>("analyze").disabled = !state.open || !state.temporary || !catalog || !selectedAirlines.size;
  element<HTMLButtonElement>("export").disabled = exporting || !analysis || analysis.issues.some(i => i.severity === "error") || validateDates(options().effective, options().expiry).length > 0;
}
function readSource(kind: SourceKind): ParsedSource {
  const source = state[kind];
  if (!source) return { rows: [], issues: [] };
  const sheet = element<HTMLSelectElement>(`${kind}Sheet`).value;
  return readApprovals(XLSX, source.workbook.Sheets[sheet], `${source.name} / ${sheet}`, kind);
}
function refreshAirlines(): void {
  const airlines = listAirlines(readSource("open"), readSource("temporary"));
  const available = new Set(airlines.map(airline => airline.code));
  for (const code of selectedAirlines) if (!available.has(code)) selectedAirlines.delete(code);
  showAirlines(airlines, selectedAirlines);
}
function invalidate(): void {
  revision++;
  analysis = undefined;
  clearResult();
  message("文件或配置已更新，请重新预检。");
  updateButtons();
}
async function loadTemplate(): Promise<void> {
  const request = ++templateRequest;
  template = undefined;
  catalog = undefined;
  invalidate();
  element("templateStatus").textContent = "正在加载内置模板…";
  try {
    const response = await fetch(TEMPLATE_URL);
    if (!response.ok) throw new Error(`模板加载失败（HTTP ${response.status}）`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const airports = readAirportCatalog(XLSX, XLSX.read(bytes, { type: "array" }));
    if (request !== templateRequest) return;
    template = bytes;
    catalog = airports;
    element("templateStatus").textContent = `内置原模板已就绪，机场 ${airports.ports.size} 个，多机场基地 ${airports.multi.size} 个。`;
    message("上传两份批复，确认航司（默认 CSG 货航），填写生效、失效日期后预检。");
  } catch (e) {
    if (request !== templateRequest) return;
    element("templateStatus").textContent = errorText(e);
    message("模板加载失败，请点击重试加载模板。", true);
  }
  updateButtons();
}
for (const kind of ["open", "temporary"] as const) {
  const fileInput = element<HTMLInputElement>(`${kind}File`);
  const selector = element<HTMLSelectElement>(`${kind}Sheet`);
  fileInput.addEventListener("change", async () => {
    const version = ++versions[kind];
    delete state[kind];
    selector.replaceChildren();
    selector.disabled = true;
    refreshAirlines();
    invalidate();
    const file = fileInput.files?.[0];
    if (!file) { element(`${kind}Status`).textContent = "未选择文件"; return; }
    element(`${kind}Status`).textContent = "正在读取…";
    try {
      const buffer = await file.arrayBuffer();
      if (version !== versions[kind]) return;
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      if (!workbook.SheetNames.length) throw new Error("文件中没有工作表。");
      state[kind] = { workbook, name: file.name };
      for (const name of workbook.SheetNames) { const option = document.createElement("option"); option.value = name; option.textContent = name; selector.append(option); }
      selector.disabled = false;
      element(`${kind}Status`).textContent = `${file.name} · ${workbook.SheetNames.length} 张工作表，请确认所选表。`;
      if (!element<HTMLInputElement>("season").value) element<HTMLInputElement>("season").value = inferSeason(file.name);
      refreshAirlines();
    } catch (e) {
      if (version !== versions[kind]) return;
      element(`${kind}Status`).textContent = `读取失败：${errorText(e)}`;
      message(errorText(e), true);
    }
    updateButtons();
  });
  selector.addEventListener("change", () => { refreshAirlines(); invalidate(); });
}
element("airlineOptions").addEventListener("change", () => {
  selectedAirlines.clear();
  for (const input of Array.from(element("airlineOptions").querySelectorAll<HTMLInputElement>("input:checked"))) selectedAirlines.add(input.value);
  invalidate();
  if (!selectedAirlines.size) message("请至少选择一个航司后运行。", true);
});
for (const id of ["effective", "expiry", "season"]) element(id).addEventListener("input", invalidate);
element("retryTemplate").addEventListener("click", () => void loadTemplate());
element("analyze").addEventListener("click", () => {
  if (!state.open || !state.temporary || !catalog) return;
  try {
    analysis = analyzeApprovals(readSource("open"), readSource("temporary"), catalog, [...selectedAirlines]);
    element<HTMLSelectElement>("previewKind").value = "merged";
    showResult(analysis);
    const dates = validateDates(options().effective, options().expiry);
    const errors = analysis.issues.filter(i => i.severity === "error").length;
    message(errors ? `预检发现 ${errors} 项错误，请核对航司范围和下方问题。` : dates.length ? `预检完成。${dates.join(" ")}` : analysis.issues.length ? "预检完成，存在提示，请查看下方问题后导出。" : "预检通过，可以导出录入表。", errors > 0);
  } catch (e) { analysis = undefined; clearResult(); message(errorText(e), true); }
  updateButtons();
});
element("previewKind").addEventListener("change", () => { if (analysis) showPreview(analysis, element<HTMLSelectElement>("previewKind").value); });
element("export").addEventListener("click", async () => {
  if (!analysis || !template || exporting) return;
  const snapshot = revision;
  const config = options();
  exporting = true;
  updateButtons();
  try {
    const bytes = await buildApprovalWorkbook(template, analysis, config);
    if (snapshot !== revision) return;
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = outputFilename(config);
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    message("已生成录入表；请在 Excel 中打开以重算 PORT 和俄罗斯查询公式。俄罗斯机场列表未命中的 #N/A 与原模板规则一致。");
  } catch (e) { if (snapshot === revision) message(`导出失败：${errorText(e)}`, true); }
  finally { exporting = false; updateButtons(); }
});
refreshAirlines();
void loadTemplate();
