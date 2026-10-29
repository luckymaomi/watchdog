import { matchRosterEntriesByText } from "../../../crew-match-name-id/logic";
import type { CrewRosterEntry } from "../../../crew-match-name-id/models";
import type {
    DangerousGoodsDraft,
    DangerousGoodsInput,
    DangerousGoodsIssue,
    DangerousGoodsParticipant
} from "./models";

function clean(value: unknown): string { return String(value ?? "").trim(); }

function dateParts(value: string): { full: string; short: string; serial: number } | null {
    const match = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day, 12);
    if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) return null;
    return {
        full: `${year}年${String(month).padStart(2, "0")}月${String(day).padStart(2, "0")}日`,
        short: `${String(month).padStart(2, "0")}月${String(day).padStart(2, "0")}日`,
        serial: date.getTime()
    };
}

function issue(id: string, severity: DangerousGoodsIssue["severity"], message: string): DangerousGoodsIssue {
    return { id, severity, message };
}

export function buildDangerousGoodsDraft(roster: CrewRosterEntry[], input: DangerousGoodsInput): DangerousGoodsDraft {
    const trainingDate = dateParts(input.trainingDate);
    const taskDate = dateParts(input.taskDate);
    const examDate = dateParts(input.examDate);
    const participants = matchRosterEntriesByText(roster, input.sourceText)
        .map<DangerousGoodsParticipant>((person) => ({ employeeId: person.id, name: person.name }));
    const issues: DangerousGoodsIssue[] = [];
    if (!clean(input.sourceText)) issues.push(issue("missing-source", "error", "请粘贴包含参训人员姓名的文本。"));
    else if (!participants.length) issues.push(issue("no-match", "error", "粘贴内容没有匹配到花名册人员。"));
    if (!clean(input.instructor)) issues.push(issue("missing-instructor", "error", "请填写培训教员。"));
    if (!trainingDate) issues.push(issue("invalid-training-date", "error", "请选择培训时间。"));
    if (!taskDate) issues.push(issue("invalid-task-date", "error", "请选择任务模拟日期。"));
    if (!examDate) issues.push(issue("invalid-exam-date", "error", "请选择试卷考核日期。"));
    if (!clean(input.location)) issues.push(issue("missing-location", "error", "请填写培训地点。"));
    if (participants.length) issues.push(issue("summary", "info", `已匹配 ${participants.length} 名学员。`));
    return {
        instructor: clean(input.instructor),
        trainingDate: trainingDate?.full || "",
        taskDate: taskDate?.full || "",
        examDate: examDate?.full || "",
        location: clean(input.location),
        participants,
        issues
    };
}

export function shortDate(value: string): string {
    const match = value.match(/^(\d{4})年(\d{2})月(\d{2})日$/);
    return match ? `${match[2]}月${match[3]}日` : "";
}

export function canExportDangerousGoods(draft: DangerousGoodsDraft): boolean {
    return draft.participants.length > 0 && !draft.issues.some((item) => item.severity === "error");
}

export const DangerousGoodsLogic = { buildDangerousGoodsDraft, shortDate, canExportDangerousGoods };
