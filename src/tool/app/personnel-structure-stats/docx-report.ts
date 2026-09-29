import JSZip from "jszip";
import type { PersonnelStatSection, PersonnelStructureResult } from "./models";
import {
    appendWordRow, normalizedWordText, parseWordXml, serializeWordXml, setWordText, wordChildren, wordRows,
    type WordDocument, type WordElement, type WordRow
} from "./docx-xml";

const TITLES = ["教员、机长、副驾驶占比", "机长含以上各级别占比", "机长航线资格占比", "机长报务占比", "副驾驶级别占比", "副驾驶报务占比", "人员居住情况", "空勤人员原单位情况"];
const ALIASES: Record<string, string> = { "在训机长": "转机型机长", "在训副驾驶": "转机型副驾驶", "检查员（其中）": "检查员", "其中：检查员": "检查员", "777": "飞行/总队777", "737": "飞行/总队737", "320": "飞行/总队320", "909": "飞行/总队909" };
type Template = { document: WordDocument; tables: WordElement[]; titles: WordElement[] };
export type PersonnelDocxInfo = { months: number[]; suggestedMonth: number | null };
export type PersonnelDocxOutput = { bytes: Uint8Array; warnings: string[]; filledRows: number; month: number };
const normalize = (value: string): string => value.replace(/\s+/g, "");

function columns(table: WordElement): { months: Map<number, number>; change: number; percent: number } {
    const header = wordRows(table)[0]?.cells || [];
    const months = new Map<number, number>();
    let change = -1;
    let percent = -1;
    header.forEach((cell, index) => {
        const text = normalizedWordText(cell);
        const match = /^(\d{1,2})月$/.exec(text);
        if (match) {
            const month = Number(match[1]);
            if (month < 1 || month > 12 || months.has(month)) throw new Error("Word 月份表头无效或重复。");
            months.set(month, index);
        }
        if (text === "本月变化") change = index;
        if (text === "本月占比") percent = index;
    });
    if (!months.size || change < 0 || percent < 0) throw new Error("Word 表格需包含月份、本月变化和本月占比列。");
    return { months, change, percent };
}

function readTemplate(xml: string): Template {
    const document = parseWordXml(xml);
    const body = wordChildren(document.documentElement!, "body")[0];
    if (!body) throw new Error("Word 未找到正文。");
    const tables = wordChildren(body, "tbl");
    if (tables.length < 9) throw new Error("Word 人员结构模板至少需要 9 张统计表。");
    const titles: WordElement[] = [];
    for (let i = 1; i < 9; i++) {
        let found: WordElement | undefined;
        for (let node = tables[i].previousSibling; node; node = node.previousSibling) {
            if (node.nodeType !== 1) continue;
            const element = node as WordElement;
            if (element.localName === "tbl") break;
            if (element.localName === "p" && normalizedWordText(element).startsWith(TITLES[i - 1])) { found = element; break; }
        }
        if (!found) throw new Error(`Word 第${i + 1}张表未找到对应标题：${TITLES[i - 1]}。`);
        titles.push(found);
        const width = wordRows(tables[i])[0].cells.length;
        if (wordRows(tables[i]).some(row => row.cells.length !== width)) throw new Error(`Word 第${i + 1}张表列数不一致。`);
        columns(tables[i]);
    }
    return { document, tables: tables.slice(1, 9), titles };
}

async function openDocx(source: Uint8Array): Promise<{ zip: JSZip; template: Template }> {
    const zip = await JSZip.loadAsync(source);
    const document = zip.file("word/document.xml");
    if (!document) throw new Error("不是有效的 DOCX：缺少 Word 正文。");
    return { zip, template: readTemplate(await document.async("string")) };
}

export async function inspectPersonnelDocx(source: Uint8Array): Promise<PersonnelDocxInfo> {
    const { template } = await openDocx(source);
    const available = [...columns(template.tables[0]).months.keys()].filter(month => template.tables.every(t => columns(t).months.has(month)));
    if (!available.length) throw new Error("八张 Word 统计表没有共同月份。");
    const rows = wordRows(template.tables[0]).slice(1);
    if (!["教员", "机长", "副驾驶"].every(label => rows.some(row => normalizedWordText(row.cells[0]) === label))) {
        throw new Error("Word 人员占比表缺少教员、机长或副驾驶分类。");
    }
    const empty = available.filter(month => {
        const column = columns(template.tables[0]).months.get(month)!;
        return rows.every(row => normalizedWordText(row.cells[column]) === "");
    });
    return { months: available, suggestedMonth: empty.length === 1 ? empty[0] : null };
}

function labelColumn(index: number): number { return [1, 6, 7].includes(index) ? 1 : 0; }
function labelFor(row: WordRow, index: number): string {
    const label = normalizedWordText(row.cells[labelColumn(index)]);
    if (index === 6) {
        const group = normalizedWordText(row.cells[0]);
        return `${group.includes("副驾驶") ? "副驾驶" : group.includes("机长") ? "机长" : ""}${label}`;
    }
    return ALIASES[label] || label;
}

