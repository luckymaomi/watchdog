export interface CourseNoticeInput {
    role: string;
    year: string;
    period: string;
    addressee: string;
    participantUnit: string;
    classNumber: string;
    startDate: string;
    endDate: string;
    issueDate: string;
    sourceText: string;
}

export interface CourseNoticeParticipant { employeeId: string; name: string }
export interface CourseNoticeIssue { severity: "error" | "warning" | "info"; message: string }
export interface CourseNoticeDraft {
    role: string;
    title: string;
    fields: Record<string, string>;
    participants: CourseNoticeParticipant[];
    issues: CourseNoticeIssue[];
}
export interface CourseNoticeFile { fileName: string; bytes: Uint8Array }
