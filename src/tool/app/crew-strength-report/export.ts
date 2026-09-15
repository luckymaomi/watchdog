import type * as XlsxRuntime from "xlsx-js-style";

import { METRIC_DEFINITIONS, buildComparisonMatrix } from "./logic";
import type { StrengthSnapshot, StrengthTechnicalCategory } from "./models";

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

export function buildCategoryComparisonExportRows(
    snapshots: readonly StrengthSnapshot[]
): Array<Array<string | number>> {
    const matrix = buildComparisonMatrix(
        snapshots,
        new Set(METRIC_DEFINITIONS.map(({ key }) => key))
    );
    return [
        ["类别", ...matrix.series.map(({ label }) => label)],
        ...matrix.categories.map((category, categoryIndex) => [
            category.label,
            ...matrix.series.map(({ values }) => values[categoryIndex])
        ])
    ];
}

const TECHNICAL_CATEGORY_LABELS: Record<StrengthTechnicalCategory, string> = {
    instructor: "教员",
    captain: "机长",
    firstOfficer: "副驾驶"
};

export function buildTechnicalDetailExportRows(
    snapshots: readonly StrengthSnapshot[]
): Array<Array<string | number>> {
    return [
        ["快照", "技术大类", "技术细分类", "人数"],
        ...snapshots.flatMap((snapshot) => snapshot.technicalDetails.map((detail) => [
            snapshot.label,
            TECHNICAL_CATEGORY_LABELS[detail.category],
            detail.label,
            detail.count
        ]))
    ];
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
    const comparisonSheet = XLSX.utils.aoa_to_sheet(buildCategoryComparisonExportRows(snapshots));
    const technicalDetailSheet = XLSX.utils.aoa_to_sheet(buildTechnicalDetailExportRows(snapshots));
    setColumnWidths(snapshotSheet, [8, 14, 34, 16, 10, 10, 12, 10, 10, 10, 20, 20, 20]);
    setColumnWidths(comparisonSheet, [22, ...snapshots.map(() => 16)]);
    setColumnWidths(technicalDetailSheet, [16, 14, 24, 10]);
    XLSX.utils.book_append_sheet(workbook, snapshotSheet, "快照统计");
    XLSX.utils.book_append_sheet(workbook, comparisonSheet, "分类对比");
    XLSX.utils.book_append_sheet(workbook, technicalDetailSheet, "技术细分");
    return workbook;
}

export function buildStrengthExportFileName(currentSnapshot: StrengthSnapshot): string {
    const safeLabel = currentSnapshot.label.replace(/[\\/:*?"<>|]/g, "-");
    return `飞行实力周报_${safeLabel}.xlsx`;
}
