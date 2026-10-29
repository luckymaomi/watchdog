export type EmergencyKind = "initial" | "recurrent";
export interface EmergencyInput {
    kind: string;
    startDate: string;
    location: string;
    sourceText: string;
}
export interface EmergencyDraft {
    kind: EmergencyKind;
    startDate: string;
    endDate: string;
    trainingTime: string;
    location: string;
    participants: { employeeId: string; name: string }[];
    issues: { severity: "error" | "info"; message: string }[];
}
