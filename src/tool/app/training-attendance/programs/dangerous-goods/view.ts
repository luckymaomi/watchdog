import type { DangerousGoodsDraft } from "./models";

export function requireElement<T extends HTMLElement>(id: string, Type: { new(): T }): T {
    const element = document.getElementById(id);
    if (!(element instanceof Type)) throw new Error(`页面缺少必要元素：${id}`);
    return element;
}

function escapeHtml(value: unknown): string {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function setStatus(message: string, type: "muted" | "success" | "danger" = "muted"): void {
    const element = requireElement("appStatus", HTMLElement);
    element.textContent = message;
    element.className = type === "muted" ? "status-line" : `status-line status-${type}`;
}

export function renderDraft(draft: DangerousGoodsDraft, templatesReady: boolean, exporting = false): void {
    const health = requireElement("healthList", HTMLElement);
    health.innerHTML = draft.issues.map((item) => `<div class="health-item health-${item.severity}">${escapeHtml(item.message)}</div>`).join("");
    const body = requireElement("previewBody", HTMLTableSectionElement);
    body.innerHTML = draft.participants.length
        ? draft.participants.map((person, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(person.employeeId)}</td><td>${escapeHtml(person.name)}</td><td>飞行部</td></tr>`).join("")
        : `<tr><td colspan="4" class="empty-cell">等待匹配人员</td></tr>`;
    requireElement("previewSummary", HTMLElement).textContent = draft.participants.length ? `共 ${draft.participants.length} 人` : "尚未匹配人员";
    const button = requireElement("exportButton", HTMLButtonElement);
    button.disabled = exporting || !templatesReady || !draft.participants.length || draft.issues.some((item) => item.severity === "error");
    button.textContent = exporting ? "正在生成..." : "一键导出整套资料";
}
