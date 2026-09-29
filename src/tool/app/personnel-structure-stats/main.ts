import type * as XlsxRuntime from "xlsx-js-style";

import { fillPersonnelDocx, inspectPersonnelDocx } from "./docx-report";
import { calculate, parseRows } from "./logic";
import { buildReportTable, buildReportText, buildWorkbook } from "./report";
import type {
    PersonnelStructureElements,
    PersonnelStructureResult,
    PersonnelWorkbook,
    PersonnelWorksheet
} from "./models";

const XLSX = window.XLSX as unknown as typeof XlsxRuntime;

let workbook: PersonnelWorkbook | null = null;
let sourceFileName = "人员结构统计";
let currentResult: PersonnelStructureResult | null = null;
let docxTemplate: Uint8Array | null = null;
let docxFileName = "人员结构报告";
let docxWarnings: string[] = [];

const elements: PersonnelStructureElements = {
    fileInput: requireElement("fileInput", HTMLInputElement),
    sheetSelect: requireElement("sheetSelect", HTMLSelectElement),
    analyzeBtn: requireElement("analyzeBtn", HTMLButtonElement),
    exportBtn: requireElement("exportBtn", HTMLButtonElement),
    docxInput: requireElement("docxInput", HTMLInputElement),
    docxStatus: requireElement("docxStatus", HTMLElement),
    monthSelect: requireElement("monthSelect", HTMLSelectElement),
    exportDocxBtn: requireElement("exportDocxBtn", HTMLButtonElement),
    fileStatus: requireElement("fileStatus", HTMLElement),
    summary: requireElement("summary", HTMLElement),
    resultSection: requireElement("resultSection", HTMLElement),
    resultTables: requireElement("resultTables", HTMLElement),
    warningSection: requireElement("warningSection", HTMLElement),
    warningList: requireElement("warningList", HTMLElement)
};

function requireElement<T extends HTMLElement>(id: string, Type: { new(): T }): T {
    const element = document.getElementById(id);
    if (!(element instanceof Type)) {
        throw new Error(`页面缺少必要元素：${id}`);
    }
    return element;
}

