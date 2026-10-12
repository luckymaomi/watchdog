export interface TrainingAttendanceInput {
    sourceText: string;
    session: string;
    startDate: string;
    endDate: string;
    instructor1: string;
    instructor2: string;
    instructor3: string;
}

export interface TrainingParticipant {
    employeeId: string;
    name: string;
    technicalInfo: string;
    rank: "机长" | "副驾驶" | "";
}

export interface TrainingAttendanceIssue {
    id: string;
    severity: "error" | "warning" | "info";
    message: string;
}

export interface TrainingAttendanceDraft {
    sessionLabel: string;
    startDate: string;
    endDate: string;
    instructor1: string;
    instructor2: string;
    instructor3: string;
    participants: TrainingParticipant[];
    issues: TrainingAttendanceIssue[];
}

export interface CrmTemplateBuffers {
    booking: Uint8Array;
    attendanceDay1: Uint8Array;
    attendanceDay2: Uint8Array;
}

export interface GeneratedTrainingFile {
    fileName: string;
    bytes: Uint8Array;
}
