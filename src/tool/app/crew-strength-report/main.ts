import type * as XlsxRuntime from "xlsx-js-style";

import { createStrengthCharts, type StrengthEchartsApi } from "./charts";
import {
    buildStrengthExportFileName,
    buildStrengthExportWorkbook
} from "./export";
import {
    METRIC_DEFINITIONS,
    getChangedMetricKeys,
    getDefaultSelectedMetricKeys,
    moveSnapshotByIndex
} from "./logic";
import type {
    StrengthComparisonChartType,
    StrengthImportError,
    StrengthMetricKey,
    StrengthSnapshot
} from "./models";
import { renderStrengthView, type StrengthPageElements } from "./view";
import { readStrengthSnapshotFromFile } from "./workbook";

interface Html2CanvasOptions {
    backgroundColor?: string | null;
    logging?: boolean;
    scale?: number;
    useCORS?: boolean;
}

type Html2CanvasApi = (element: HTMLElement, options?: Html2CanvasOptions) => Promise<HTMLCanvasElement>;

type StrengthBrowserWindow = Window & {
    XLSX?: typeof XlsxRuntime;
    echarts?: StrengthEchartsApi;
    html2canvas?: Html2CanvasApi;
};

interface AppState {
    snapshots: StrengthSnapshot[];
    errors: StrengthImportError[];
    selectedMetricKeys: Set<StrengthMetricKey>;
    comparisonType: StrengthComparisonChartType;
    importing: boolean;
}

const browserWindow = window as unknown as StrengthBrowserWindow;
let idSequence = 0;
let draggedSnapshotId = "";
let renderFrameId = 0;

function requiredElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`页面缺少必要元素：${id}`);
    return element as T;
}

function pageElements(): StrengthPageElements {
    return {
        statusLine: requiredElement("statusLine"),
        dropZone: requiredElement("dropZone"),
        fileInput: requiredElement<HTMLInputElement>("fileInput"),
        fileCount: requiredElement("fileCount"),
        fileList: requiredElement("fileList"),
        importErrors: requiredElement("importErrors"),
        clearButton: requiredElement<HTMLButtonElement>("clearButton"),
        reportSection: requiredElement("reportSection"),
        reportCapture: requiredElement("reportCapture"),
        reportTitle: requiredElement("reportTitle"),
        reportMeta: requiredElement("reportMeta"),
        reportWarning: requiredElement("reportWarning"),
        summaryGrid: requiredElement("summaryGrid"),
        metricControls: requiredElement("metricControls"),
        comparisonMeta: requiredElement("comparisonMeta"),
        selectChangedButton: requiredElement<HTMLButtonElement>("selectChangedButton"),
        selectAllButton: requiredElement<HTMLButtonElement>("selectAllButton"),
        exportImageButton: requiredElement<HTMLButtonElement>("exportImageButton"),
        exportExcelButton: requiredElement<HTMLButtonElement>("exportExcelButton"),
        technicalChart: requiredElement("technicalChart"),
        leadershipChart: requiredElement("leadershipChart"),
        comparisonChart: requiredElement("comparisonChart")
    };
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function isExcelFile(file: File): boolean {
    return /\.(xlsx|xls)$/i.test(file.name);
}

function isMetricKey(value: string): value is StrengthMetricKey {
    return METRIC_DEFINITIONS.some(({ key }) => key === value);
}

function nextSnapshotId(): string {
    idSequence += 1;
    return `strength-${Date.now()}-${idSequence}`;
}

function safeFilePart(value: string): string {
    return value.replace(/[\\/:*?"<>|]/g, "-");
}

function triggerPngDownload(canvas: HTMLCanvasElement, fileName: string): Promise<void> {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error("浏览器未能生成 PNG 文件。"));
                return;
            }
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 0);
            resolve();
        }, "image/png");
    });
}