function escapeHtml(value: unknown): string {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function showStatus(message: string, type: "success" | "error" | "hint" | "loading"): void {
    elements.fileStatus.textContent = message;
    elements.fileStatus.className = `status status-${type}`;
}

function stripExtension(fileName: string): string {
    return fileName.replace(/\.(xlsx|xls|docx)$/i, "");
}

function updateDocxExport(): void {
    elements.exportDocxBtn.disabled = !currentResult || !docxTemplate || !elements.monthSelect.value;
}

function timestamp(): string {
    const date = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function readSelectedRows(): unknown[][] {
    if (!workbook) throw new Error("请先上传人员信息表。");
    const sheetName = elements.sheetSelect.value || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName] as PersonnelWorksheet | undefined;
    if (!sheet) throw new Error(`未找到工作表：${sheetName}`);
    return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
}

function renderSheetOptions(sheetNames: string[]): void {
    elements.sheetSelect.innerHTML = sheetNames
        .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
        .join("");
    elements.sheetSelect.disabled = sheetNames.length <= 1;
}

async function handleFileChange(event: Event): Promise<void> {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const file = target.files?.[0];
    if (!file) return;

    try {
        showStatus("正在读取文件...", "loading");
        const data = new Uint8Array(await file.arrayBuffer());
        workbook = XLSX.read(data, { type: "array", cellDates: true });
        sourceFileName = stripExtension(file.name);
        currentResult = null;
        docxWarnings = [];
        renderSheetOptions(workbook.SheetNames);
        elements.analyzeBtn.disabled = false;
        elements.exportBtn.disabled = true;
        updateDocxExport();
        elements.resultSection.style.display = "none";
        elements.warningSection.style.display = "none";
        showStatus(`已加载：${file.name}（${workbook.SheetNames.length} 个工作表）`, "success");
    } catch (error) {
        workbook = null;
        currentResult = null;
        docxWarnings = [];
        elements.analyzeBtn.disabled = true;
        elements.exportBtn.disabled = true;
        updateDocxExport();
        elements.resultSection.style.display = "none";
        elements.warningSection.style.display = "none";
        showStatus(`文件解析失败：${error instanceof Error ? error.message : String(error)}`, "error");
    }
}

function handleAnalyze(): void {
    try {
        const rows = readSelectedRows();
        const records = parseRows(rows);
        const result = calculate(records);
        currentResult = result;
        docxWarnings = [];
        renderResult(result);
        elements.exportBtn.disabled = false;
        updateDocxExport();
        showStatus(`统计完成：${result.structureCrewCount} 人，8 张表全部闭环`, "success");
    } catch (error) {
        currentResult = null;
        elements.exportBtn.disabled = true;
        updateDocxExport();
        elements.resultSection.style.display = "none";
        elements.warningSection.style.display = "none";
        showStatus(`统计失败：${error instanceof Error ? error.message : String(error)}`, "error");
    }
}

function renderResult(result: PersonnelStructureResult): void {
    elements.summary.innerHTML = `
        <div class="summary-item">
            <span class="summary-label">结构统计人员</span>
            <strong class="summary-value">${result.structureCrewCount}</strong>
        </div>
        <div class="summary-item">
            <span class="summary-label">机长含以上</span>
            <strong class="summary-value">${result.captainOrAboveCount}</strong>
        </div>
        <div class="summary-item">
            <span class="summary-label">副驾驶</span>
            <strong class="summary-value">${result.firstOfficerCount}</strong>
        </div>
    `;

    elements.resultTables.innerHTML = result.sections.map((section, index) => `
        <div class="card mb-4">
            <div class="card-body">
                <div class="result-card-head">
                    <h5 class="card-title mb-0">${escapeHtml(section.title)}</h5>
                    <div class="result-card-meta">
                        <span>母数 ${escapeHtml(section.denominatorLabel)}</span>
                        <span>构成合计 ${section.closure.total} 人</span>
                        <strong class="closure-state ${section.closure.closed ? "is-closed" : "is-open"}">
                            ${section.closure.closed ? "已闭环" : "待核对"}
                        </strong>
                        <button type="button" class="btn btn-outline-secondary btn-sm copy-table" data-section="${index}" title="复制此表统计结果" aria-label="复制${escapeHtml(section.title)}">复制表格</button>
                    </div>
                </div>
                <div class="table-responsive result-table-shell">
                    <table class="table table-hover align-middle result-table mb-0">
                        <thead>
                            <tr>
                                <th>分组</th>
                                <th>项目</th>
                                <th>人数</th>
                                <th>占比</th>
                                <th>口径</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${buildReportTable(section).rows.map((row) => `
                                <tr class="${row.isSubtotal ? "subtotal-row" : row.relation === "其中项" ? "subset-row" : ""}">
                                    ${row.values.map(value => `<td>${escapeHtml(value)}</td>`).join("")}
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `).join("");

    renderWarnings(result);
    elements.resultSection.style.display = "block";
}

function renderWarnings(result: PersonnelStructureResult): void {
    const warnings = [
        ...result.warnings,
        ...result.unrecognized.techInfo.map((item) => `未识别技术信息：${item}`),
        ...result.unrecognized.origin.map((item) => `未映射原单位：${item}`),
        ...docxWarnings
    ];

    if (warnings.length) {
        elements.warningSection.style.display = "block";
        elements.warningList.innerHTML = warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("");
    } else {
        elements.warningSection.style.display = "none";
        elements.warningList.innerHTML = "";
    }

}

function handleExport(): void {
    if (!currentResult) return;
    XLSX.writeFile(buildWorkbook(XLSX, currentResult), `${sourceFileName}_人员结构统计_${timestamp()}.xlsx`);
}

async function handleCopyTable(event: MouseEvent): Promise<void> {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button.copy-table");
    if (!button || !currentResult) return;
    const section = currentResult.sections[Number(button.dataset.section)];
    if (!section) return;
    try {
        await navigator.clipboard.writeText(buildReportText(section));
        const previous = button.textContent;
        button.textContent = "已复制";
        window.setTimeout(() => { button.textContent = previous; }, 1600);
    } catch {
        showStatus("复制失败，请使用导出 Excel 获取统计结果。", "error");
    }
}

function handleSheetChange(): void {
    currentResult = null;
    docxWarnings = [];
    elements.exportBtn.disabled = true;
    updateDocxExport();
    elements.resultSection.style.display = "none";
    elements.warningSection.style.display = "none";
}

async function handleDocxChange(): Promise<void> {
    const file = elements.docxInput.files?.[0];
    docxTemplate = null;
    docxWarnings = [];
    if (currentResult) renderWarnings(currentResult);
    elements.monthSelect.replaceChildren();
    elements.monthSelect.disabled = true;
    updateDocxExport();
    if (!file) {
        elements.docxStatus.textContent = "尚未选择 Word 模板。";
        return;
    }
    elements.docxStatus.textContent = "正在检查 Word 模板...";
    try {
        if (!/\.docx$/i.test(file.name)) throw new Error("请选择 .docx 格式的 Word 模板。");
        const bytes = new Uint8Array(await file.arrayBuffer());
        const info = await inspectPersonnelDocx(bytes);
        for (const month of info.months) {
            const option = document.createElement("option");
            option.value = String(month);
            option.textContent = `${month}月`;
            elements.monthSelect.appendChild(option);
        }
        elements.monthSelect.value = info.suggestedMonth ? String(info.suggestedMonth) : "";
        if (!info.suggestedMonth) {
            const placeholder = document.createElement("option");
            placeholder.value = "";
            placeholder.textContent = "请选择月份";
            elements.monthSelect.prepend(placeholder);
            elements.monthSelect.value = "";
        }
        elements.monthSelect.disabled = false;
        docxTemplate = bytes;
        docxFileName = stripExtension(file.name);
        elements.docxStatus.textContent = `已加载：${file.name}${info.suggestedMonth ? `；写入 ${info.suggestedMonth}月` : "；请选择写入月份"}`;
        updateDocxExport();
    } catch (error) {
        elements.docxStatus.textContent = `Word 模板无法使用：${error instanceof Error ? error.message : String(error)}`;
    }
}

async function handleDocxExport(): Promise<void> {
    if (!docxTemplate || !currentResult || !elements.monthSelect.value) return;
    elements.exportDocxBtn.disabled = true;
    try {
        const output = await fillPersonnelDocx(docxTemplate, currentResult, Number(elements.monthSelect.value));
        const blob = new Blob([new Uint8Array(output.bytes)], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = `${docxFileName}_已填充_${output.month}月_${timestamp()}.docx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        showStatus(`Word 已填充 ${output.filledRows} 行。请核对未自动更新的飞行管理人数及其他部门数据。`, "success");
        docxWarnings = output.warnings.filter(item => !currentResult!.warnings.includes(item));
        renderWarnings(currentResult);
    } catch (error) {
        showStatus(`Word 导出失败：${error instanceof Error ? error.message : String(error)}`, "error");
    } finally {
        updateDocxExport();
    }
}

elements.fileInput.addEventListener("change", handleFileChange);
elements.analyzeBtn.addEventListener("click", handleAnalyze);
elements.exportBtn.addEventListener("click", handleExport);
elements.sheetSelect.addEventListener("change", handleSheetChange);
elements.resultTables.addEventListener("click", handleCopyTable);
elements.docxInput.addEventListener("change", handleDocxChange);
elements.monthSelect.addEventListener("change", updateDocxExport);
elements.exportDocxBtn.addEventListener("click", handleDocxExport);
