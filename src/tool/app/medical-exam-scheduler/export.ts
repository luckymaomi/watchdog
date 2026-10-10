import type * as XlsxRuntime from "xlsx-js-style";

import type { CandidateHeaderIndexes, MedicalExamPerson } from "./models";

type XlsxApi = typeof XlsxRuntime;

const NO_BORDER = {
    top: { style: "none" },
    bottom: { style: "none" },
    left: { style: "none" },
    right: { style: "none" }
};

const BODY_STYLE = {
    font: {},
    fill: {},
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: NO_BORDER
};

const HEADER_STYLE = {
    font: { bold: true },
    fill: {},
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: NO_BORDER
};

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

    function styleCandidateSheet(
        sheet: XlsxRuntime.WorkSheet,
        range: XlsxRuntime.Range,
        headerRow: number,
        lastColumn: number,
        indexes: CandidateHeaderIndexes
    ): void {
        const rows = Array.from({ length: range.e.r + 1 }, (_, row) => ({ hpt: row === headerRow ? 26 : 22 }));
        const widths = Array.from({ length: range.e.c + 1 }, () => ({ wch: 16 }));
        widths[indexes.employeeId] = { wch: 14 };
        widths[indexes.name] = { wch: 24 };
        widths[indexes.examDate] = { wch: 16 };
        widths[indexes.note] = { wch: 24 };
        widths[lastColumn] = { wch: 24 };
        for (let row = headerRow; row <= range.e.r; row += 1) {
            for (let column = range.s.c; column <= range.e.c; column += 1) {
                const address = XLSX.utils.encode_cell({ r: row, c: column });
                const cell = sheet[address];
                if (!cell) continue;
                cell.s = row === headerRow ? HEADER_STYLE : BODY_STYLE;
            }
        }
        sheet["!rows"] = rows;
        sheet["!cols"] = widths;
        sheet["!autofilter"] = { ref: XLSX.utils.encode_range(range) };
        sheet["!margins"] = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
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
        const headerRow = headerRowIndex;

        people.forEach((person) => {
            const rowIndex = person.sourceRow - 1;
            const examCellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: indexes.examDate });
            const noteCellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: indexes.note });
            const date = parseDateKey(person.examDate);
            sheet[examCellAddress] = date
                ? { t: "d", v: date, z: "yyyy-mm-dd" }
                : { t: "s", v: "" };
            const existingNote = String(sheet[noteCellAddress]?.v || "").trim();
            const note = [...new Set([existingNote, person.note, ...person.adjustmentNotes].filter(Boolean))].join("；");
            sheet[noteCellAddress] = { t: "s", v: note };
        });

        range.e.r = Math.max(range.e.r, ...people.map((person) => person.sourceRow - 1), headerRow);
        sheet["!ref"] = XLSX.utils.encode_range(range);
        styleCandidateSheet(sheet, range, headerRow, range.e.c, indexes);
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
