import type * as XlsxRuntime from "xlsx-js-style";
import JSZip from "jszip";

import { parseRosterRows } from "../crew-match-name-id/logic";
import type { CrewRosterEntry } from "../crew-match-name-id/models";
import { buildCrmFiles } from "./export";
import { TrainingAttendanceLogic as logic } from "./logic";
import type { CrmTemplateBuffers, TrainingAttendanceDraft, TrainingAttendanceInput } from "./models";
import * as view from "./view";

const ROSTER_PATH = "../../../template/机组花名册.xlsx";
const TEMPLATE_PATHS = {
    booking: "../../../template/training-attendance/crm/booking.xlsx",
    attendanceDay1: "../../../template/training-attendance/crm/attendance-day1.xlsx",
    attendanceDay2: "../../../template/training-attendance/crm/attendance-day2.xlsx"
} as const;
const XLSX = window.XLSX as unknown as typeof XlsxRuntime;

let roster: CrewRosterEntry[] = [];
let templates: CrmTemplateBuffers | null = null;
let currentDraft: TrainingAttendanceDraft | null = null;
let exporting = false;

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

function inputValue(id: string): string {
    return view.requireElement(id, HTMLInputElement).value;
}

function formInput(): TrainingAttendanceInput {
    return {
        sourceText: view.requireElement("sourceText", HTMLTextAreaElement).value,
        session: inputValue("sessionInput"),
        startDate: inputValue("startDateInput"),
        endDate: inputValue("endDateInput"),
        instructor1: inputValue("instructor1Input"),
        instructor2: inputValue("instructor2Input"),
        instructor3: inputValue("instructor3Input")
    };
}

function refresh(): void {
    currentDraft = logic.buildTrainingAttendanceDraft(roster, formInput());
    view.renderDraft(currentDraft, Boolean(templates));
    if (exporting) view.requireElement("exportButton", HTMLButtonElement).disabled = true;
}

async function loadDefaults(): Promise<void> {
    try {
        view.setStatus("正在加载默认花名册和 CRM 模板...");
        const [rosterBytes, booking, attendanceDay1, attendanceDay2] = await Promise.all([
            fetchBytes(ROSTER_PATH),
            fetchBytes(TEMPLATE_PATHS.booking),
            fetchBytes(TEMPLATE_PATHS.attendanceDay1),
            fetchBytes(TEMPLATE_PATHS.attendanceDay2)
        ]);
        roster = parseRosterRows(workbookRows(rosterBytes));
        templates = { booking, attendanceDay1, attendanceDay2 };
        view.setStatus(`默认数据已加载，共 ${roster.length} 人。`, "success");
        refresh();
    } catch (error) {
        view.setStatus(error instanceof Error ? error.message : String(error), "danger");
    }
}

async function replaceRoster(file: File): Promise<void> {
    try {
        roster = parseRosterRows(workbookRows(new Uint8Array(await file.arrayBuffer())));
        view.setStatus(`已替换花名册：${roster.length} 人。`, "success");
        refresh();
    } catch (error) {
        view.setStatus(`花名册解析失败：${error instanceof Error ? error.message : String(error)}`, "danger");
    }
}

function safeZipName(sessionLabel: string): string {
    return `CRM${sessionLabel}_培训签到表.zip`.replace(/[\\/:*?"<>|]/g, "_");
}

function downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

async function exportFiles(): Promise<void> {
    if (exporting || !templates || !currentDraft || !logic.canExportTrainingAttendance(currentDraft)) return;
    exporting = true;
    const button = view.requireElement("exportButton", HTMLButtonElement);
    button.disabled = true;
    button.textContent = "正在生成...";
    const draft = currentDraft;
    const templateBuffers = templates;
    try {
        const zip = new JSZip();
        const files = await buildCrmFiles(templateBuffers, draft);
        files.forEach((item) => {
            zip.file(item.fileName, item.bytes);
        });
        const blob = await zip.generateAsync({ type: "blob" });
        downloadBlob(blob, safeZipName(draft.sessionLabel));
        view.setStatus("导出完成。", "success");
    } catch (error) {
        view.setStatus(`导出失败：${error instanceof Error ? error.message : String(error)}`, "danger");
    } finally {
        exporting = false;
        button.textContent = "导出";
        refresh();
    }
}

document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-refresh]").forEach((element) => {
    element.addEventListener("input", refresh);
    element.addEventListener("change", refresh);
});
view.requireElement("rosterFile", HTMLInputElement).addEventListener("change", (event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (file) void replaceRoster(file);
});
view.requireElement("exportButton", HTMLButtonElement).addEventListener("click", () => void exportFiles());

refresh();
void loadDefaults();
