import { METRIC_DEFINITIONS } from "./logic";
import type {
    StrengthComparisonChartType,
    StrengthMetricKey,
    StrengthSnapshot
} from "./models";

export interface StrengthChartInstance {
    clear(): void;
    resize(): void;
    setOption(option: Record<string, unknown>, notMerge?: boolean): void;
}

export interface StrengthEchartsApi {
    init(element: HTMLElement): StrengthChartInstance;
}

export interface StrengthChartElements {
    technicalChart: HTMLElement;
    leadershipChart: HTMLElement;
    comparisonChart: HTMLElement;
}

export interface StrengthChartsController {
    render(
        snapshots: readonly StrengthSnapshot[],
        selectedMetricKeys: ReadonlySet<StrengthMetricKey>,
        comparisonType: StrengthComparisonChartType
    ): void;
    resize(): void;
}

function cssColor(name: string, fallback: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function chartTheme() {
    const text = cssColor("--watchdog-text", "#1f2933");
    const muted = cssColor("--watchdog-text-muted", "#596675");
    const border = cssColor("--watchdog-border", "#4b5563");
    const surface = cssColor("--watchdog-surface", "#fbfbfa");
    return {
        text,
        muted,
        border,
        surface,
        axisLine: { lineStyle: { color: border } },
        splitLine: { lineStyle: { color: border, opacity: 0.34 } },
        tooltip: {
            backgroundColor: surface,
            borderColor: border,
            textStyle: { color: text }
        }
    };
}

function saveImageToolbox(fileName: string, backgroundColor: string): Record<string, unknown> {
    return {
        right: 8,
        feature: {
            saveAsImage: {
                name: fileName,
                title: "保存图片",
                pixelRatio: 2,
                backgroundColor
            }
        },
        iconStyle: {
            borderColor: cssColor("--watchdog-text-muted", "#596675")
        }
    };
}

export function createStrengthCharts(
    echarts: StrengthEchartsApi | null,
    elements: StrengthChartElements
): StrengthChartsController {
    let technicalChart: StrengthChartInstance | null = null;
    let leadershipChart: StrengthChartInstance | null = null;
    let comparisonChart: StrengthChartInstance | null = null;

    function instance(
        element: HTMLElement,
        current: StrengthChartInstance | null
    ): StrengthChartInstance | null {
        if (!echarts) return null;
        return current || echarts.init(element);
    }

    function renderMissingDependency(): void {
        Object.values(elements).forEach((element) => {
            element.innerHTML = '<div class="chart-empty">图表组件未加载，请刷新页面后重试。</div>';
        });
    }

    function renderTechnical(snapshot: StrengthSnapshot): void {
        technicalChart = instance(elements.technicalChart, technicalChart);
        if (!technicalChart) return;
        const theme = chartTheme();
        const fileName = `技术信息_${snapshot.label}`;
        technicalChart.clear();
        technicalChart.setOption({
            animationDuration: 280,
            color: [
                cssColor("--strength-instructor-chart", "#a9bfd6"),
                cssColor("--strength-captain-chart", "#a9cbbf"),
                cssColor("--strength-first-officer-chart", "#d2bead")
            ],
            textStyle: { color: theme.text },
            tooltip: {
                ...theme.tooltip,
                trigger: "item",
                formatter: "{b}<br/>{c} 人（{d}%）"
            },
            legend: {
                bottom: 4,
                left: "center",
                textStyle: { color: theme.text }
            },
            toolbox: saveImageToolbox(fileName, theme.surface),
            series: [{
                name: "技术信息",
                type: "pie",
                radius: ["34%", "66%"],
                center: ["50%", "44%"],
                minAngle: 2,
                avoidLabelOverlap: true,
                label: {
                    color: theme.text,
                    formatter: "{b}\n{c} 人"
                },
                labelLine: {
                    lineStyle: { color: theme.muted }
                },
                data: [
                    { name: "教员", value: snapshot.metrics.instructor },
                    { name: "机长", value: snapshot.metrics.captain },
                    { name: "副驾驶", value: snapshot.metrics.firstOfficer }
                ]
            }]
        }, true);
        technicalChart.resize();
    }

    function renderLeadership(snapshot: StrengthSnapshot): void {
        leadershipChart = instance(elements.leadershipChart, leadershipChart);
        if (!leadershipChart) return;
        const theme = chartTheme();
        leadershipChart.clear();
        leadershipChart.setOption({
            animationDuration: 280,
            textStyle: { color: theme.text },
            tooltip: {
                ...theme.tooltip,
                trigger: "axis",
                axisPointer: { type: "shadow" }
            },
            grid: { top: 48, right: 26, bottom: 42, left: 48 },
            toolbox: saveImageToolbox(`带队资格_${snapshot.label}`, theme.surface),
            xAxis: {
                type: "category",
                data: ["北美带队\nRAMA", "欧洲带队\nREUO"],
                axisLine: theme.axisLine,
                axisLabel: { color: theme.muted, lineHeight: 18 }
            },
            yAxis: {
                type: "value",
                minInterval: 1,
                axisLabel: { color: theme.muted },
                splitLine: theme.splitLine
            },
            series: [{
                name: "人数",
                type: "bar",
                barMaxWidth: 72,
                label: { show: true, position: "top", color: theme.text, fontWeight: 700 },
                data: [
                    {
                        value: snapshot.metrics.northAmericaLeader,
                        itemStyle: { color: cssColor("--strength-north-america-chart", "#a7c3d7") }
                    },
                    {
                        value: snapshot.metrics.europeLeader,
                        itemStyle: { color: cssColor("--strength-europe-chart", "#bbb4d1") }
                    }
                ]
            }]
        }, true);
        leadershipChart.resize();
    }

    function renderComparison(
        snapshots: readonly StrengthSnapshot[],
        selectedMetricKeys: ReadonlySet<StrengthMetricKey>,
        comparisonType: StrengthComparisonChartType
    ): void {
        comparisonChart = instance(elements.comparisonChart, comparisonChart);
        if (!comparisonChart) return;
        const theme = chartTheme();
        const selectedDefinitions = METRIC_DEFINITIONS.filter(({ key }) => selectedMetricKeys.has(key));
        comparisonChart.clear();
        if (!selectedDefinitions.length) {
            comparisonChart.setOption({
                textStyle: { color: theme.text },
                title: {
                    text: snapshots.length > 1 ? "当前文件之间没有已勾选的变化指标" : "请选择至少一个对比指标",
                    left: "center",
                    top: "middle",
                    textStyle: { color: theme.muted, fontSize: 14, fontWeight: 500 }
                }
            }, true);
            return;
        }

        const needsZoom = snapshots.length > 8;
        comparisonChart.setOption({
            animationDuration: 280,
            color: selectedDefinitions.map(({ colorVariable }) => cssColor(colorVariable, "#a9bfd6")),
            textStyle: { color: theme.text },
            tooltip: {
                ...theme.tooltip,
                trigger: "axis",
                axisPointer: { type: comparisonType === "bar" ? "shadow" : "line" }
            },
            legend: {
                top: 2,
                left: 8,
                right: 54,
                type: "scroll",
                textStyle: { color: theme.text }
            },
            toolbox: saveImageToolbox(`实力趋势_${snapshots[snapshots.length - 1]?.label || "对比"}`, theme.surface),
            grid: {
                top: 58,
                right: 30,
                bottom: needsZoom ? 68 : 44,
                left: 54
            },
            dataZoom: needsZoom
                ? [
                    { type: "inside", startValue: 0, endValue: 7 },
                    { type: "slider", height: 18, bottom: 8, borderColor: theme.border, textStyle: { color: theme.muted } }
                ]
                : undefined,
            xAxis: {
                type: "category",
                data: snapshots.map(({ label }) => label),
                axisLine: theme.axisLine,
                axisLabel: {
                    color: theme.muted,
                    interval: 0,
                    rotate: snapshots.length > 5 ? 28 : 0
                }
            },
            yAxis: {
                type: "value",
                minInterval: 1,
                axisLabel: { color: theme.muted },
                splitLine: theme.splitLine
            },
            series: selectedDefinitions.map(({ key, label }) => ({
                name: label,
                type: comparisonType,
                data: snapshots.map((snapshot) => snapshot.metrics[key]),
                ...(comparisonType === "bar"
                    ? { barMaxWidth: 48 }
                    : {
                        symbol: "circle",
                        symbolSize: 7,
                        lineStyle: { width: 2 },
                        emphasis: { focus: "series" }
                    })
            }))
        }, true);
        comparisonChart.resize();
    }

    function render(
        snapshots: readonly StrengthSnapshot[],
        selectedMetricKeys: ReadonlySet<StrengthMetricKey>,
        comparisonType: StrengthComparisonChartType
    ): void {
        if (!echarts) {
            renderMissingDependency();
            return;
        }
        const current = snapshots[snapshots.length - 1];
        if (!current) return;
        renderTechnical(current);
        renderLeadership(current);
        renderComparison(snapshots, selectedMetricKeys, comparisonType);
    }

    function resize(): void {
        [technicalChart, leadershipChart, comparisonChart].forEach((chart) => chart?.resize());
    }

    return { render, resize };
}
