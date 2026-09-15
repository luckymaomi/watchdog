import { METRIC_DEFINITIONS, buildComparisonMatrix, getChangedMetricKeys } from "./logic";
import type {
    StrengthComparisonChartType,
    StrengthImportError,
    StrengthMetricKey,
    StrengthSnapshot
} from "./models";

export interface StrengthPageElements {
    statusLine: HTMLElement;
    dropZone: HTMLElement;
    fileInput: HTMLInputElement;
    fileCount: HTMLElement;
    fileList: HTMLElement;
    importErrors: HTMLElement;
    clearButton: HTMLButtonElement;
    reportSection: HTMLElement;
    reportCapture: HTMLElement;
    reportTitle: HTMLElement;
    reportMeta: HTMLElement;
    reportWarning: HTMLElement;
    summaryGrid: HTMLElement;
    metricControls: HTMLElement;
    comparisonMeta: HTMLElement;
    comparisonTable: HTMLElement;
    selectChangedButton: HTMLButtonElement;
    selectAllButton: HTMLButtonElement;
    exportImageButton: HTMLButtonElement;
    exportExcelButton: HTMLButtonElement;
    technicalChart: HTMLElement;
    technicalDetails: HTMLElement;
    leadershipChart: HTMLElement;
    comparisonChart: HTMLElement;
}

export interface StrengthViewState {
    snapshots: readonly StrengthSnapshot[];
    errors: readonly StrengthImportError[];
    selectedMetricKeys: ReadonlySet<StrengthMetricKey>;
    comparisonType: StrengthComparisonChartType;
    importing: boolean;
}

