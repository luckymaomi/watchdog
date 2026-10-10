import type * as XlsxRuntime from "xlsx-js-style";

import type { CandidateHeaderIndexes, MedicalExamPerson } from "./models";

type XlsxApi = typeof XlsxRuntime;

function parseDateKey(value: string): Date | null {
    const matched = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!matched) return null;
    return new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]), 12);
}

export function createMedicalExamExporter(XLSX: XlsxApi) {
    function cloneValue<T>(value: T): T {
        if (typeof structuredClone === "function") return structuredClone(value);
        return JSON.parse(JSON.stringify(value)) as T;
    }

    function cloneWorkbook(workbook: XlsxRuntime.WorkBook): XlsxRuntime.WorkBook {
        return {
            ...workbook,
            SheetNames: [...workbook.SheetNames],
            Sheets: { ...workbook.Sheets }
        };
    }

    function buildExportWorkbook(
        sourceWorkbook: XlsxRuntime.WorkBook,
        candidateSheetName: string,
        headerRowIndex: number,
        indexes: CandidateHeaderIndexes,
        people: MedicalExamPerson[]
    ): XlsxRuntime.WorkBook {
        const output = cloneWorkbook(sourceWorkbook);
        const sourceSheet = output.Sheets[candidateSheetName];
        if (!sourceSheet) throw new Error(`导出时找不到工作表：${candidateSheetName}。`);
        const sheet = cloneValue(sourceSheet);
        output.Sheets[candidateSheetName] = sheet;
        const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
        const firstAppendColumn = range.e.c + 1;
        const lockColumn = indexes.lockStatus ?? firstAppendColumn;
        const notesColumn = indexes.adjustmentNotes ?? Math.max(firstAppendColumn + (indexes.lockStatus === undefined ? 1 : 0), lockColumn + 1);
        const headerRow = headerRowIndex;
        sheet[XLSX.utils.encode_cell({ r: headerRow, c: lockColumn })] = { t: "s", v: "锁班状态" };
        sheet[XLSX.utils.encode_cell({ r: headerRow, c: notesColumn })] = { t: "s", v: "调整说明" };

        people.forEach((person) => {
            const rowIndex = person.sourceRow - 1;
            const examCellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: indexes.examDate });
            const date = parseDateKey(person.examDate);
            sheet[examCellAddress] = date
                ? { t: "d", v: date, z: "yyyy-mm-dd" }
                : { t: "s", v: "" };
            sheet[XLSX.utils.encode_cell({ r: rowIndex, c: lockColumn })] = { t: "s", v: person.locked ? "已锁" : "未锁" };
            sheet[XLSX.utils.encode_cell({ r: rowIndex, c: notesColumn })] = { t: "s", v: person.adjustmentNotes.join("；") };
        });

        range.e.r = Math.max(range.e.r, ...people.map((person) => person.sourceRow - 1), headerRow);
        range.e.c = Math.max(range.e.c, lockColumn, notesColumn);
        sheet["!ref"] = XLSX.utils.encode_range(range);
        return output;
    }

    function exportWorkbook(
        sourceWorkbook: XlsxRuntime.WorkBook,
        sourceFileName: string,
        candidateSheetName: string,
        headerRowIndex: number,
        indexes: CandidateHeaderIndexes,
        people: MedicalExamPerson[]
    ): void {
        const output = buildExportWorkbook(sourceWorkbook, candidateSheetName, headerRowIndex, indexes, people);
        const baseName = sourceFileName.replace(/\.[^.]+$/, "") || "体检排班";
        XLSX.writeFile(output, `${baseName}_体检预排.xlsx`, { bookType: "xlsx", cellStyles: true });
    }

    return { buildExportWorkbook, exportWorkbook };
}
