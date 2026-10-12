import { matchRosterEntriesByText } from "../../../crew-match-name-id/logic";
import type { CrewRosterEntry } from "../../../crew-match-name-id/models";
import type {
    TrainingAttendanceDraft,
    TrainingAttendanceInput,
    TrainingAttendanceIssue,
    TrainingParticipant
} from "./models";

function clean(value: unknown): string {
    return String(value ?? "").trim();
}

function normalizeSession(value: string): string {
    const text = clean(value);
    if (!text) return "";
    const matched = text.match(/^第?(.+?)期?$/);
    const content = clean(matched?.[1]);
    return content ? `第${content}期` : "";
}

function parseDateKey(value: string): { key: string; serial: number } | null {
    const matched = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!matched) return null;
    const year = Number(matched[1]);
    const month = Number(matched[2]);
    const day = Number(matched[3]);
    const date = new Date(year, month - 1, day, 12);
    if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) return null;
    return { key: `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`, serial: date.getTime() };
}

function classifyTrainingRank(technicalInfo: string): TrainingParticipant["rank"] {
    const value = clean(technicalInfo);
    if (value.includes("副驾驶")) return "副驾驶";
    if (value.includes("机长") || value.includes("教员")) return "机长";
    return "";
}

function issue(id: string, severity: TrainingAttendanceIssue["severity"], message: string): TrainingAttendanceIssue {
    return { id, severity, message };
}

export function buildTrainingAttendanceDraft(
    roster: CrewRosterEntry[],
    input: TrainingAttendanceInput
): TrainingAttendanceDraft {
    const issues: TrainingAttendanceIssue[] = [];
    const sessionLabel = normalizeSession(input.session);
    const start = parseDateKey(input.startDate);
    const end = parseDateKey(input.endDate);
    const instructor1 = clean(input.instructor1);
    const instructor2 = clean(input.instructor2);
    const instructor3 = clean(input.instructor3);
    const matched = matchRosterEntriesByText(roster, input.sourceText);
    const participants = matched.map<TrainingParticipant>((person) => ({
        employeeId: person.id,
        name: person.name,
        technicalInfo: person.techInfo,
        rank: classifyTrainingRank(person.techInfo)
    }));

    if (!clean(input.sourceText)) issues.push(issue("missing-source", "error", "请粘贴包含参训人员姓名的文本。"));
    else if (!participants.length) issues.push(issue("no-match", "error", "粘贴内容没有匹配到花名册人员。"));
    if (!sessionLabel) issues.push(issue("missing-session", "error", "请填写培训期次。"));
    if (!start) issues.push(issue("invalid-start", "error", "请选择开始日期。"));
    if (!end) issues.push(issue("invalid-end", "error", "请选择结束日期。"));
    if (start && end && end.serial < start.serial) issues.push(issue("date-order", "error", "结束日期不能早于开始日期。"));
    if (!instructor1) issues.push(issue("missing-instructor-1", "error", "请填写教员1。"));
    if (!instructor2) issues.push(issue("missing-instructor-2", "error", "请填写教员2。"));
    if (!instructor3) issues.push(issue("missing-instructor-3", "error", "请填写第二天的教员3。"));

    const unknownRanks = participants.filter((person) => !person.rank);
    if (unknownRanks.length) {
        issues.push(issue(
            "unknown-rank",
            "error",
            `以下人员的技术信息无法归并为机长或副驾驶：${unknownRanks.map((person) => `${person.name}（${person.employeeId}）`).join("、")}。`
        ));
    }
    if (participants.length) {
        const captains = participants.filter((person) => person.rank === "机长").length;
        const firstOfficers = participants.filter((person) => person.rank === "副驾驶").length;
        issues.push(issue("summary", "info", `已匹配 ${participants.length} 人：机长 ${captains} 人，副驾驶 ${firstOfficers} 人。`));
    }

    return {
        sessionLabel,
        startDate: start?.key || "",
        endDate: end?.key || "",
        instructor1,
        instructor2,
        instructor3,
        participants,
        issues
    };
}

export function canExportTrainingAttendance(draft: TrainingAttendanceDraft): boolean {
    return draft.participants.length > 0 && !draft.issues.some((item) => item.severity === "error");
}

export const TrainingAttendanceLogic = {
    normalizeSession,
    classifyTrainingRank,
    buildTrainingAttendanceDraft,
    canExportTrainingAttendance
};
