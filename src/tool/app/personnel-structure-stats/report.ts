import type * as XlsxRuntime from "xlsx-js-style";

import { REQUIRED_HEADERS } from "./logic";
import type { PersonnelStatSection, PersonnelStructureResult, PersonnelWorksheet } from "./models";

type ReportRow = {
    values: [string, string, number, string, string];
    relation: "构成项" | "其中项" | "分组小计";
    isSubtotal: boolean;
    denominator: number;
};

export type ReportTable = {
    headers: [string, string, string, string, string];
    rows: ReportRow[];
};

const CAPTAIN_LEVEL_TITLE = "机长含以上各级别占比";
const TEACHER_LEVELS = new Set(["C类教员", "B类教员"]);

function subtotal(group: string, count: number, denominator: number, rule: string): ReportRow {
    const percent = denominator ? `${Math.round(count / denominator * 100)}%` : "0%";
    return { values: [`${group}（${count}）`, "小计", count, percent, rule], relation: "分组小计", isSubtotal: true, denominator };
}

export function buildReportTable(section: PersonnelStatSection): ReportTable {
    const headers: ReportTable["headers"] = ["分组", "项目", "人数", "占比", "口径"];
    if (section.title !== CAPTAIN_LEVEL_TITLE) {
        return {
            headers,
            rows: section.items.map(item => ({
                values: ["", `${item.isSubset ? "其中：" : ""}${item.label}`, item.count, item.percent, item.rule],
                relation: item.isSubset ? "其中项" : "构成项",
                isSubtotal: false,
                denominator: item.denominator
            }))
        };
    }

    const teacherCount = section.items.filter(item => TEACHER_LEVELS.has(item.label)).reduce((total, item) => total + item.count, 0);
    const captainCount = section.closure.denominator - teacherCount;
    const teacherRow = subtotal("教员", teacherCount, section.closure.denominator, "C/B类教员。");
    const captainRow = subtotal("机长", captainCount, section.closure.denominator, "含F/E/D/C/B/Z类机长、转机型机长及其他机长等级。");
    captainRow.values[3] = section.closure.denominator ? `${100 - Number.parseInt(teacherRow.values[3], 10)}%` : "0%";

    const rows: ReportRow[] = [];
    let teacherInserted = false;
    let captainInserted = false;
    for (const item of section.items) {
        const teacher = TEACHER_LEVELS.has(item.label);
        if (teacher && !teacherInserted) {
            rows.push(teacherRow);
            teacherInserted = true;
        }
        if (!teacher && !item.isSubset && !captainInserted) {
            rows.push(captainRow);
            captainInserted = true;
        }
        rows.push({
            values: [item.isSubset ? "其中" : teacher ? teacherRow.values[0] : captainRow.values[0], `${item.isSubset ? "其中：" : ""}${item.label}`, item.count, item.percent, item.rule],
            relation: item.isSubset ? "其中项" : "构成项",
            isSubtotal: false,
            denominator: item.denominator
        });
    }
    if (!teacherInserted) rows.push(teacherRow);
    if (!captainInserted) rows.push(captainRow);
    return { headers, rows };
}

export function buildReportText(section: PersonnelStatSection): string {
    const table = buildReportTable(section);
    const lines: (string | number)[][] = [
        [`${section.title}（${section.closure.denominator}人）`],
        table.headers,
        ...table.rows.map(row => row.values)
    ];
    return lines.map(row => row.join("\t")).join("\n");
}

function buildResultRows(result: PersonnelStructureResult): (string | number)[][] {
    const rows: (string | number)[][] = [["表格", "分组", "项目", "统计关系", "人数", "母数", "占比", "口径"]];
    for (const section of result.sections) {
        for (const row of buildReportTable(section).rows) {
            rows.push([section.title, row.values[0], row.values[1], row.relation, row.values[2], row.denominator, row.values[3], row.values[4]]);
        }
    }
    return rows;
}

function buildClosureRows(result: PersonnelStructureResult): (string | number)[][] {
    return [
        ["表格", "构成合计", "闭环母数", "状态"],
        ...result.sections.map(section => [section.title, section.closure.total, section.closure.denominator, section.closure.closed ? "已闭环" : "待核对"])
    ];
}

function buildRuleRows(result: PersonnelStructureResult): (string | number)[][] {
    return [
        ["规则", "说明"],
        ["输入", "上传任意 xlsx/xls，按表头识别字段，不绑定文件名、sheet 名或列位置。"],
        ["必要表头", REQUIRED_HEADERS.join("、")],
        ["结构统计人员", "教员、普通机长、转机型机长、普通副驾驶、转机型副驾驶。"],
        ["机长等级", "C/B类教员、F/E/D/C/B/Z类机长与转机型机长；检查员为其中项。"],
        ["转机型机长", "技术信息为划转机长；航线资格和报务不包含转机型。"],
        ["转机型副驾驶", "技术信息为划转副驾驶；级别包含转机型，报务不包含转机型。"],
        ["闭环", "每张表的构成项人数合计等于闭环母数；其中项及分组小计不重复计入。"],
        ["单飞资格", "RAMA/REUO/RWAS 分别代表北美、欧洲、西亚单飞资格。"],
        ["报务资格", "EAMA/EEUO/EWAS 分别代表北美、欧洲、西亚英语通信资格。"],
        ["航线机长", "无 RAMA/REUO/RWAS 单飞资格且不是 Z 类机长的人员统一归入航线机长，包含原本无法归入其他航线资格分类的人员。"],
        ["左座带飞", "Z类机长。"],
        ["本地居住", "原单位以总队开头，或原单位为 777返聘。"],
        ["导出时间", new Date().toLocaleString("zh-CN")],
        ["结构统计人员", result.structureCrewCount],
        ["机长含以上", result.captainOrAboveCount],
        ["副驾驶", result.firstOfficerCount]
    ];
}

function buildUnrecognizedRows(result: PersonnelStructureResult): string[][] {
    const rows = [["类型", "内容"]];
    result.unrecognized.techInfo.forEach(item => rows.push(["未识别技术信息", item]));
    result.unrecognized.origin.forEach(item => rows.push(["未映射原单位", item]));
    if (rows.length === 1) rows.push(["无", ""]);
    return rows;
}

function applySheetWidth(sheet: PersonnelWorksheet, widths: number[]): void {
    sheet["!cols"] = widths.map(wch => ({ wch }));
}

export function buildWorkbook(xlsx: typeof XlsxRuntime, result: PersonnelStructureResult): XlsxRuntime.WorkBook {
    const output = xlsx.utils.book_new();
    const resultSheet = xlsx.utils.aoa_to_sheet(buildResultRows(result));
    const closureSheet = xlsx.utils.aoa_to_sheet(buildClosureRows(result));
    const ruleSheet = xlsx.utils.aoa_to_sheet(buildRuleRows(result));
    const unrecognizedSheet = xlsx.utils.aoa_to_sheet(buildUnrecognizedRows(result));
    applySheetWidth(resultSheet, [28, 18, 18, 12, 10, 10, 10, 58]);
    applySheetWidth(closureSheet, [28, 12, 12, 12]);
    applySheetWidth(ruleSheet, [20, 80]);
    applySheetWidth(unrecognizedSheet, [22, 42]);
    xlsx.utils.book_append_sheet(output, resultSheet, "统计结果");
    xlsx.utils.book_append_sheet(output, closureSheet, "闭环核对");
    xlsx.utils.book_append_sheet(output, ruleSheet, "规则说明");
    xlsx.utils.book_append_sheet(output, unrecognizedSheet, "未识别数据");
    return output;
}