function escapeHtml(value: unknown): string {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function renderFileList(elements: StrengthPageElements, state: StrengthViewState): void {
    elements.fileCount.textContent = state.snapshots.length ? `${state.snapshots.length} 份快照` : "尚未导入";
    elements.clearButton.disabled = state.importing || state.snapshots.length === 0;
    if (!state.snapshots.length) {
        elements.fileList.innerHTML = '<div class="file-list-empty">文件会按这里的顺序进入分类对比；排序最后一份作为当前快照。</div>';
        return;
    }

    elements.fileList.innerHTML = state.snapshots.map((snapshot, index) => {
        const isCurrent = index === state.snapshots.length - 1;
        const warning = snapshot.unclassifiedOperationalRows
            ? `<span class="file-warning">${snapshot.unclassifiedOperationalRows} 人技术信息未识别</span>`
            : "";
        return `
            <article class="snapshot-card${isCurrent ? " is-current" : ""}" draggable="${state.importing ? "false" : "true"}" data-snapshot-id="${escapeHtml(snapshot.id)}">
                <div class="drag-handle" aria-hidden="true">⋮⋮</div>
                <div class="snapshot-order">${index + 1}</div>
                <div class="snapshot-copy">
                    <div class="snapshot-title-row">
                        <strong>${escapeHtml(snapshot.label)}</strong>
                        ${isCurrent ? '<span class="current-badge">当前</span>' : ""}
                    </div>
                    <span class="snapshot-file" title="${escapeHtml(snapshot.fileName)}">${escapeHtml(snapshot.fileName)}</span>
                    <span class="snapshot-detail">${escapeHtml(snapshot.sheetName)} · 运行 ${snapshot.metrics.operationalTotal} 人 · 排除 ${snapshot.excludedRows} 人</span>
                    ${warning}
                </div>
                <div class="snapshot-actions">
                    <button class="btn btn-outline-secondary btn-sm" type="button" data-file-action="up" aria-label="前移 ${escapeHtml(snapshot.fileName)}" ${state.importing || index === 0 ? "disabled" : ""}>↑</button>
                    <button class="btn btn-outline-secondary btn-sm" type="button" data-file-action="down" aria-label="后移 ${escapeHtml(snapshot.fileName)}" ${state.importing || isCurrent ? "disabled" : ""}>↓</button>
                    <button class="btn btn-outline-danger btn-sm" type="button" data-file-action="remove" aria-label="移除 ${escapeHtml(snapshot.fileName)}" ${state.importing ? "disabled" : ""}>移除</button>
                </div>
            </article>
        `;
    }).join("");
}

function renderErrors(elements: StrengthPageElements, errors: readonly StrengthImportError[]): void {
    elements.importErrors.hidden = errors.length === 0;
    elements.importErrors.innerHTML = errors.length
        ? `
            <strong>${errors.length} 份文件未导入</strong>
            <ul>${errors.map((error) => `<li><span>${escapeHtml(error.fileName)}</span>：${escapeHtml(error.message)}</li>`).join("")}</ul>
        `
        : "";
}

function renderSummary(elements: StrengthPageElements, snapshot: StrengthSnapshot): void {
    elements.reportTitle.textContent = `飞行实力周报 · ${snapshot.label}`;
    elements.reportMeta.textContent = `当前快照取排序最后一份：${snapshot.fileName}（${snapshot.sheetName}）`;
    elements.summaryGrid.innerHTML = METRIC_DEFINITIONS.map(({ key, label }) => `
        <article class="summary-item summary-${escapeHtml(key)}">
            <span>${escapeHtml(label)}</span>
            <strong>${snapshot.metrics[key]}</strong>
            <small>人</small>
        </article>
    `).join("");

    elements.reportWarning.hidden = snapshot.unclassifiedOperationalRows === 0;
    elements.reportWarning.textContent = snapshot.unclassifiedOperationalRows
        ? `当前快照有 ${snapshot.unclassifiedOperationalRows} 名运行人员的技术信息未归入教员、机长或副驾驶，已计入运行人数但未计入饼图。`
        : "";
}

function renderTechnicalDetails(elements: StrengthPageElements, snapshot: StrengthSnapshot): void {
    const groups = [
        { category: "instructor", label: "教员" },
        { category: "captain", label: "机长" },
        { category: "firstOfficer", label: "副驾驶" }
    ] as const;
    elements.technicalDetails.innerHTML = groups.map((group) => {
        const details = snapshot.technicalDetails.filter((detail) => detail.category === group.category);
        return `
            <section class="technical-detail-group technical-detail-${escapeHtml(group.category)}">
                <strong>${escapeHtml(group.label)}</strong>
                <div>
                    ${details.length
                        ? details.map((detail) => `<span>${escapeHtml(detail.label)} <b>${detail.count}</b></span>`).join("")
                        : '<span class="technical-detail-empty">无可识别细分类</span>'}
                </div>
            </section>
        `;
    }).join("");
}

function renderMetricControls(elements: StrengthPageElements, state: StrengthViewState): void {
    const changedKeys = new Set(getChangedMetricKeys(state.snapshots));
    elements.metricControls.innerHTML = METRIC_DEFINITIONS.map(({ key, label }) => `
        <label class="metric-option${changedKeys.has(key) ? " has-change" : ""}">
            <input class="form-check-input" type="checkbox" value="${escapeHtml(key)}" data-metric-key="${escapeHtml(key)}" ${state.selectedMetricKeys.has(key) ? "checked" : ""}>
            <span>${escapeHtml(label)}</span>
            <small>${changedKeys.has(key) ? "有变化" : "无变化"}</small>
        </label>
    `).join("");
    elements.selectChangedButton.disabled = state.importing || state.snapshots.length < 2;
    elements.selectAllButton.disabled = state.importing || state.snapshots.length === 0;

    if (state.snapshots.length < 2) {
        elements.comparisonMeta.textContent = "当前只有一份实力表；横轴按已勾选类别排列。";
    } else {
        elements.comparisonMeta.textContent = `${state.snapshots.length} 份实力表并列展示，当前有 ${changedKeys.size} 项指标发生变化。`;
    }
}

function renderComparisonTable(elements: StrengthPageElements, state: StrengthViewState): void {
    const matrix = buildComparisonMatrix(state.snapshots, state.selectedMetricKeys);
    if (!matrix.categories.length) {
        elements.comparisonTable.innerHTML = '<div class="comparison-table-empty">请选择至少一个对比指标。</div>';
        return;
    }
    elements.comparisonTable.innerHTML = `
        <table class="table table-sm align-middle comparison-table">
            <thead>
                <tr>
                    <th scope="col">实力表</th>
                    ${matrix.categories.map(({ label }) => `<th scope="col">${escapeHtml(label)}</th>`).join("")}
                </tr>
            </thead>
            <tbody>
                ${matrix.series.map((series, index) => `
                    <tr>
                        <th scope="row">
                            ${escapeHtml(series.label)}
                            ${index === matrix.series.length - 1 ? '<span class="table-current-badge">当前</span>' : ""}
                        </th>
                        ${series.values.map((value) => `<td>${value}<small>人</small></td>`).join("")}
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;
}

export function renderStrengthView(elements: StrengthPageElements, state: StrengthViewState): void {
    elements.fileInput.disabled = state.importing;
    elements.dropZone.setAttribute("aria-busy", String(state.importing));
    renderFileList(elements, state);
    renderErrors(elements, state.errors);
    const current = state.snapshots[state.snapshots.length - 1];
    elements.reportSection.hidden = !current;
    elements.exportImageButton.disabled = state.importing || !current;
    elements.exportExcelButton.disabled = state.importing || !current;
    if (!current) return;
    renderSummary(elements, current);
    renderTechnicalDetails(elements, current);
    renderMetricControls(elements, state);
    renderComparisonTable(elements, state);
}
