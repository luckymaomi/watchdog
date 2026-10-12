import type * as XlsxRuntime from "xlsx-js-style";

import type { CrmTemplateBuffers, GeneratedWorkbook, TrainingAttendanceDraft } from "./models";

type StyledCell = XlsxRuntime.CellObject & { s?: Record<string, unknown> };

function cloneValue<T>(value: T): T {
    return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

function readWorkbook(XLSX: typeof XlsxRuntime, bytes: Uint8Array): XlsxRuntime.WorkBook {
    const workbook = XLSX.read(bytes, { type: "array", cellStyles: true, cellDates: true });
    workbook.SheetNames.forEach((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet?.["!ref"] || !sheet["!cols"]?.length) return;
        const range = XLSX.utils.decode_range(sheet["!ref"]);
        sheet["!cols"] = sheet["!cols"].slice(0, range.e.c + 1);
    });
    return workbook;
}

function worksheet(workbook: XlsxRuntime.WorkBook): XlsxRuntime.WorkSheet {
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error("CRM 模板缺少工作表。");
    return sheet;
}

function setCell(
    sheet: XlsxRuntime.WorkSheet,
    address: string,
    value: string | number,
    type: "s" | "n" = "s"
): void {
    const existing = sheet[address] as StyledCell | undefined;
    sheet[address] = { ...(existing || {}), t: type, v: value };
    delete (sheet[address] as { w?: string }).w;
}

function clearCell(sheet: XlsxRuntime.WorkSheet, address: string): void {
    setCell(sheet, address, "");
}

function ensureRows(
    XLSX: typeof XlsxRuntime,
    sheet: XlsxRuntime.WorkSheet,
    startRow: number,
    requiredLastRow: number,
    styleSourceRow: number,
    lastColumnIndex: number
): void {
    for (let row = startRow; row <= requiredLastRow; row += 1) {
        if (row <= styleSourceRow) continue;
        for (let column = 0; column <= lastColumnIndex; column += 1) {
            const sourceAddress = XLSX.utils.encode_cell({ r: styleSourceRow - 1, c: column });
            const targetAddress = XLSX.utils.encode_cell({ r: row - 1, c: column });
            const source = sheet[sourceAddress] as StyledCell | undefined;
            sheet[targetAddress] = {
                t: "s",
                v: "",
                ...(source?.s ? { s: cloneValue(source.s) } : {}),
                ...(source?.z ? { z: source.z } : {})
            };
        }
        const rows = (sheet["!rows"] ||= []);
        rows[row - 1] = cloneValue(rows[styleSourceRow - 1] || {});
    }
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
    range.e.r = Math.max(range.e.r, requiredLastRow - 1);
    sheet["!ref"] = XLSX.utils.encode_range(range);
}

function locationSuffix(sheet: XlsxRuntime.WorkSheet): string {
    const current = String(sheet.C3?.v || "");
    const matched = current.match(/[；;](.+)$/);
    return matched?.[1]?.trim() || "广州从化壹泉湾温泉酒店";
}

function fillBooking(
    XLSX: typeof XlsxRuntime,
    workbook: XlsxRuntime.WorkBook,
    draft: TrainingAttendanceDraft
): void {
    const sheet = worksheet(workbook);
    const lastRow = Math.max(4, draft.participants.length + 2);
    ensureRows(XLSX, sheet, 3, lastRow, 4, 9);
    for (let row = 3; row <= lastRow; row += 1) {
        for (let column = 0; column <= 9; column += 1) {
            clearCell(sheet, XLSX.utils.encode_cell({ r: row - 1, c: column }));
        }
    }
    setCell(sheet, "A1", `南货航开班${draft.sessionLabel}CRM培训名单（广州壹泉湾温泉酒店）`);
    setCell(sheet, "K3", [draft.instructor1, draft.instructor2, draft.instructor3].join("、"));
    draft.participants.forEach((person, index) => {
        const row = index + 3;
        setCell(sheet, `A${row}`, index + 1, "n");
        setCell(sheet, `B${row}`, "南货航飞行部");
        setCell(sheet, `C${row}`, draft.sessionLabel);
        setCell(sheet, `D${row}`, draft.startDate);
        setCell(sheet, `E${row}`, draft.endDate);
        setCell(sheet, `F${row}`, person.name);
        setCell(sheet, `G${row}`, person.employeeId);
        setCell(sheet, `H${row}`, person.rank);
        setCell(sheet, `I${row}`, 777, "n");
        clearCell(sheet, `J${row}`);
    });
}

function fillAttendance(
    XLSX: typeof XlsxRuntime,
    workbook: XlsxRuntime.WorkBook,
    draft: TrainingAttendanceDraft,
    day: 1 | 2
): void {
    const sheet = worksheet(workbook);
    const lastRow = Math.max(10, draft.participants.length + 8);
    ensureRows(XLSX, sheet, 9, lastRow, 10, 4);
    for (let row = 9; row <= lastRow; row += 1) {
        for (let column = 0; column <= 4; column += 1) {
            clearCell(sheet, XLSX.utils.encode_cell({ r: row - 1, c: column }));
        }
    }
    const date = day === 1 ? draft.startDate : draft.endDate;
    const instructors = day === 1
        ? [draft.instructor1, draft.instructor2]
        : [draft.instructor1, draft.instructor2, draft.instructor3];
    setCell(sheet, "C2", `CRM年度培训（${draft.sessionLabel}）`);
    setCell(sheet, "C3", `${date}；${locationSuffix(sheet)}`);
    setCell(sheet, "C5", instructors.join("、"));
    draft.participants.forEach((person, index) => {
        const row = index + 9;
        setCell(sheet, `A${row}`, index + 1, "n");
        setCell(sheet, `B${row}`, person.employeeId);
        setCell(sheet, `C${row}`, person.name);
        clearCell(sheet, `D${row}`);
        clearCell(sheet, `E${row}`);
    });
}

function safeFilePart(value: string): string {
    return value.replace(/[\\/:*?"<>|]/g, "_").trim();
}

export function createTrainingAttendanceExporter(XLSX: typeof XlsxRuntime) {
    function buildCrmWorkbooks(templates: CrmTemplateBuffers, draft: TrainingAttendanceDraft): GeneratedWorkbook[] {
        const booking = readWorkbook(XLSX, templates.booking);
        const attendanceDay1 = readWorkbook(XLSX, templates.attendanceDay1);
        const attendanceDay2 = readWorkbook(XLSX, templates.attendanceDay2);
        fillBooking(XLSX, booking, draft);
        fillAttendance(XLSX, attendanceDay1, draft, 1);
        fillAttendance(XLSX, attendanceDay2, draft, 2);
        const session = safeFilePart(draft.sessionLabel);
        return [
            { fileName: `CRM（${session}）预订报名表.xlsx`, workbook: booking },
            { fileName: `CRM年度培训（${session}）签到表1.xlsx`, workbook: attendanceDay1 },
            { fileName: `CRM年度培训（${session}）签到表2.xlsx`, workbook: attendanceDay2 }
        ];
    }

    return { buildCrmWorkbooks };
}
