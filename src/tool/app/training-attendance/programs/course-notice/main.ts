import type * as XlsxRuntime from "xlsx-js-style";
import { parseRosterRows } from "../../../crew-match-name-id/logic";
import type { CrewRosterEntry } from "../../../crew-match-name-id/models";
import { buildCourseNoticeFile, COURSE_NOTICE_TEMPLATES } from "./export";
import { buildCourseNoticeDraft, canExportCourseNotice } from "./logic";
import type { CourseNoticeDraft, CourseNoticeInput } from "./models";
import * as view from "./view";

const ROSTER_PATH = "../../../template/机组花名册.xlsx";
const XLSX = window.XLSX as unknown as typeof XlsxRuntime;
let roster: CrewRosterEntry[] = [];
let rosterReady = false;
let rosterError = "正在加载花名册。";
let rosterVersion = 0;
const templates = new Map<string, Uint8Array>();
const templateErrors = new Map<string, string>();
let draft: CourseNoticeDraft;
let exporting = false;

function value(id: string): string { return view.requireElement(id, HTMLInputElement).value; }
function input(): CourseNoticeInput {
    return {
        role: view.requireElement("roleInput", HTMLSelectElement).value,
        year: value("yearInput"), period: value("periodInput"), addressee: value("addresseeInput"), participantUnit: value("participantUnitInput"),
        classNumber: value("classNumberInput"), startDate: value("startDateInput"), endDate: value("endDateInput"), issueDate: value("issueDateInput"),
        sourceText: view.requireElement("sourceText", HTMLTextAreaElement).value
    };
}
function refresh(): void {
    draft = buildCourseNoticeDraft(roster, input());
    const messages: string[] = [];
    if (!rosterReady) messages.push(rosterError);
    if (!templates.has(draft.role)) messages.push(templateErrors.get(draft.role) || "正在加载通知模板。");
    view.renderDraft(draft, rosterReady && templates.has(draft.role), exporting, messages);
}
async function fetchBytes(path: string): Promise<Uint8Array> {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`资源加载失败：${path}`);
    return new Uint8Array(await response.arrayBuffer());
}
function readRoster(bytes: Uint8Array): CrewRosterEntry[] {
    const book = XLSX.read(bytes, { type: "array" });
    const sheet = book.Sheets[book.SheetNames[0]];
    const entries = parseRosterRows(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" }));
    if (!entries.length) throw new Error("花名册没有有效人员，请检查员工号、姓名、分部表头和数据。");
    return entries;
}
async function loadRoster(file?: File): Promise<void> {
    const version = ++rosterVersion;
    roster = []; rosterReady = false; rosterError = "正在加载花名册。"; refresh();
    try {
        const bytes = file ? new Uint8Array(await file.arrayBuffer()) : await fetchBytes(ROSTER_PATH);
        if (version !== rosterVersion) return;
        roster = readRoster(bytes); rosterReady = true; rosterError = "";
        view.setStatus(`花名册已加载，共 ${roster.length} 条人员记录。`);
    } catch (error) {
        if (version !== rosterVersion) return;
        rosterError = `花名册加载失败：${error instanceof Error ? error.message : String(error)}，可在高级选项替换。`;
        view.setStatus(rosterError, true);
    }
    refresh();
}
async function loadTemplates(): Promise<void> {
    const results = await Promise.allSettled(Object.entries(COURSE_NOTICE_TEMPLATES).map(async ([role, path]) => ({ role, bytes: await fetchBytes(path) })));
    results.forEach((result, index) => {
        const role = Object.keys(COURSE_NOTICE_TEMPLATES)[index];
        if (result.status === "fulfilled") templates.set(role, result.value.bytes);
        else templateErrors.set(role, `通知模板加载失败：${role}，请刷新页面重试。`);
    });
    refresh();
}
function download(bytes: Uint8Array, fileName: string): void {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
    const anchor = document.createElement("a");
    try {
        anchor.href = url; anchor.download = fileName; document.body.appendChild(anchor); anchor.click();
    } finally {
        anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}
async function exportNotice(): Promise<void> {
    refresh();
    const source = templates.get(draft.role);
    if (exporting || !rosterReady || !source || !canExportCourseNotice(draft)) return;
    const snapshot = draft;
    exporting = true; refresh();
    try {
        const file = await buildCourseNoticeFile(source, snapshot);
        download(file.bytes, file.fileName);
        view.setStatus(`已导出${snapshot.role}开课通知，共 ${snapshot.participants.length} 人。`);
    } catch (error) {
        view.setStatus(`导出失败：${error instanceof Error ? error.message : String(error)}`, true);
    } finally { exporting = false; refresh(); }
}

const today = new Date();
view.requireElement("yearInput", HTMLInputElement).value = String(today.getFullYear());
view.requireElement("issueDateInput", HTMLInputElement).value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("[data-refresh]").forEach(element => {
    element.addEventListener("input", refresh); element.addEventListener("change", refresh);
});
view.requireElement("rosterFile", HTMLInputElement).addEventListener("change", event => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (file) void loadRoster(file);
});
view.requireElement("exportButton", HTMLButtonElement).addEventListener("click", () => void exportNotice());
refresh();
void loadRoster();
void loadTemplates();
