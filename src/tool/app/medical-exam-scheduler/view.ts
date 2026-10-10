import { MedicalExamLogic as logic } from "./logic";
import type { HealthItem, MedicalExamPerson, QuotaSlot, WarningLevel } from "./models";

function requireElement<T extends HTMLElement>(id: string, Type: { new(): T }): T {
    const element = document.getElementById(id);
    if (!(element instanceof Type)) throw new Error(`页面缺少必要元素：${id}`);
    return element;
}

function escapeHtml(value: unknown): string {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function statusClass(type: "muted" | "success" | "warning" | "danger"): string {
    return type === "muted" ? "status-line" : `status-line status-${type}`;
}

function setStatus(id: string, message: string, type: "muted" | "success" | "warning" | "danger" = "muted"): void {
    const element = requireElement(id, HTMLElement);
    element.textContent = message;
    element.className = statusClass(type);
}

function populateSelect(
    fieldId: string,
    selectId: string,
    options: Array<{ value: string; label: string }>,
    selected: string
): void {
    const field = requireElement(fieldId, HTMLElement);
    const select = requireElement(selectId, HTMLSelectElement);
    field.hidden = options.length < 2;
    select.innerHTML = options.map((option) => (
        `<option value="${escapeHtml(option.value)}"${option.value === selected ? " selected" : ""}>${escapeHtml(option.label)}</option>`
    )).join("");
}

function renderHealth(items: HealthItem[]): void {
    const section = requireElement("healthSection", HTMLElement);
    section.hidden = false;
    const counts = {
        error: items.filter((item) => item.severity === "error").length,
        warning: items.filter((item) => item.severity === "warning").length,
        info: items.filter((item) => item.severity === "info").length
    };
    requireElement("healthCounts", HTMLElement).innerHTML = [
        ["严重", counts.error, "health-error"],
        ["警告", counts.warning, "health-warning"],
        ["提示", counts.info, "health-info"]
    ].map(([label, count, className]) => `<span class="health-count ${className}">${label} ${count}</span>`).join("");
    requireElement("healthList", HTMLElement).innerHTML = items
        .sort((left, right) => ["error", "warning", "info"].indexOf(left.severity) - ["error", "warning", "info"].indexOf(right.severity))
        .map((item) => `
            <article class="health-item health-${item.severity}">
                <strong>${escapeHtml(item.title)}</strong>
                <p>${escapeHtml(item.message)}</p>
            </article>
        `).join("");
}

function personChoice(person: MedicalExamPerson, selected: ReadonlySet<string>): string {
    return `
        <label class="person-choice${person.isNorthAmericaLeader ? " is-leader" : ""}">
            <input class="person-select" type="checkbox" data-employee-id="${escapeHtml(person.employeeId)}"${selected.has(person.employeeId) ? " checked" : ""}>
            <span>
                <strong>${escapeHtml(person.name || "未填写姓名")}${person.isNorthAmericaLeader ? " · 北美带队" : ""}</strong>
                <small>${escapeHtml(person.employeeId)}${person.technicalInfo ? ` · ${escapeHtml(person.technicalInfo)}` : ""}</small>
            </span>
        </label>
    `;
}

const warningOrder: Record<WarningLevel, number> = {
    overdue: 0,
    urgent10: 1,
    warning15: 2,
    notice30: 3,
    unassigned: 4,
    none: 5,
    scheduled: 6
};

function localDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function renderLeaders(people: MedicalExamPerson[], slots: QuotaSlot[], selected: ReadonlySet<string>, today: Date): void {
    const todayKey = localDateKey(today);
    const nextAvailableDate = logic.buildLoads(people, slots)
        .find((load) => load.remaining > 0 && load.date >= todayKey)?.date || "";
    const leaders = people
        .filter((person) => person.isNorthAmericaLeader)
        .map((person) => ({ person, warning: logic.getWarning(person.examDate, nextAvailableDate, today) }))
        .sort((left, right) => warningOrder[left.warning.level] - warningOrder[right.warning.level]
            || left.person.examDate.localeCompare(right.person.examDate)
            || left.person.sourceRow - right.person.sourceRow);
    const pendingCount = leaders.filter(({ person }) => !person.examDate).length;
    requireElement("leaderSummary", HTMLElement).textContent = `共 ${leaders.length} 人 · 未安排 ${pendingCount} 人`;
    requireElement("copyLeaderButton", HTMLButtonElement).disabled = leaders.length === 0;
    requireElement("leaderTableBody", HTMLTableSectionElement).innerHTML = leaders.length
        ? leaders.map(({ person, warning }) => `
            <tr>
                <td class="select-column"><input class="person-select" type="checkbox" data-employee-id="${escapeHtml(person.employeeId)}"${selected.has(person.employeeId) ? " checked" : ""}></td>
                <td><strong>${escapeHtml(person.name || "未填写姓名")}</strong></td>
                <td>${escapeHtml(person.employeeId)}</td>
                <td>${escapeHtml(person.technicalInfo || "未匹配")}</td>
                <td>${escapeHtml(person.examDate || "待分配")}</td>
                <td>${warning.daysUntilAvailableDate === null ? "—" : `${warning.daysUntilAvailableDate} 天`}</td>
                <td><span class="status-badge warning-${warning.level}">${escapeHtml(warning.label)}</span></td>
            </tr>
        `).join("")
        : `<tr><td colspan="7" class="text-center text-muted py-3">当前名单没有识别到北美带队。</td></tr>`;
}

function renderSummary(people: MedicalExamPerson[], slots: QuotaSlot[]): void {
    const assigned = people.filter((person) => person.examDate).length;
    const leaders = people.filter((person) => person.isNorthAmericaLeader);
    const loads = logic.buildLoads(people, slots);
    const values = [
        ["待排总人数", people.length],
        ["北美带队", leaders.length],
        ["已预排", assigned],
        ["待分配", people.length - assigned],
        ["带队未安排", leaders.filter((person) => !person.examDate).length],
        ["剩余额度", loads.reduce((sum, load) => sum + Math.max(load.remaining, 0), 0)]
    ];
    requireElement("summaryStrip", HTMLElement).innerHTML = values
        .map(([label, value]) => `<span class="summary-item">${label}<b>${value}</b></span>`)
        .join("");
}

function renderDays(people: MedicalExamPerson[], slots: QuotaSlot[], selected: ReadonlySet<string>): void {
    const loads = logic.buildLoads(people, slots);
    const pending = people.filter((person) => !person.examDate);
    const pendingSection = requireElement("pendingSection", HTMLElement);
    pendingSection.hidden = pending.length === 0;
    requireElement("pendingCount", HTMLElement).textContent = String(pending.length);
    requireElement("pendingPeople", HTMLElement).innerHTML = pending.map((person) => personChoice(person, selected)).join("");

    requireElement("dayCards", HTMLElement).innerHTML = loads.map((load) => {
        const assignedPeople = people.filter((person) => person.examDate === load.date);
        return `
            <article class="day-card${load.remaining <= 0 ? " is-full" : ""}">
                <div class="day-head">
                    <h3>${escapeHtml(load.date)}</h3>
                    <div class="day-metrics">
                        <span>已排 ${load.assigned}/${load.capacity}</span>
                        <span class="remaining">剩余 ${load.remaining}</span>
                    </div>
                </div>
                ${assignedPeople.length
                    ? `<div class="people-grid">${assignedPeople.map((person) => personChoice(person, selected)).join("")}</div>`
                    : `<p class="empty-day">尚未安排人员</p>`}
            </article>
        `;
    }).join("");
}

function renderMoveControls(people: MedicalExamPerson[], slots: QuotaSlot[], selected: ReadonlySet<string>): void {
    const loads = logic.buildLoads(people, slots);
    requireElement("selectionCount", HTMLElement).textContent = `已选择 ${selected.size} 人`;
    requireElement("moveTarget", HTMLSelectElement).innerHTML = loads.map((load) => (
        `<option value="${load.date}"${load.remaining <= 0 ? " disabled" : ""}>${load.date} · 剩余 ${load.remaining}</option>`
    )).join("");
    requireElement("moveButton", HTMLButtonElement).disabled = selected.size === 0 || !loads.some((load) => load.remaining > 0);
    requireElement("unassignButton", HTMLButtonElement).disabled = selected.size === 0;
    requireElement("clearSelectionButton", HTMLButtonElement).disabled = selected.size === 0;
}

function renderWorkspace(people: MedicalExamPerson[], slots: QuotaSlot[], selected: ReadonlySet<string>, today = new Date()): void {
    requireElement("workspace", HTMLElement).hidden = false;
    renderSummary(people, slots);
    renderLeaders(people, slots, selected, today);
    renderDays(people, slots, selected);
    renderMoveControls(people, slots, selected);
}

export const MedicalExamView = {
    requireElement,
    setStatus,
    populateSelect,
    renderHealth,
    renderWorkspace
};
