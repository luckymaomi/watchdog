import { matchRosterEntriesByText } from "../../../crew-match-name-id/logic";
import type { CrewRosterEntry } from "../../../crew-match-name-id/models";
import type { EmergencyDraft, EmergencyInput } from "./models";

function parseDate(value: string): Date | null {
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!parts) return null;
    const [year, month, day] = parts.slice(1).map(Number);
    const date = new Date(year, month - 1, day, 12);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}
function dateText(date: Date): string { return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`; }
function recurrentTime(start: Date, end: Date): string {
    const monthDay = (date: Date): string => `${String(date.getMonth() + 1).padStart(2, "0")}月${String(date.getDate()).padStart(2, "0")}日`;
    const first = `${start.getFullYear()}年${monthDay(start)}`;
    if (start.getFullYear() !== end.getFullYear()) return `${first}-${end.getFullYear()}年${monthDay(end)}`;
    if (start.getMonth() !== end.getMonth()) return `${first}-${monthDay(end)}`;
    return `${first}-${String(end.getDate()).padStart(2, "0")}日`;
}
function dateInput(date: Date): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

export function buildEmergencyDraft(roster: CrewRosterEntry[], input: EmergencyInput): EmergencyDraft {
    const issues: EmergencyDraft["issues"] = [];
    const error = (message: string): void => { issues.push({ severity: "error", message }); };
    const kind = input.kind === "recurrent" ? "recurrent" : "initial";
    if (input.kind !== "initial" && input.kind !== "recurrent") error("请选择初训或复训。");
    const start = parseDate(input.startDate);
    const end = start ? new Date(start.getTime()) : null;
    if (end && kind === "recurrent") end.setDate(end.getDate() + 1);
    if (!start || !end || end.getFullYear() > 9999) error("请选择有效的培训日期。");
    const location = input.location.trim();
    if (!location) error("请填写培训地点。");
    const byName = new Map<string, Set<string>>();
    const byId = new Map<string, Set<string>>();
    const normalized = roster.map(p => ({ ...p, id: p.id.trim(), name: p.name.trim() })).filter(p => p.id && p.name);
    for (const p of normalized) {
        if (!byName.has(p.name)) byName.set(p.name, new Set());
        if (!byId.has(p.id)) byId.set(p.id, new Set());
        byName.get(p.name)!.add(p.id);
        byId.get(p.id)!.add(p.name);
    }
    const participants: EmergencyDraft["participants"] = [];
    const seen = new Set<string>();
    for (const p of matchRosterEntriesByText(normalized, input.sourceText)) {
        if (seen.has(p.name)) continue;
        seen.add(p.name);
        if (byName.get(p.name)!.size > 1) { error(`姓名 ${p.name} 对应多个员工号，请核对花名册。`); continue; }
        if (byId.get(p.id)!.size > 1) { error(`员工号 ${p.id} 对应多个姓名，请核对花名册。`); continue; }
        participants.push({ employeeId: p.id, name: p.name });
    }
    if (!input.sourceText.trim()) error("请粘贴包含参训人员姓名的文本。");
    else if (!participants.length) error("没有匹配到可用的花名册人员。");
    for (const value of [location, ...participants.flatMap(p => [p.employeeId, p.name])]) {
        if (/[\u0000-\u001F\uFFFE\uFFFF{}]/.test(value)) error("地点或人员信息包含控制字符或花括号，请清理后重试。");
    }
    if (participants.length) issues.push({ severity: "info", message: `已匹配 ${participants.length} 人，${kind === "initial" ? "初训 1 天" : "复训 2 天"}，导出一份签到表。` });
    return {
        kind, startDate: start ? dateInput(start) : "", endDate: end ? dateInput(end) : "",
        trainingTime: start && end ? (kind === "initial" ? dateText(start) : recurrentTime(start, end)) : "",
        location, participants, issues
    };
}
export function canExportEmergency(draft: EmergencyDraft): boolean {
    return draft.participants.length > 0 && !draft.issues.some(i => i.severity === "error");
}
