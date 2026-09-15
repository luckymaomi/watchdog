import type * as XlsxRuntime from "xlsx-js-style";

import { analyzeStrengthRows, findStrengthHeader, REQUIRED_HEADERS } from "./logic";
import type { StrengthSnapshot } from "./models";

function worksheetRows(
    XLSX: typeof XlsxRuntime,
    worksheet: XlsxRuntime.WorkSheet
): unknown[][] {
    return XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
        header: 1,
        raw: true,
        defval: null,
        blankrows: false
    }) as unknown[][];
}

export function findStrengthWorksheet(
    XLSX: typeof XlsxRuntime,
    workbook: XlsxRuntime.WorkBook
): { sheetName: string; rows: unknown[][] } {
    for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) continue;
        const rows = worksheetRows(XLSX, worksheet);
        if (findStrengthHeader(rows)) return { sheetName, rows };
    }
    throw new Error(`未找到同时包含 ${REQUIRED_HEADERS.join("、")} 的数据表。`);
}

export async function readStrengthSnapshotFromFile(
    XLSX: typeof XlsxRuntime,
    file: File,
    id: string
): Promise<StrengthSnapshot> {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array", cellDates: true });
    const match = findStrengthWorksheet(XLSX, workbook);
    return analyzeStrengthRows(match.rows, {
        id,
        fileName: file.name,
        sheetName: match.sheetName
    });
}
