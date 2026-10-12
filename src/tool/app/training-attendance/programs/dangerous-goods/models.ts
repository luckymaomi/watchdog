import type { CrewRosterEntry } from "../../../crew-match-name-id/models";

export interface DangerousGoodsInput {
    sourceText: string;
    instructor: string;
    trainingDate: string;
    taskDate: string;
    examDate: string;
    location: string;
}

export interface DangerousGoodsParticipant {
    employeeId: string;
    name: string;
}

export interface DangerousGoodsIssue {
    id: string;
    severity: "error" | "warning" | "info";
    message: string;
}

export interface DangerousGoodsDraft {
    instructor: string;
    trainingDate: string;
    taskDate: string;
    examDate: string;
    location: string;
    participants: DangerousGoodsParticipant[];
    issues: DangerousGoodsIssue[];
}

export interface DangerousGoodsTemplates {
    instructorSurvey: Uint8Array;
    attitude: Uint8Array;
    postSurvey: Uint8Array;
    simulation: Uint8Array;
    exam: Uint8Array;
    attendance: Uint8Array;
}

export interface DangerousGoodsFile {
    fileName: string;
    bytes: Uint8Array;
}

export type DangerousGoodsRoster = CrewRosterEntry[];
