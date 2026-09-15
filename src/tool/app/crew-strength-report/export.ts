import type * as XlsxRuntime from "xlsx-js-style";

import { METRIC_DEFINITIONS } from "./logic";
import type { StrengthSnapshot } from "./models";

const SNAPSHOT_HEADERS = [
    "顺序",
    "快照",
    "源文件",
    "数据表",
    "数据行",
    "非运行",
    "运行人员",
    "教员",
    "机长",
    "副驾驶",
    "北美带队（RAMA）",
    "欧洲带队（REUO）",
    "技术信息未识别"
];

export function buildSnapshotExportRows(snapshots: readonly StrengthSnapshot[]): Array<Array<string | number>> {
    return [
        SNAPSHOT_HEADERS,
        ...snapshots.map((snapshot, index) => [
            index + 1,
            snapshot.label,
            snapshot.fileName,
            snapshot.sheetName,
            snapshot.totalDataRows,
            snapshot.excludedRows,
            snapshot.metrics.operationalTotal,
            snapshot.metrics.instructor,
            snapshot.metrics.captain,
            snapshot.metrics.firstOfficer,
            snapshot.metrics.northAmericaLeader,
            snapshot.metrics.europeLeader,
            snapshot.unclassifiedOperationalRows
        ])
    ];
}

export function buildChangeExportRows(snapshots: readonly StrengthSnapshot[]): Array<Array<string | number>> {
    const rows: Array<Array<string | number>> = [
        ["从", "到", ...METRIC_DEFINITIONS.map(({ label }) => label)]
    ];
    for (let index = 1; index < snapshots.length; index += 1) {
        const previous = snapshots[index - 1];
        const current = snapshots[index];
        rows.push([
            previous.label,
            current.label,
            ...METRIC_DEFINITIONS.map(({ key }) => current.metrics[key] - previous.metrics[key])
        ]);
    }
    return rows;
}

function setColumnWidths(worksheet: XlsxRuntime.WorkSheet, widths: number[]): void {
    worksheet["!cols"] = widths.map((wch) => ({ wch }));
}

export function buildStrengthExportWorkbook(
    XLSX: typeof XlsxRuntime,
    snapshots: readonly StrengthSnapshot[]
): XlsxRuntime.WorkBook {
    if (!snapshots.length) throw new Error("没有可导出的实力表统计。");
    const workbook = XLSX.utils.book_new();
    const snapshotSheet = XLSX.utils.aoa_to_sheet(buildSnapshotExportRows(snapshots));
    const changeSheet = XLSX.utils.aoa_to_sheet(buildChangeExportRows(snapshots));
    setColumnWidths(snapshotSheet, [8, 14, 34, 16, 10, 10, 12, 10, 10, 10, 20, 20, 20]);
    setColumnWidths(changeSheet, [14, 14, 12, 10, 10, 10, 20, 20]);
    XLSX.utils.book_append_sheet(workbook, snapshotSheet, "快照统计");
    XLSX.utils.book_append_sheet(workbook, changeSheet, "相邻变化");
    return workbook;
}

export function buildStrengthExportFileName(currentSnapshot: StrengthSnapshot): string {
    const safeLabel = currentSnapshot.label.replace(/[\\/:*?"<>|]/g, "-");
    return `飞行实力周报_${safeLabel}.xlsx`;
}
