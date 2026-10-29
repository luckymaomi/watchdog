import type * as XlsxRuntime from "xlsx-js-style";
import JSZip from "jszip";
import { parseRosterRows } from "../../../crew-match-name-id/logic";
import type { CrewRosterEntry } from "../../../crew-match-name-id/models";
import { mountDocumentPreview } from "../../document-preview-view";
import { buildSecurityDraft, canExportSecurity } from "./logic";
import { buildSecurityFiles } from "./export";
import { SECURITY_TEMPLATE_PATHS, securityTemplateKeys, type SecurityTemplateKey, type SecurityTemplates } from "./templates";
import type { SecurityDraft } from "./models";
import { element, renderDraft, setStatus } from "./view";

const XLSX = window.XLSX as unknown as typeof XlsxRuntime;
let roster: CrewRosterEntry[] = [];
let rosterReady = false;
let rosterMessage = "正在加载默认花名册。";
let rosterVersion = 0;
let exporting = false;
let currentDraft: SecurityDraft;
const templates: SecurityTemplates = {};
const templateErrors = new Map<SecurityTemplateKey, string>();
const preview = mountDocumentPreview(async () => {
    if (element("exportButton", HTMLButtonElement).disabled) throw new Error("请先完成培训参数和人员名单。");
    return buildSecurityFiles(templates, currentDraft);
}, XLSX);

function refresh(): void {
    const value = (id: string): string => element(id, HTMLInputElement).value;
    currentDraft = buildSecurityDraft(roster, {
        kind: element("kindInput", HTMLSelectElement).value, instructor: value("instructorInput"),
        chinaDate: value("chinaDateInput"), tsaDate: value("tsaDateInput"), permitDate: value("permitDateInput"),
        sourceText: element("sourceText", HTMLTextAreaElement).value
    });
    const messages = rosterReady ? [] : [rosterMessage];
    const missing = securityTemplateKeys(currentDraft.kind).filter(key => !templates[key]);
    for (const key of missing) if (templateErrors.has(key)) messages.push(templateErrors.get(key)!);
    if (missing.some(key => !templateErrors.has(key))) messages.push("正在加载安保模板和原始试题。");
    renderDraft(currentDraft, messages, exporting);
    preview.update(JSON.stringify(currentDraft), !element("exportButton", HTMLButtonElement).disabled);
}
async function fetchBytes(path: string): Promise<Uint8Array> {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`资源加载失败：${path}`);
    return new Uint8Array(await response.arrayBuffer());
}
async function loadRoster(file?: File): Promise<void> {
    const version = ++rosterVersion;
    rosterReady = false; roster = []; rosterMessage = "正在加载花名册。"; refresh();
    try {
        const bytes = file ? new Uint8Array(await file.arrayBuffer()) : await fetchBytes("../../../template/机组花名册.xlsx");
        if (version !== rosterVersion) return;
        const workbook = XLSX.read(bytes, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!sheet) throw new Error("花名册没有工作表。");
        roster = parseRosterRows(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" }));
        if (!roster.length) throw new Error("花名册没有可用人员，请核对姓名和员工号表头。");
        rosterReady = true;
        setStatus(`花名册已加载，共 ${roster.length} 人。`);
    } catch (error) {
        if (version !== rosterVersion) return;
        rosterMessage = `花名册加载失败：${error instanceof Error ? error.message : String(error)}，可在高级选项替换。`;
        setStatus(rosterMessage, true);
    }
    refresh();
}
async function loadTemplates(): Promise<void> {
    await Promise.all((Object.keys(SECURITY_TEMPLATE_PATHS) as SecurityTemplateKey[]).map(async key => {
        try { templates[key] = await fetchBytes(SECURITY_TEMPLATE_PATHS[key]); }
        catch (error) { templateErrors.set(key, `${error instanceof Error ? error.message : String(error)}，请刷新重试。`); }
        finally { refresh(); }
    }));
}
async function exportFiles(): Promise<void> {
    refresh();
    if (exporting || element("exportButton", HTMLButtonElement).disabled || !canExportSecurity(currentDraft)) return;
    const draft = currentDraft;
    exporting = true; refresh();
    try {
        const files = await buildSecurityFiles(templates, draft);
        const zip = new JSZip();
        files.forEach(file => zip.file(file.fileName, file.bytes));
        const url = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
        const link = document.createElement("a");
        link.href = url; link.download = `安保${draft.kind === "initial" ? "初训" : "复训"}_培训资料.zip`;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setStatus(`已导出 ${files.length} 份资料。试题保持原样，签到资料打印前请核对分页。`);
    } catch (error) { setStatus(`导出失败：${error instanceof Error ? error.message : String(error)}`, true); }
    finally { exporting = false; refresh(); }
}
document.querySelectorAll("[data-refresh]").forEach(node => {
    node.addEventListener("input", refresh); node.addEventListener("change", refresh);
});
element("rosterFile", HTMLInputElement).addEventListener("change", event => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (file) void loadRoster(file);
});
element("exportButton", HTMLButtonElement).addEventListener("click", () => void exportFiles());
refresh();
void loadRoster();
void loadTemplates();
