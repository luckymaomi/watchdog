import type {
    StrengthComparisonMatrix,
    StrengthMetricDefinition,
    StrengthMetricKey,
    StrengthSnapshot,
    StrengthSnapshotMeta,
    StrengthTechnicalCategory,
    StrengthTechnicalDetail
} from "./models";

export const REQUIRED_HEADERS = ["技术信息", "是否运行", "RAMA", "REUO"] as const;

export const METRIC_DEFINITIONS: readonly StrengthMetricDefinition[] = [
    { key: "operationalTotal", label: "运行人员" },
    { key: "instructor", label: "教员" },
    { key: "captain", label: "机长" },
    { key: "firstOfficer", label: "副驾驶" },
    { key: "northAmericaLeader", label: "北美带队（RAMA）" },
    { key: "europeLeader", label: "欧洲带队（REUO）" }
];

interface HeaderMatch {
    rowIndex: number;
    indexes: Record<(typeof REQUIRED_HEADERS)[number], number>;
}

function normalizeCell(value: unknown): string {
    if (value === null || value === undefined) return "";
    return String(value).trim();
}

function rowHasData(row: unknown[]): boolean {
    return row.some((value) => normalizeCell(value) !== "");
}

export function findStrengthHeader(rows: unknown[][]): HeaderMatch | null {
    const searchLimit = Math.min(rows.length, 20);
    for (let rowIndex = 0; rowIndex < searchLimit; rowIndex += 1) {
        const headerIndexes = new Map<string, number>();
        rows[rowIndex].forEach((value, columnIndex) => {
            const header = normalizeCell(value);
            if (header && !headerIndexes.has(header)) headerIndexes.set(header, columnIndex);
        });
        if (!REQUIRED_HEADERS.every((header) => headerIndexes.has(header))) continue;

        return {
            rowIndex,
            indexes: Object.fromEntries(
                REQUIRED_HEADERS.map((header) => [header, headerIndexes.get(header) as number])
            ) as HeaderMatch["indexes"]
        };
    }
    return null;
}

const TECHNICAL_CATEGORY_ORDER: readonly StrengthTechnicalCategory[] = ["instructor", "captain", "firstOfficer"];

function classifyTechnicalInformation(value: unknown): StrengthTechnicalCategory | null {
    const text = normalizeCell(value);
    if (text.includes("飞行教员") || text.includes("教员")) return "instructor";
    if (text.includes("副驾驶")) return "firstOfficer";
    if (text.includes("机长")) return "captain";
    return null;
}

function technicalDetailLabel(value: unknown): string {
    return normalizeCell(value).replace(/^.*?[:：]\s*/, "");
}

function sortTechnicalDetails(details: StrengthTechnicalDetail[]): StrengthTechnicalDetail[] {
    return details.sort((left, right) => {
        const categoryDifference = TECHNICAL_CATEGORY_ORDER.indexOf(left.category)
            - TECHNICAL_CATEGORY_ORDER.indexOf(right.category);
        if (categoryDifference) return categoryDifference;
        return left.label.localeCompare(right.label, "zh-CN", { numeric: true, sensitivity: "base" });
    });
}

function hasQualification(value: unknown): boolean {
    const text = normalizeCell(value).toLowerCase();
    return text !== "" && !["0", "否", "无", "不适用", "false", "no"].includes(text);
}

function validDateParts(year: number, month: number, day: number): boolean {
    if (year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1) return false;
    return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function buildSnapshotLabel(fileName: string): string {
    const baseName = fileName.replace(/\.[^.]+$/, "");
    const match = baseName.match(/(20\d{2})(\d{2})(\d{2})/);
    if (!match) return baseName;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!validDateParts(year, month, day)) return baseName;
    return `${match[1]}-${match[2]}-${match[3]}`;
}

export function analyzeStrengthRows(rows: unknown[][], meta: StrengthSnapshotMeta): StrengthSnapshot {
    const header = findStrengthHeader(rows);
    if (!header) {
        throw new Error(`未找到完整表头：${REQUIRED_HEADERS.join("、")}`);
    }

    const dataRows = rows.slice(header.rowIndex + 1).filter(rowHasData);
    const metrics = {
        operationalTotal: 0,
        instructor: 0,
        captain: 0,
        firstOfficer: 0,
        northAmericaLeader: 0,
        europeLeader: 0
    };
    let unclassifiedOperationalRows = 0;
    const technicalDetailCounts = new Map<string, StrengthTechnicalDetail>();

    dataRows.forEach((row) => {
        if (normalizeCell(row[header.indexes["是否运行"]]) !== "是") return;
        metrics.operationalTotal += 1;

        const technicalInformation = row[header.indexes["技术信息"]];
        const category = classifyTechnicalInformation(technicalInformation);
        if (category) {
            metrics[category] += 1;
            const label = technicalDetailLabel(technicalInformation);
            const key = `${category}\u0000${label}`;
            const detail = technicalDetailCounts.get(key);
            if (detail) detail.count += 1;
            else technicalDetailCounts.set(key, { category, label, count: 1 });
        } else {
            unclassifiedOperationalRows += 1;
        }

        if (hasQualification(row[header.indexes.RAMA])) metrics.northAmericaLeader += 1;
        if (hasQualification(row[header.indexes.REUO])) metrics.europeLeader += 1;
    });

    return {
        ...meta,
        label: buildSnapshotLabel(meta.fileName),
        totalDataRows: dataRows.length,
        excludedRows: dataRows.length - metrics.operationalTotal,
        unclassifiedOperationalRows,
        technicalDetails: sortTechnicalDetails([...technicalDetailCounts.values()]),
        metrics
    };
}

export function buildComparisonMatrix(
    snapshots: readonly StrengthSnapshot[],
    selectedMetricKeys: ReadonlySet<StrengthMetricKey>
): StrengthComparisonMatrix {
    const categories = METRIC_DEFINITIONS
        .filter(({ key }) => selectedMetricKeys.has(key))
        .map(({ key, label }) => ({ key, label }));
    return {
        categories,
        series: snapshots.map((snapshot) => ({
            snapshotId: snapshot.id,
            label: snapshot.label,
            values: categories.map(({ key }) => snapshot.metrics[key])
        }))
    };
}

export function getChangedMetricKeys(snapshots: readonly StrengthSnapshot[]): StrengthMetricKey[] {
    if (snapshots.length < 2) return [];
    return METRIC_DEFINITIONS
        .filter(({ key }) => new Set(snapshots.map((snapshot) => snapshot.metrics[key])).size > 1)
        .map(({ key }) => key);
}

export function getDefaultSelectedMetricKeys(snapshots: readonly StrengthSnapshot[]): StrengthMetricKey[] {
    if (snapshots.length === 1) return METRIC_DEFINITIONS.map(({ key }) => key);
    return getChangedMetricKeys(snapshots);
}

export function moveSnapshotByIndex<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
    const result = [...items];
    if (
        fromIndex < 0
        || fromIndex >= result.length
        || toIndex < 0
        || toIndex >= result.length
        || fromIndex === toIndex
    ) return result;

    const [moved] = result.splice(fromIndex, 1);
    result.splice(toIndex, 0, moved);
    return result;
}
