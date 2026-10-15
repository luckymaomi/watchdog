import { matchRosterEntriesByText } from "../../../crew-match-name-id/logic";
import type { CrewRosterEntry } from "../../../crew-match-name-id/models";
import type { CourseNoticeDraft, CourseNoticeInput, CourseNoticeIssue, CourseNoticeParticipant } from "./models";

const clean = (value: string): string => value.trim();
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/;

function dateValue(value: string): { text: string; time: number } | null {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const [year, month, day] = match.slice(1).map(Number);
    const date = new Date(year, month - 1, day, 12);
    if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) return null;
    return { text: `${year}年${month}月${day}日`, time: date.getTime() };
}

export function buildCourseNoticeDraft(roster: CrewRosterEntry[], input: CourseNoticeInput): CourseNoticeDraft {
    const issues: CourseNoticeIssue[] = [];
    const error = (message: string): void => { issues.push({ severity: "error", message }); };
    const byId = new Map<string, Set<string>>();
    const byName = new Map<string, Set<string>>();
    const normalizedRoster: CrewRosterEntry[] = [];
    for (const person of roster) {
        const id = person.id.trim();
        const name = person.name.trim();
        if (!id || !name) continue;
        normalizedRoster.push({ ...person, id, name });
        if (!byId.has(id)) byId.set(id, new Set());
        byId.get(id)!.add(name);
        if (!byName.has(name)) byName.set(name, new Set());
        byName.get(name)!.add(id);
    }
    const participants: CourseNoticeParticipant[] = [];
    const seen = new Set<string>();
    const matched = matchRosterEntriesByText(normalizedRoster, input.sourceText);
    if (!input.sourceText.trim()) error("请粘贴包含参训人员姓名的文本。");
    else if (!matched.length) error("粘贴内容没有匹配到花名册人员。");
    for (const person of matched) {
        if (seen.has(person.name)) continue;
        seen.add(person.name);
        const ids = byName.get(person.name)!;
        if (ids.size > 1) { error(`姓名 ${person.name} 在花名册对应多个员工号，存在重名，需先核对花名册。`); continue; }
        const employeeId = [...ids][0];
        if (byId.get(employeeId)!.size > 1) { error(`员工号 ${employeeId} 在花名册对应多个姓名，需先核对。`); continue; }
        participants.push({ employeeId, name: person.name });
    }
    const start = dateValue(input.startDate);
    const end = dateValue(input.endDate);
    const issued = dateValue(input.issueDate);
    if (!start) error("请选择有效的学习开始日期。");
    if (!end) error("请选择有效的学习结束日期。");
    if (!issued) error("请选择有效的发文日期。");
    if (start && end && end.time < start.time) error("学习结束日期不能早于开始日期。");
    const role = clean(input.role);
    const year = clean(input.year);
    const period = clean(input.period).replace(/^第/, "").replace(/期$/, "").trim();
    if (!["机长", "副驾驶"].includes(role)) error("请选择机长或副驾驶。");
    if (!/^[1-9]\d{3}$/.test(year)) error("请填写四位标题年份，例如 2027。");
    if (!period) error("请填写培训期数。");
    const fields: Record<string, string> = {
        年份: year, 期数: period, 岗位: role, 主送单位: clean(input.addressee),
        开课日期: start?.text || "", 人数: String(participants.length), 班级编号: clean(input.classNumber),
        参训单位: clean(input.participantUnit), 参训人员: participants.map(person => `${person.name}(${person.employeeId})`).join("、"),
        学习开始日期: start?.text || "", 学习结束日期: end?.text || "", 发文日期: issued?.text || ""
    };
    for (const key of ["主送单位", "参训单位", "班级编号"]) if (!fields[key]) error(`请填写${key}。`);
    for (const [key, value] of Object.entries(fields)) {
        if (INVALID_XML.test(value) || /[{}\r\n\t]/.test(value)) error(`${key}包含控制字符、换行或花括号，请清理后重试。`);
    }
    if (participants.length) issues.push({ severity: "info", message: `已匹配 ${participants.length} 人，按姓名输入顺序生成名单。` });
    const title = `关于${year}年第${period}期B777机型${role}转机型理论培训开课的通知`;
    return { role, title, fields, participants, issues };
}

export function canExportCourseNotice(draft: CourseNoticeDraft): boolean {
    return draft.participants.length > 0 && !draft.issues.some(issue => issue.severity === "error");
}
