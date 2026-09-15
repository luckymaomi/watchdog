export type StrengthMetricKey =
    | "operationalTotal"
    | "instructor"
    | "captain"
    | "firstOfficer"
    | "northAmericaLeader"
    | "europeLeader";

export interface StrengthMetrics {
    operationalTotal: number;
    instructor: number;
    captain: number;
    firstOfficer: number;
    northAmericaLeader: number;
    europeLeader: number;
}

export interface StrengthMetricDefinition {
    key: StrengthMetricKey;
    label: string;
    shortLabel: string;
    colorVariable: string;
}

export interface StrengthSnapshotMeta {
    id: string;
    fileName: string;
    sheetName: string;
}

export interface StrengthSnapshot extends StrengthSnapshotMeta {
    label: string;
    totalDataRows: number;
    excludedRows: number;
    unclassifiedOperationalRows: number;
    metrics: StrengthMetrics;
}

export type StrengthComparisonChartType = "bar" | "line";

export interface StrengthImportError {
    fileName: string;
    message: string;
}
