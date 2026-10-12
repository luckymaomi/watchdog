import { buildSeal, DEFAULT_OPTIONS, type SealOptions, type SealResult } from "./logic";
import { BUNDLED_FONTS, ensureFonts, portableSvg } from "./fonts";
import { downloadBlob, sealFilename, sealPng } from "./export";
import { setupReference } from "./reference";
import { syncRange } from "./controls";

function element<T extends HTMLElement>(id: string): T { return document.getElementById(id) as T; }
const form = element<HTMLFormElement>("sealForm");
const layer = element<HTMLDivElement>("sealLayer");
const pngButton = element<HTMLButtonElement>("downloadPng");
const svgButton = element<HTMLButtonElement>("downloadSvg");
const status = element<HTMLParagraphElement>("actionStatus");
const validation = element<HTMLDivElement>("validation");
let current: { options: SealOptions; result: SealResult } | null = null;
let version = 0;
let exporting = false;

type NumericKey = { [Key in keyof SealOptions]: SealOptions[Key] extends number ? Key : never }[keyof SealOptions];
const numericKeys: NumericKey[] = [];
const textKeys = ["company", "caption", "code", "color", "font", "codeMode", "codeFont", "captionFont"] as const;

function sliders(group: string, definitions: Array<[NumericKey, string, number, number, number, string?]>): void {
  const container = element<HTMLDivElement>(group);
  for (const [key, label, min, max, step, unit = ""] of definitions) {
    numericKeys.push(key);
    const row = document.createElement("label");
    row.className = "slider-row";
    const name = document.createElement("span");
    name.textContent = label;
    const range = document.createElement("input");
    range.id = key;
    range.type = "range";
    range.className = "form-range";
    const number = document.createElement("input");
    number.id = `${key}Value`;
    number.type = "number";
    number.className = "form-control";
    number.setAttribute("aria-label", `${label}${unit ? `（${unit}）` : ""}`);
    range.min = String(min); range.max = String(max); range.step = String(step);
    number.step = "any";
    range.addEventListener("input", () => { number.value = range.value; });
    number.addEventListener("input", () => { syncRange(range, number.value); });
    row.append(name, range, number);
    container.append(row);
  }
}

sliders("nameControls", [
  ["borderRadius", "圆圈大小", 210, 245, 1], ["borderMm", "边框粗细 mm", 0.2, 1.5, 0.05, "mm"],
  ["nameSize", "名称字号", 28, 60, 1], ["nameWidth", "名称字宽 %", 40, 130, 1, "%"],
  ["nameArc", "字距 / 弧度 °", 150, 280, 1, "度"], ["nameRadius", "名称离圆心", 130, 225, 1],
  ["nameRotation", "名称整体旋转 °", -180, 180, 1, "度"]
]);
sliders("starControls", [
  ["starSize", "五角星大小", 20, 100, 1], ["starRotation", "五角星旋转 °", -180, 180, 1, "度"],
  ["starX", "五角星横向", 150, 350, 1], ["starY", "五角星纵向", 150, 350, 1]
]);
sliders("captionControls", [["captionSize", "章名字号", 12, 60, 1], ["captionY", "章名纵向", 280, 410, 1]]);
sliders("codeControls", [
  ["codeSize", "编号字号", 8, 30, 1], ["codeWidth", "编号字宽 %", 40, 150, 1, "%"],
  ["codeArc", "编号字距 / 弧度 °", 30, 150, 1, "度"], ["codeRadius", "编号离圆心", 160, 235, 1],
  ["codeY", "横排编号纵向", 380, 465, 1], ["codeRotation", "编号整体旋转 °", -180, 180, 1, "度"]
]);
numericKeys.push("diameterMm", "dpi");

for (const id of ["font", "captionFont", "codeFont"]) {
  const select = element<HTMLSelectElement>(id);
  const options: Array<[string, string]> = [
    ...Object.entries(BUNDLED_FONTS).map(([key, item]): [string, string] => [key, `${item.label} · 内置`]),
    ["song", "宋体 · 本机"], ["fang", "仿宋 · 本机"], ["hei", "黑体 · 本机"], ["kai", "楷体 · 本机"]
  ];
  select.replaceChildren(...options.map(([key, label]) => { const option = document.createElement("option"); option.value = key; option.textContent = label; return option; }));
}

