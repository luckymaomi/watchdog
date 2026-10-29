import type * as XlsxRuntime from "xlsx-js-style";
import JSZip from "jszip";
import { parseRosterRows } from "../../../crew-match-name-id/logic";
import type { CrewRosterEntry } from "../../../crew-match-name-id/models";
import { buildDangerousGoodsFiles } from "./export";
import { DangerousGoodsLogic } from "./logic";
import type { DangerousGoodsDraft, DangerousGoodsInput, DangerousGoodsTemplates } from "./models";
import * as view from "./view";
import { mountDocumentPreview } from "../../document-preview-view";

const ROSTER_PATH = "../../../template/机组花名册.xlsx";
const TEMPLATE_ROOT = "../../../template/training-attendance/dangerous-goods";
const TEMPLATE_PATHS = {
    instructorSurvey: `${TEMPLATE_ROOT}/instructor-survey.docx`, attitude: `${TEMPLATE_ROOT}/attitude.docx`,
    postSurvey: `${TEMPLATE_ROOT}/post-survey.docx`, simulation: `${TEMPLATE_ROOT}/simulation.docx`,
    exam: `${TEMPLATE_ROOT}/exam.docx`, attendance: `${TEMPLATE_ROOT}/attendance.docx`
} as const;
const XLSX = window.XLSX as unknown as typeof XlsxRuntime;
let roster: CrewRosterEntry[] = [];
let templates: DangerousGoodsTemplates | null = null;
let currentDraft: DangerousGoodsDraft | null = null;
let exporting = false;
const preview = mountDocumentPreview(async () => {
    if (!templates || !currentDraft || !DangerousGoodsLogic.canExportDangerousGoods(currentDraft)) throw new Error("请先完成培训参数和人员名单。");
    return buildDangerousGoodsFiles(templates, currentDraft);
}, XLSX);

function workbookRows(bytes: Uint8Array): unknown[][] {
    const workbook = XLSX.read(bytes, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
}
async function fetchBytes(path: string): Promise<Uint8Array> {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`资源加载失败：${path}`);
    return new Uint8Array(await response.arrayBuffer());
}
function value(id: string): string { return view.requireElement(id, HTMLInputElement).value; }
function formInput(): DangerousGoodsInput {
    return { sourceText: view.requireElement("sourceText", HTMLTextAreaElement).value, instructor: value("instructorInput"), trainingDate: value("trainingDateInput"), taskDate: value("taskDateInput"), examDate: value("examDateInput"), location: value("locationInput") };
}
function refresh(): void {
    currentDraft = DangerousGoodsLogic.buildDangerousGoodsDraft(roster, formInput());
    view.renderDraft(currentDraft, Boolean(templates), exporting);
    preview.update(JSON.stringify(currentDraft), !view.requireElement("exportButton", HTMLButtonElement).disabled);
}
async function loadDefaults(): Promise<void> {
    try {
        view.setStatus("正在加载默认花名册和危险品复训模板...");
        const [rosterBytes, instructorSurvey, attitude, postSurvey, simulation, exam, attendance] = await Promise.all([
            fetchBytes(ROSTER_PATH), fetchBytes(TEMPLATE_PATHS.instructorSurvey), fetchBytes(TEMPLATE_PATHS.attitude), fetchBytes(TEMPLATE_PATHS.postSurvey), fetchBytes(TEMPLATE_PATHS.simulation), fetchBytes(TEMPLATE_PATHS.exam), fetchBytes(TEMPLATE_PATHS.attendance)
        ]);
        roster = parseRosterRows(workbookRows(rosterBytes));
        templates = { instructorSurvey, attitude, postSurvey, simulation, exam, attendance };
        view.setStatus(`默认数据已加载，共 ${roster.length} 人。`, "success");
        refresh();
    } catch (error) { view.setStatus(error instanceof Error ? error.message : String(error), "danger"); }
}
async function replaceRoster(file: File): Promise<void> {
    try {
        roster = parseRosterRows(workbookRows(new Uint8Array(await file.arrayBuffer())));
        view.setStatus(`已替换花名册：${roster.length} 人。`, "success");
        refresh();
    } catch (error) { view.setStatus(`花名册解析失败：${error instanceof Error ? error.message : String(error)}`, "danger"); }
}
function download(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}
async function exportFiles(): Promise<void> {
    if (exporting || !templates || !currentDraft || !DangerousGoodsLogic.canExportDangerousGoods(currentDraft)) return;
    exporting = true; refresh();
    const draft = currentDraft; const source = templates;
    try {
        const zip = new JSZip();
        const files = await buildDangerousGoodsFiles(source, draft);
        files.forEach((file) => zip.file(file.fileName, file.bytes));
        const blob = await zip.generateAsync({ type: "blob" });
        download(blob, "危险品复训资料.zip");
        view.setStatus(`导出完成，共 ${files.length} 份 Word。`, "success");
    } catch (error) { view.setStatus(`导出失败：${error instanceof Error ? error.message : String(error)}`, "danger"); }
    finally { exporting = false; refresh(); }
}
document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-refresh]").forEach((element) => { element.addEventListener("input", refresh); element.addEventListener("change", refresh); });
view.requireElement("rosterFile", HTMLInputElement).addEventListener("change", (event) => { const file = (event.currentTarget as HTMLInputElement).files?.[0]; if (file) void replaceRoster(file); });
view.requireElement("exportButton", HTMLButtonElement).addEventListener("click", () => void exportFiles());
refresh();
void loadDefaults();
