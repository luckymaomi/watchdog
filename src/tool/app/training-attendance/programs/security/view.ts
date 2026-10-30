import type { SecurityDraft } from "./models";
import { canExportSecurity } from "./logic";

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
export function renderDraft(draft: SecurityDraft, resourceMessages: string[], exporting: boolean): void {
    element("permitDateField", HTMLElement).hidden = draft.kind !== "initial";
    const health = element("healthList", HTMLElement);
    health.replaceChildren(...[
        ...resourceMessages.map(message => ({ severity: "error", message })), ...draft.issues
    ].map(issue => {
        const node = document.createElement("div");
        node.className = `health-item health-${issue.severity}`;
        node.textContent = issue.message;
        return node;
    }));
    const body = element("previewBody", HTMLTableSectionElement);
    body.replaceChildren();
    for (const [i, p] of draft.participants.entries()) {
        const row = body.insertRow();
        for (const value of [String(i + 1), p.employeeId, p.name, p.duty]) row.insertCell().textContent = value;
    }
    if (!draft.participants.length) {
        const cell = body.insertRow().insertCell();
        cell.colSpan = 4; cell.className = "empty-cell"; cell.textContent = "等待匹配人员";
    }
    element("previewSummary", HTMLElement).textContent = `共 ${draft.participants.length} 人`;
    element("outputSummary", HTMLElement).textContent = draft.kind === "initial"
        ? "初训：安保中国签到表、TSA 签到表、登机证培训登记表各 1 份，另附空白申办登机证人员记录 1 份，原始试题各 1 份。"
        : "复训：安保中国签到表和 TSA 签到表各 1 份，原始试题各 1 份。";
    const button = element("exportButton", HTMLButtonElement);
    button.disabled = exporting || resourceMessages.length > 0 || !canExportSecurity(draft);
    button.textContent = exporting ? "正在生成..." : "导出整套资料";
}