function writeOptions(options: SealOptions): void {
  for (const key of textKeys) element<HTMLInputElement>(key).value = options[key];
  for (const key of numericKeys) {
    element<HTMLInputElement>(key).value = String(options[key]);
    const value = document.getElementById(`${key}Value`) as HTMLInputElement | null;
    if (value) value.value = String(options[key]);
  }
  element<HTMLInputElement>("star").checked = options.star;
}

function readOptions(): SealOptions {
  const options = { ...DEFAULT_OPTIONS };
  for (const key of textKeys) {
    const value = element<HTMLInputElement>(key).value;
    Object.assign(options, { [key]: value });
  }
  for (const key of numericKeys) {
    const input = (document.getElementById(`${key}Value`) || document.getElementById(key)) as HTMLInputElement;
    options[key] = input.value === "" ? NaN : Number(input.value);
  }
  options.star = element<HTMLInputElement>("star").checked;
  return options;
}

function buttons(): void { pngButton.disabled = svgButton.disabled = !current || exporting; }

function showValidation(result: SealResult): void {
  validation.replaceChildren();
  const messages = result.errors.length ? result.errors : result.warnings;
  validation.className = `validation mt-3 ${result.errors.length ? "error" : result.warnings.length ? "warning" : ""}`;
  if (!messages.length) { validation.textContent = "可导出。参考图和预览底纹不会进入文件。"; return; }
  const list = document.createElement("ul");
  for (const message of messages) { const item = document.createElement("li"); item.textContent = message; list.append(item); }
  validation.append(list);
}

async function refresh(): Promise<void> {
  const revision = ++version;
  current = null;
  buttons();
  status.textContent = "";
  const options = readOptions();
  const result = buildSeal(options);
  showValidation(result);
  layer.replaceChildren();
  if (result.errors.length) { layer.replaceChildren(); element("sizeSummary").textContent = "等待修正参数"; return; }
  validation.textContent = "正在加载所选字体…";
  try {
    await ensureFonts(options);
    if (revision !== version) return;
    layer.innerHTML = result.svg;
    current = { options, result };
    element("sizeSummary").textContent = `${options.diameterMm} mm · ${result.pixelSize} × ${result.pixelSize} px`;
    showValidation(result);
  } catch (error) {
    if (revision !== version) return;
    layer.replaceChildren();
    element("sizeSummary").textContent = "字体加载失败";
    status.textContent = error instanceof Error ? error.message : String(error);
    validation.textContent = "调整字体后重试；当前禁止导出。";
  }
  buttons();
}

async function exportSeal(format: "png" | "svg"): Promise<void> {
  if (!current || exporting) return;
  const snapshot = current;
  exporting = true;
  buttons();
  status.textContent = "正在生成文件…";
  try {
    const svg = await portableSvg(snapshot.result.svg, snapshot.options);
    const blob = format === "png" ? await sealPng(svg, snapshot.result.pixelSize, snapshot.options.dpi) : new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    downloadBlob(blob, `${sealFilename(snapshot.options.company)}.${format}`);
    status.textContent = "已生成并下载印章，参考图没有进入导出。";
  } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
  finally { exporting = false; buttons(); }
}

form.addEventListener("submit", (event) => event.preventDefault());
form.addEventListener("input", () => { void refresh(); });
element("resetSeal").addEventListener("click", () => {
  const currentText = readOptions();
  writeOptions({ ...DEFAULT_OPTIONS, font: "zhuque", captionFont: "zhuque", company: currentText.company, caption: currentText.caption, code: currentText.code });
  void refresh();
});
pngButton.addEventListener("click", () => { void exportSeal("png"); });
svgButton.addEventListener("click", () => { void exportSeal("svg"); });
setupReference((message) => { status.textContent = message; });
writeOptions({ ...DEFAULT_OPTIONS, font: "zhuque", captionFont: "zhuque" });
void refresh();
