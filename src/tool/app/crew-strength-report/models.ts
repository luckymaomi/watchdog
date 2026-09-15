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
}

export type StrengthTechnicalCategory = "instructor" | "captain" | "firstOfficer";

export interface StrengthTechnicalDetail {
    category: StrengthTechnicalCategory;
    label: string;
    count: number;
}

export interface StrengthComparisonCategory {
    key: StrengthMetricKey;
    label: string;
}

export interface StrengthComparisonSeries {
    snapshotId: string;
    label: string;
    values: number[];
}

export interface StrengthComparisonMatrix {
    categories: StrengthComparisonCategory[];
    series: StrengthComparisonSeries[];
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
    technicalDetails: StrengthTechnicalDetail[];
    metrics: StrengthMetrics;
}

export type StrengthComparisonChartType = "bar" | "line";

export interface StrengthImportError {
    fileName: string;
    message: string;
}
