export type HealthSeverity = "error" | "warning" | "info";

export interface HealthItem {
    id: string;
    severity: HealthSeverity;
    title: string;
    message: string;
}

export interface SheetRows {
    name: string;
    rows: unknown[][];
}

export interface RosterPerson {
    employeeId: string;
    name: string;
    department: string;
    technicalInfo: string;
    isNorthAmericaLeader: boolean;
    sourceRow: number;
}

export interface RosterParseResult {
    sheetName: string;
    headerRowIndex: number;
    people: RosterPerson[];
    issues: HealthItem[];
}

export interface CandidateHeaderIndexes {
    employeeId: number;
    name: number;
    examDate: number;
    note: number;
    adjustmentNotes?: number;
}

export interface MedicalExamPerson {
    employeeId: string;
    name: string;
    sourceRow: number;
    department: string;
    technicalInfo: string;
    isNorthAmericaLeader: boolean;
    examDate: string;
    note: string;
    matchedRoster: boolean;
    adjusted: boolean;
    adjustmentNotes: string[];
}

export interface CandidateSheet {
    name: string;
    headerRowIndex: number;
    indexes: CandidateHeaderIndexes;
    people: MedicalExamPerson[];
    issues: HealthItem[];
}

export interface QuotaSlot {
    date: string;
    capacity: number;
    sourceSheet: string;
    sourceRow: number;
}

export interface MedicalWorkbookImport {
    candidateSheets: CandidateSheet[];
    slots: QuotaSlot[];
    issues: HealthItem[];
}

export interface DailyLoad extends QuotaSlot {
    assigned: number;
    remaining: number;
    protectedRemaining: number;
}

export interface AllocationResult {
    people: MedicalExamPerson[];
    dailyLoads: DailyLoad[];
    pendingEmployeeIds: string[];
}

export type WarningLevel = "scheduled" | "unassigned" | "none" | "notice30" | "warning15" | "urgent10" | "overdue";

export interface ExamWarning {
    level: WarningLevel;
    daysUntilAvailableDate: number | null;
    label: string;
}
