import type { EmergencyDraft } from "./models";
import { canExportEmergency } from "./logic";

export function element<T extends HTMLElement>(id: string, Type: { new(): T }): T {
    const node = document.getElementById(id);
    if (!(node instanceof Type)) throw new Error(`页面缺少元素：${id}`);
    return node;
}
export function setStatus(message: string, failed = false): void {
    const node = element("appStatus", HTMLElement);
    node.textContent = message;
    node.className = failed ? "status-line status-danger" : "status-line";
}
export function renderDraft(draft: EmergencyDraft, ready: boolean, exporting: boolean): void {
    element("trainingTimePreview", HTMLElement).textContent = draft.trainingTime || "请选择培训日期";
    const health = element("healthList", HTMLElement);
    health.replaceChildren(...draft.issues.map(issue => {
        const node = document.createElement("div");
        node.className = `health-item health-${issue.severity}`;
        node.textContent = issue.message;
        return node;
    }));
    const body = element("previewBody", HTMLTableSectionElement);
    body.replaceChildren();
    for (const [index, person] of draft.participants.entries()) {
        const row = body.insertRow();
        for (const value of [String(index + 1), person.employeeId, person.name]) row.insertCell().textContent = value;
    }
    if (!draft.participants.length) {
        const cell = body.insertRow().insertCell();
        cell.colSpan = 3; cell.className = "empty-cell"; cell.textContent = "等待匹配人员";
    }
    element("previewSummary", HTMLElement).textContent = `共 ${draft.participants.length} 人`;
    const button = element("exportButton", HTMLButtonElement);
    button.disabled = !ready || exporting || !canExportEmergency(draft);
    button.textContent = exporting ? "正在生成..." : "导出签到表 Word";
}
