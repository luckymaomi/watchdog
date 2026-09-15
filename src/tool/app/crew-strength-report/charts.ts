import { buildComparisonMatrix } from "./logic";
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

function technicalCategoryColor(category: "instructor" | "captain" | "firstOfficer"): string {
    const colors = {
        instructor: cssColor("--strength-instructor-chart", "#a9bfd6"),
        captain: cssColor("--strength-captain-chart", "#a9cbbf"),
        firstOfficer: cssColor("--strength-first-officer-chart", "#d2bead")
    };
    return colors[category];
}

function snapshotSeriesColors(count: number): string[] {
    const isDark = document.documentElement.dataset.theme === "dark";
    return Array.from(
        { length: count },
        (_, index) => index < 10
            ? cssColor(`--strength-snapshot-${index + 1}`, "#a9bfd6")
            : `hsl(${Math.round((index * 137.508) % 360)} 24% ${isDark ? 58 : 68}%)`
    );
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
            textStyle: { color: theme.text },
            tooltip: {
                ...theme.tooltip,
                trigger: "item",
                formatter: "{b}<br/>{c} 人（{d}%）"
            },
            toolbox: saveImageToolbox(fileName, theme.surface),
            series: [
                {
                    name: "技术大类",
                    type: "pie",
                    radius: ["0%", "29%"],
                    center: ["50%", "50%"],
                    minAngle: 2,
                    selectedMode: false,
                    label: {
                        position: "inside",
                        color: theme.text,
                        fontWeight: 700,
                        lineHeight: 17,
                        formatter: "{b}\n{c} 人"
                    },
                    labelLine: { show: false },
                    data: [
                        {
                            name: "教员",
                            value: snapshot.metrics.instructor,
                            itemStyle: { color: technicalCategoryColor("instructor") }
                        },
                        {
                            name: "机长",
                            value: snapshot.metrics.captain,
                            itemStyle: { color: technicalCategoryColor("captain") }
                        },
                        {
                            name: "副驾驶",
                            value: snapshot.metrics.firstOfficer,
                            itemStyle: { color: technicalCategoryColor("firstOfficer") }
                        }
                    ]
                },
                {
                    name: "技术细分类",
                    type: "pie",
                    radius: ["39%", "66%"],
                    center: ["50%", "50%"],
                    minAngle: 1,
                    minShowLabelAngle: 1,
                    avoidLabelOverlap: true,
                    label: {
                        color: theme.text,
                        lineHeight: 16,
                        formatter: "{b}\n{c} 人"
                    },
                    labelLine: {
                        length: 12,
                        length2: 9,
                        lineStyle: { color: theme.muted }
                    },
                    labelLayout: { hideOverlap: true },
                    data: snapshot.technicalDetails.map((detail, index) => ({
                        name: detail.label,
                        value: detail.count,
                        itemStyle: {
                            color: technicalCategoryColor(detail.category),
                            opacity: 0.56 + (index % 4) * 0.12
                        }
                    }))
                }
            ]
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
        const matrix = buildComparisonMatrix(snapshots, selectedMetricKeys);
        comparisonChart.clear();
        if (!matrix.categories.length) {
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

        comparisonChart.setOption({
            animationDuration: 280,
            color: snapshotSeriesColors(matrix.series.length),
            textStyle: { color: theme.text },
            tooltip: {
                ...theme.tooltip,
                trigger: "axis",
                axisPointer: { type: comparisonType === "bar" ? "shadow" : "line" }
            },
            legend: {
                bottom: 2,
                left: "center",
                right: 8,
                type: "scroll",
                textStyle: { color: theme.text }
            },
            toolbox: saveImageToolbox(`实力分类对比_${snapshots[snapshots.length - 1]?.label || "对比"}`, theme.surface),
            grid: {
                top: 48,
                right: 30,
                bottom: 78,
                left: 54
            },
            xAxis: {
                type: "category",
                data: matrix.categories.map(({ label }) => label.replace("（", "\n（")),
                axisLine: theme.axisLine,
                axisLabel: {
                    color: theme.muted,
                    interval: 0,
                    lineHeight: 18
                }
            },
            yAxis: {
                type: "value",
                minInterval: 1,
                axisLabel: { color: theme.muted },
                splitLine: theme.splitLine
            },
            series: matrix.series.map((series) => ({
                name: series.label,
                type: comparisonType,
                data: series.values,
                label: {
                    show: true,
                    position: "top",
                    color: theme.text,
                    fontWeight: 700,
                    formatter: "{c}"
                },
                labelLayout: { hideOverlap: true },
                ...(comparisonType === "bar"
                    ? { barMaxWidth: 42 }
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
