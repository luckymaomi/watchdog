import { matchRosterEntriesByText } from "../../../crew-match-name-id/logic";
import type { CrewRosterEntry } from "../../../crew-match-name-id/models";
import type { SecurityDraft, SecurityInput } from "./models";

function chineseDate(value: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return "";
    const [year, month, day] = match.slice(1).map(Number);
    const date = new Date(year, month - 1, day, 12);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? `${year}年${month}月${day}日` : "";
}

export function buildSecurityDraft(roster: CrewRosterEntry[], input: SecurityInput): SecurityDraft {
    const issues: SecurityDraft["issues"] = [];
    const error = (message: string): void => { issues.push({ severity: "error", message }); };
    const kind = input.kind === "recurrent" ? "recurrent" : "initial";
    if (input.kind !== "initial" && input.kind !== "recurrent") error("请选择安保初训或复训。");
    const instructor = input.instructor.trim();
    if (!instructor) error("请填写教员姓名。");
    const chinaDate = chineseDate(input.chinaDate);
    const tsaDate = chineseDate(input.tsaDate);
    const permitDate = kind === "initial" ? chineseDate(input.permitDate) : "";
    if (!chinaDate) error("请选择有效的中国安保开课日期。");
    if (!tsaDate) error("请选择有效的 TSA 培训日期。");
    if (kind === "initial" && !permitDate) error("请选择有效的登机证培训日期。");
    const normalized = roster.map(p => ({ ...p, id: p.id.trim(), name: p.name.trim() })).filter(p => p.id && p.name);
    const byName = new Map<string, Set<string>>();
    const byId = new Map<string, Set<string>>();
    for (const p of normalized) {
        if (!byName.has(p.name)) byName.set(p.name, new Set());
        if (!byId.has(p.id)) byId.set(p.id, new Set());
        byName.get(p.name)!.add(p.id); byId.get(p.id)!.add(p.name);
    }
    const participants: SecurityDraft["participants"] = [];
    const seen = new Set<string>();
    for (const p of matchRosterEntriesByText(normalized, input.sourceText)) {
        if (seen.has(p.name)) continue;
        seen.add(p.name);
        if (byName.get(p.name)!.size > 1) { error(`姓名 ${p.name} 对应多个员工号，请核对花名册。`); continue; }
        if (byId.get(p.id)!.size > 1) { error(`员工号 ${p.id} 对应多个姓名，请核对花名册。`); continue; }
        participants.push({ employeeId: p.id, name: p.name, duty: "飞行员" });
    }
    if (!input.sourceText.trim()) error("请粘贴包含参训人员姓名的文本。");
    else if (!participants.length) error("没有匹配到可用的参训人员。");
    for (const value of [instructor, ...participants.flatMap(p => [p.employeeId, p.name])]) {
        if (/[\u0000-\u001F\uFFFE\uFFFF{}]/.test(value)) error("教员或人员信息包含控制字符或花括号，请清理后重试。");
    }
    if (participants.length) issues.push({ severity: "info", message: `已匹配 ${participants.length} 人。${kind === "initial" ? "生成三份汇总表，附带一份空白申办记录和三类原始试题。" : "生成两份签到表和两类原始试题。"}` });
    return { kind, instructor, chinaDate, tsaDate, permitDate, participants, issues };
}
export function canExportSecurity(draft: SecurityDraft): boolean {
    return draft.participants.length > 0 && !draft.issues.some(issue => issue.severity === "error");
}