function init(): void {
    const elements = pageElements();
    const XLSX = browserWindow.XLSX || null;
    const charts = createStrengthCharts(browserWindow.echarts || null, {
        technicalChart: elements.technicalChart,
        leadershipChart: elements.leadershipChart,
        comparisonChart: elements.comparisonChart
    });
    const state: AppState = {
        snapshots: [],
        errors: [],
        selectedMetricKeys: new Set(),
        comparisonType: "bar",
        importing: false
    };

    function setStatus(message: string, type: "muted" | "success" | "warning" | "danger" = "muted"): void {
        elements.statusLine.className = `status-line status-${type}`;
        elements.statusLine.textContent = message;
    }

    function render(): void {
        renderStrengthView(elements, state);
        window.cancelAnimationFrame(renderFrameId);
        if (!state.snapshots.length) return;
        renderFrameId = window.requestAnimationFrame(() => {
            charts.render(state.snapshots, state.selectedMetricKeys, state.comparisonType);
        });
    }

    function resetDefaultMetrics(): void {
        state.selectedMetricKeys = new Set(getDefaultSelectedMetricKeys(state.snapshots));
    }

    async function importFiles(files: readonly File[]): Promise<void> {
        if (!XLSX) {
            setStatus("Excel 组件未加载，请刷新页面后重试。", "danger");
            return;
        }
        if (!files.length) return;

        state.importing = true;
        state.errors = [];
        render();
        let importedCount = 0;
        for (let index = 0; index < files.length; index += 1) {
            const file = files[index];
            setStatus(`正在读取 ${index + 1}/${files.length}：${file.name}`, "muted");
            if (!isExcelFile(file)) {
                state.errors.push({ fileName: file.name, message: "仅支持 .xlsx 或 .xls 文件。" });
                continue;
            }
            try {
                const snapshot = await readStrengthSnapshotFromFile(XLSX, file, nextSnapshotId());
                state.snapshots.push(snapshot);
                importedCount += 1;
                render();
            } catch (error) {
                state.errors.push({ fileName: file.name, message: errorMessage(error) });
            }
        }

        if (importedCount) resetDefaultMetrics();
        state.importing = false;
        render();
        const failedCount = state.errors.length;
        const current = state.snapshots[state.snapshots.length - 1];
        if (importedCount && failedCount) {
            setStatus(`本次导入 ${importedCount} 份，${failedCount} 份失败；当前快照为 ${current.label}。`, "warning");
        } else if (importedCount) {
            setStatus(`已导入 ${importedCount} 份；当前共 ${state.snapshots.length} 份，当前快照为 ${current.label}。`, "success");
        } else {
            setStatus(`${failedCount} 份文件均未导入，请查看失败原因。`, "danger");
        }
    }

    function moveSnapshot(snapshotId: string, offset: -1 | 1): void {
        const fromIndex = state.snapshots.findIndex(({ id }) => id === snapshotId);
        const toIndex = fromIndex + offset;
        state.snapshots = moveSnapshotByIndex(state.snapshots, fromIndex, toIndex);
        const current = state.snapshots[state.snapshots.length - 1];
        setStatus(`已调整顺序；当前快照为 ${current.label}。`, "success");
        render();
    }

    function removeSnapshot(snapshotId: string): void {
        const removed = state.snapshots.find(({ id }) => id === snapshotId);
        if (!removed) return;
        state.snapshots = state.snapshots.filter(({ id }) => id !== snapshotId);
        resetDefaultMetrics();
        setStatus(
            state.snapshots.length
                ? `已移除 ${removed.fileName}，并按剩余文件重新选择变化指标。`
                : "已移除最后一份文件。",
            "success"
        );
        render();
    }

    function clearDropTargets(): void {
        elements.fileList.querySelectorAll(".is-drop-target").forEach((element) => {
            element.classList.remove("is-drop-target");
        });
    }

    elements.fileInput.addEventListener("change", () => {
        const files = Array.from(elements.fileInput.files || []);
        elements.fileInput.value = "";
        void importFiles(files);
    });

    ["dragenter", "dragover"].forEach((eventName) => {
        elements.dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            if (!state.importing) elements.dropZone.classList.add("is-dragover");
        });
    });
    elements.dropZone.addEventListener("dragleave", (event) => {
        const related = event.relatedTarget;
        if (!(related instanceof Node) || !elements.dropZone.contains(related)) {
            elements.dropZone.classList.remove("is-dragover");
        }
    });
    elements.dropZone.addEventListener("drop", (event) => {
        event.preventDefault();
        elements.dropZone.classList.remove("is-dragover");
        if (state.importing) return;
        void importFiles(Array.from(event.dataTransfer?.files || []));
    });
    elements.dropZone.addEventListener("click", (event) => {
        const target = event.target;
        if (target instanceof HTMLElement && !target.closest("label") && !state.importing) {
            elements.fileInput.click();
        }
    });

    elements.fileList.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const button = target.closest<HTMLButtonElement>("[data-file-action]");
        const card = target.closest<HTMLElement>("[data-snapshot-id]");
        const snapshotId = card?.dataset.snapshotId;
        if (!button || !snapshotId || state.importing) return;
        if (button.dataset.fileAction === "remove") removeSnapshot(snapshotId);
        if (button.dataset.fileAction === "up") moveSnapshot(snapshotId, -1);
        if (button.dataset.fileAction === "down") moveSnapshot(snapshotId, 1);
    });

    elements.fileList.addEventListener("dragstart", (event) => {
        if (state.importing) return;
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const card = target.closest<HTMLElement>("[data-snapshot-id]");
        if (!card?.dataset.snapshotId) return;
        draggedSnapshotId = card.dataset.snapshotId;
        card.classList.add("is-dragging");
        event.dataTransfer?.setData("text/plain", draggedSnapshotId);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    });
    elements.fileList.addEventListener("dragover", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement) || !draggedSnapshotId) return;
        const card = target.closest<HTMLElement>("[data-snapshot-id]");
        if (!card || card.dataset.snapshotId === draggedSnapshotId) return;
        event.preventDefault();
        clearDropTargets();
        card.classList.add("is-drop-target");
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    });
    elements.fileList.addEventListener("drop", (event) => {
        event.preventDefault();
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const targetId = target.closest<HTMLElement>("[data-snapshot-id]")?.dataset.snapshotId;
        if (!draggedSnapshotId || !targetId || draggedSnapshotId === targetId) return;
        const fromIndex = state.snapshots.findIndex(({ id }) => id === draggedSnapshotId);
        const toIndex = state.snapshots.findIndex(({ id }) => id === targetId);
        state.snapshots = moveSnapshotByIndex(state.snapshots, fromIndex, toIndex);
        const current = state.snapshots[state.snapshots.length - 1];
        setStatus(`已拖动调整顺序；当前快照为 ${current.label}。`, "success");
        clearDropTargets();
        render();
    });
    elements.fileList.addEventListener("dragend", () => {
        draggedSnapshotId = "";
        clearDropTargets();
        elements.fileList.querySelectorAll(".is-dragging").forEach((element) => {
            element.classList.remove("is-dragging");
        });
    });

    elements.metricControls.addEventListener("change", (event) => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement)) return;
        const key = input.dataset.metricKey || "";
        if (!isMetricKey(key)) return;
        if (input.checked) state.selectedMetricKeys.add(key);
        else state.selectedMetricKeys.delete(key);
        render();
    });
    document.querySelectorAll<HTMLInputElement>('input[name="chartType"]').forEach((input) => {
        input.addEventListener("change", () => {
            if (!input.checked || (input.value !== "bar" && input.value !== "line")) return;
            state.comparisonType = input.value;
            render();
        });
    });
    elements.selectChangedButton.addEventListener("click", () => {
        state.selectedMetricKeys = new Set(getChangedMetricKeys(state.snapshots));
        render();
    });
    elements.selectAllButton.addEventListener("click", () => {
        state.selectedMetricKeys = new Set(METRIC_DEFINITIONS.map(({ key }) => key));
        render();
    });

    elements.clearButton.addEventListener("click", () => {
        state.snapshots = [];
        state.errors = [];
        state.selectedMetricKeys = new Set();
        setStatus("已清空全部实力表。", "muted");
        render();
    });

    elements.exportExcelButton.addEventListener("click", () => {
        const current = state.snapshots[state.snapshots.length - 1];
        if (!XLSX || !current) return;
        try {
            XLSX.writeFile(buildStrengthExportWorkbook(XLSX, state.snapshots), buildStrengthExportFileName(current));
            setStatus("统计 Excel 已导出。", "success");
        } catch (error) {
            setStatus(`Excel 导出失败：${errorMessage(error)}`, "danger");
        }
    });

    elements.exportImageButton.addEventListener("click", async () => {
        const current = state.snapshots[state.snapshots.length - 1];
        if (!current) return;
        if (!browserWindow.html2canvas) {
            setStatus("图片导出组件未加载，请刷新页面后重试。", "danger");
            return;
        }
        elements.exportImageButton.disabled = true;
        setStatus("正在生成周报 PNG…", "muted");
        try {
            await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
            const backgroundColor = getComputedStyle(document.documentElement)
                .getPropertyValue("--watchdog-page-bg").trim() || "#f1f2f0";
            const canvas = await browserWindow.html2canvas(elements.reportCapture, {
                backgroundColor,
                logging: false,
                scale: 2,
                useCORS: true
            });
            await triggerPngDownload(canvas, `飞行实力周报_${safeFilePart(current.label)}.png`);
            setStatus("周报 PNG 已导出。", "success");
        } catch (error) {
            setStatus(`图片导出失败：${errorMessage(error)}`, "danger");
        } finally {
            elements.exportImageButton.disabled = false;
        }
    });

    window.addEventListener("resize", () => charts.resize());
    window.addEventListener("watchdog:themechange", () => render());

    if (!XLSX) {
        elements.fileInput.disabled = true;
        setStatus("Excel 组件未加载，请刷新页面后重试。", "danger");
    }
    render();
}

document.addEventListener("DOMContentLoaded", init);