function groupFor(label: string, index: number, result: PersonnelStructureResult): string {
    if (index === 1) {
        const teachers = result.sections[0].items.find(item => item.label === "教员")!.count;
        if (["C类教员", "B类教员"].includes(label)) return `教员（${teachers}）`;
        if (label === "检查员") return "";
        return `机长（${result.captainOrAboveCount - teachers}）`;
    }
    if (index === 6) return label.startsWith("机长") ? `机长（${result.captainOrAboveCount}）` : `副驾驶（${result.firstOfficerCount}）`;
    return index === 7 ? label : "";
}

function prepareRows(table: WordElement, section: PersonnelStatSection, index: number, result: PersonnelStructureResult, warnings: string[]): void {
    if (index === 1) {
        for (const row of wordRows(table).slice(1)) {
            if (labelFor(row, index) === "A类教员") {
                table.removeChild(row.element);
                warnings.push(`${section.title}：删除 A类教员 行，不推算历史 E/F 人数。`);
            }
        }
    }
    const existing = new Set(wordRows(table).slice(1).map(row => labelFor(row, index)));
    for (const item of section.items) {
        if (existing.has(normalize(item.label)) || (item.count === 0 && !["E类机长", "F类机长"].includes(item.label))) continue;
        const label = index === 6 ? item.label.replace(/^(机长|副驾驶)/, "") : item.label;
        appendWordRow(table, labelColumn(index), label, groupFor(item.label, index, result));
        existing.add(normalize(item.label));
        warnings.push(`${section.title}：模板补充分类行 ${item.label}。`);
    }
}

function changeText(count: number, previous: string): string {
    if (!/^\d+$/.test(previous)) return "/";
    const difference = count - Number(previous);
    return difference > 0 ? `新增${difference}人` : difference < 0 ? `减少${-difference}人` : "/";
}

function fillTable(table: WordElement, section: PersonnelStatSection, index: number, result: PersonnelStructureResult, month: number, warnings: string[]): number {
    const config = columns(table);
    const target = config.months.get(month);
    if (target === undefined) throw new Error(`${section.title} 未找到 ${month}月 列。`);
    const previous = config.months.get(month - 1);
    prepareRows(table, section, index, result, warnings);
    const items = new Map(section.items.map(item => [normalize(item.label), item]));
    const mapped = new Set<string>();
    let filled = 0;
    const groups = new Map<WordElement, string>();
    const writtenCells = new Set<WordElement>();
    for (const row of wordRows(table).slice(1)) {
        const key = labelFor(row, index);
        const item = items.get(key);
        const previousText = previous === undefined ? "" : normalizedWordText(row.cells[previous]);
        const outputCells = [target, config.change, config.percent].map(column => row.cells[column]);
        if (outputCells.some(cell => !cell) || new Set(outputCells).size !== outputCells.length ||
            outputCells.some(cell => [...config.months.values()].some(c => c !== target && row.cells[c] === cell)) ||
            outputCells.some(cell => writtenCells.has(cell))) {
            throw new Error(`${section.title} 写入列与其他月份或数据行合并，不能安全写入。`);
        }
        for (const column of [target, config.change, config.percent]) {
            writtenCells.add(row.cells[column]);
            setWordText(row.cells[column], "");
        }
        if (!item) { warnings.push(`${section.title}：未识别模板分类 ${key || "空白"}，本月列留空。`); continue; }
        if (mapped.has(key)) throw new Error(`${section.title} 模板分类重复：${item.label}。`);
        mapped.add(key);
        if (previous !== undefined && !/^\d+$/.test(previousText)) warnings.push(`${section.title} / ${item.label}：上月无有效人数，本月变化为“/”。`);
        setWordText(row.cells[target], String(item.count));
        setWordText(row.cells[config.change], changeText(item.count, previousText));
        setWordText(row.cells[config.percent], item.percent);
        if ([1, 6].includes(index) && !item.isSubset) {
            const group = groupFor(item.label, index, result);
            if (groups.has(row.cells[0]) && groups.get(row.cells[0]) !== group) throw new Error(`${section.title} 分组跨类别合并，需修正模板。`);
            groups.set(row.cells[0], group);
        }
        if (index === 1 && ALIASES[normalizedWordText(row.cells[1])]) setWordText(row.cells[1], item.label);
        if (index === 4 && ALIASES[normalizedWordText(row.cells[0])]) setWordText(row.cells[0], item.label);
        filled++;
    }
    for (const [cell, group] of groups) setWordText(cell, group);
    return filled;
}

export async function fillPersonnelDocx(source: Uint8Array, result: PersonnelStructureResult, month: number): Promise<PersonnelDocxOutput> {
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error("请选择 1 至 12 月的写入月份。");
    if (result.sections.some(section => !section.closure.closed)) throw new Error("统计未闭环，不能填充 Word。");
    const { zip, template } = await openDocx(source);
    const warnings = [...result.warnings];
    let filledRows = 0;
    TITLES.forEach((title, index) => {
        const section = result.sections.find(section => section.title === title);
        if (!section) throw new Error(`统计结果缺少 ${title}。`);
        filledRows += fillTable(template.tables[index], section, index, result, month, warnings);
        const excluded = [2, 3, 5].includes(index) ? "不含转机型" : "";
        setWordText(template.titles[index], `${title}（${section.closure.denominator}人${excluded}）`);
    });
    warnings.push("第1张飞行管理表、空地总人数、人员引进及其他部门保持模板原文，请人工核对。");
    zip.file("word/document.xml", serializeWordXml(template.document));
    return { bytes: await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }), warnings, filledRows, month };
}
