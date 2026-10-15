import { canExportCourseNotice } from "./logic";
import type { CourseNoticeDraft } from "./models";

export function requireElement<T extends HTMLElement>(id: string, Type: { new(): T }): T {
    const element = document.getElementById(id);
    if (!(element instanceof Type)) throw new Error(`页面缺少必要元素：${id}`);
    return element;
}

const escapeHtml = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function setStatus(message: string, failed = false): void {
    const element = requireElement("appStatus", HTMLElement);
    element.textContent = message;
    element.className = failed ? "status-line status-danger" : "status-line";
}

export function renderDraft(draft: CourseNoticeDraft, resourcesReady: boolean, exporting: boolean, resourceMessages: string[]): void {
    const issues = [...resourceMessages.map(message => ({ severity: "error", message })), ...draft.issues];
    requireElement("healthList", HTMLElement).innerHTML = issues.map(issue => `<div class="health-item health-${issue.severity}">${escapeHtml(issue.message)}</div>`).join("");
    requireElement("previewSummary", HTMLElement).textContent = `已匹配 ${draft.participants.length} 人`;
    const fields = draft.fields;
    requireElement("noticeTitle", HTMLElement).textContent = draft.title;
    requireElement("noticeOpening", HTMLElement).textContent = `${fields.主送单位 || "（主送单位）"}: 根据飞行部飞行训练计划，兹定于${fields.开课日期 || "（开课日期）"}起对${fields.人数}名飞行人员进行${draft.role}转B777机型理论培训，班级编号为${fields.班级编号 || "（班级编号）"}。`;
    requireElement("noticeParticipants", HTMLTextAreaElement).value = `${fields.参训单位 || "（参训单位）"}：${fields.参训人员 || "（等待匹配人员）"}。`;
    requireElement("noticeDates", HTMLElement).textContent = `理论学习：${fields.学习开始日期 || "（开始日期）"}至${fields.学习结束日期 || "（结束日期）"}；落款：南货航飞行部，${fields.发文日期 || "（发文日期）"}。`;
    requireElement("previewBody", HTMLTableSectionElement).innerHTML = draft.participants.length
        ? draft.participants.map((person, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(person.employeeId)}</td><td>${escapeHtml(person.name)}</td></tr>`).join("")
        : '<tr><td colspan="3" class="empty-cell">等待匹配人员</td></tr>';
    const button = requireElement("exportButton", HTMLButtonElement);
    button.disabled = exporting || !resourcesReady || !canExportCourseNotice(draft);
    button.textContent = exporting ? "正在生成..." : "导出开课通知 Word";
}
