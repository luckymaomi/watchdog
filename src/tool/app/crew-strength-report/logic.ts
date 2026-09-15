import type {
    StrengthMetricDefinition,
    StrengthMetricKey,
    StrengthSnapshot,
    StrengthSnapshotMeta
} from "./models";

export const REQUIRED_HEADERS = ["技术信息", "是否运行", "RAMA", "REUO"] as const;

export const METRIC_DEFINITIONS: readonly StrengthMetricDefinition[] = [
    { key: "operationalTotal", label: "运行人员", shortLabel: "运行人员", colorVariable: "--strength-total-chart" },
    { key: "instructor", label: "教员", shortLabel: "教员", colorVariable: "--strength-instructor-chart" },
    { key: "captain", label: "机长", shortLabel: "机长", colorVariable: "--strength-captain-chart" },
    { key: "firstOfficer", label: "副驾驶", shortLabel: "副驾驶", colorVariable: "--strength-first-officer-chart" },
    { key: "northAmericaLeader", label: "北美带队（RAMA）", shortLabel: "北美带队", colorVariable: "--strength-north-america-chart" },
    { key: "europeLeader", label: "欧洲带队（REUO）", shortLabel: "欧洲带队", colorVariable: "--strength-europe-chart" }
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

function classifyTechnicalInformation(value: unknown): "instructor" | "captain" | "firstOfficer" | null {
    const text = normalizeCell(value);
    if (text.includes("飞行教员") || text.includes("教员")) return "instructor";
    if (text.includes("副驾驶")) return "firstOfficer";
    if (text.includes("机长")) return "captain";
    return null;
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

    dataRows.forEach((row) => {
        if (normalizeCell(row[header.indexes["是否运行"]]) !== "是") return;
        metrics.operationalTotal += 1;

        const category = classifyTechnicalInformation(row[header.indexes["技术信息"]]);
        if (category) metrics[category] += 1;
        else unclassifiedOperationalRows += 1;

        if (hasQualification(row[header.indexes.RAMA])) metrics.northAmericaLeader += 1;
        if (hasQualification(row[header.indexes.REUO])) metrics.europeLeader += 1;
    });

    return {
        ...meta,
        label: buildSnapshotLabel(meta.fileName),
        totalDataRows: dataRows.length,
        excludedRows: dataRows.length - metrics.operationalTotal,
        unclassifiedOperationalRows,
        metrics
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
