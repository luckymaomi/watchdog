import type * as XlsxRuntime from "xlsx-js-style";
import { parseRosterRows } from "../../../crew-match-name-id/logic";
import type { CrewRosterEntry } from "../../../crew-match-name-id/models";
import { buildEmergencyDraft } from "./logic";
import { buildEmergencyFile, EMERGENCY_TEMPLATES } from "./export";
import type { EmergencyDraft, EmergencyKind } from "./models";
import { element, renderDraft, setStatus } from "./view";
import { mountDocumentPreview } from "../../document-preview-view";

const XLSX = window.XLSX as unknown as typeof XlsxRuntime;
let roster: CrewRosterEntry[] = [];
const templates: Partial<Record<EmergencyKind, Uint8Array>> = {};
let rosterReady = false;
let rosterLoad = 0;
let exporting = false;
let currentDraft: EmergencyDraft;
const templateErrors = new Map<EmergencyKind, string>();
const preview = mountDocumentPreview(async () => {
    const source = templates[currentDraft.kind];
    if (!rosterReady || !source || element("exportButton", HTMLButtonElement).disabled) throw new Error("请先完成培训参数和人员名单。");
    return [await buildEmergencyFile(source, currentDraft)];
}, XLSX);

function parseRoster(bytes: Uint8Array): CrewRosterEntry[] {
    const workbook = XLSX.read(bytes, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error("花名册没有工作表。");
    const parsed = parseRosterRows(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" }));
    if (!parsed.length) throw new Error("花名册没有可用人员，请检查姓名和员工号表头。");
    return parsed;
}
function refresh(): void {
    currentDraft = buildEmergencyDraft(roster, {
        kind: element("kindInput", HTMLSelectElement).value,
        startDate: element("startDateInput", HTMLInputElement).value,
        location: element("locationInput", HTMLInputElement).value,
        sourceText: element("sourceText", HTMLTextAreaElement).value
    });
    renderDraft(currentDraft, rosterReady && Boolean(templates[currentDraft.kind]), exporting);
    const templateError = templateErrors.get(currentDraft.kind);
    if (templateError) setStatus(templateError, true);
    preview.update(JSON.stringify(currentDraft), !element("exportButton", HTMLButtonElement).disabled);
}
async function fetchBytes(path: string): Promise<Uint8Array> {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`资源加载失败：${path}，请刷新页面重试。`);
    return new Uint8Array(await response.arrayBuffer());
}
async function loadRoster(read: () => Promise<Uint8Array>): Promise<void> {
    const sequence = ++rosterLoad;
    rosterReady = false; roster = []; refresh();
    setStatus("正在加载花名册...");
    try {
        const parsed = parseRoster(await read());
        if (sequence !== rosterLoad) return;
        roster = parsed; rosterReady = true;
        setStatus(`花名册已加载，共 ${roster.length} 人。`);
    } catch (error) {
        if (sequence !== rosterLoad) return;
        setStatus(`花名册加载失败：${error instanceof Error ? error.message : String(error)}`, true);
    } finally { if (sequence === rosterLoad) refresh(); }
}
async function loadTemplates(): Promise<void> {
    await Promise.all((Object.keys(EMERGENCY_TEMPLATES) as EmergencyKind[]).map(async kind => {
        try { templates[kind] = await fetchBytes(EMERGENCY_TEMPLATES[kind]); }
        catch (error) { templateErrors.set(kind, error instanceof Error ? error.message : String(error)); }
        finally { refresh(); }
    }));
}
async function exportFile(): Promise<void> {
    refresh();
    const source = templates[currentDraft.kind];
    if (exporting || !rosterReady || !source || element("exportButton", HTMLButtonElement).disabled) return;
    const draft = currentDraft;
    exporting = true; refresh();
    try {
        const file = await buildEmergencyFile(source, draft);
        const url = URL.createObjectURL(new Blob([new Uint8Array(file.bytes)], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
        const link = document.createElement("a");
        link.href = url; link.download = file.fileName; document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setStatus(`导出完成：${file.fileName}。请用 Word 核对分页及打印效果。`);
    } catch (error) { setStatus(`导出失败：${error instanceof Error ? error.message : String(error)}`, true); }
    finally { exporting = false; refresh(); }
}
document.querySelectorAll("[data-refresh]").forEach(node => {
    node.addEventListener("input", refresh); node.addEventListener("change", refresh);
});
element("rosterFile", HTMLInputElement).addEventListener("change", event => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (file) void loadRoster(async () => new Uint8Array(await file.arrayBuffer()));
});
element("exportButton", HTMLButtonElement).addEventListener("click", () => void exportFile());
refresh();
void loadRoster(() => fetchBytes("../../../template/机组花名册.xlsx"));
void loadTemplates();
