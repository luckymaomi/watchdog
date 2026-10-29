import JSZip from "jszip";
import { parseWordXml, serializeWordXml, setWordText, wordChildren, wordRows, wordText, type WordDocument, type WordElement, type WordRow } from "../../../personnel-structure-stats/docx-xml";
import type { DangerousGoodsDraft, DangerousGoodsFile, DangerousGoodsTemplates } from "./models";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function textNodes(document: WordDocument): WordElement[] {
    return Array.from(document.getElementsByTagNameNS(WORD_NS, "t")) as unknown as WordElement[];
}

function replacePlaceholder(document: WordDocument, marker: string, replacement: string): void {
    const nodes = textNodes(document);
    const node = nodes.find((item) => item.textContent === marker);
    if (!node) throw new Error(`签到表模板缺少字段：${marker}`);
    node.textContent = replacement;
}

function firstBody(document: WordDocument): WordElement {
    const body = wordChildren(document.documentElement!, "body")[0];
    if (!body) throw new Error("Word 模板缺少正文。");
    return body;
}

function findParagraph(body: WordElement, prefix: string): WordElement {
    const paragraph = wordChildren(body, "p").find((item) => (item.textContent || "").replace(/\s+/g, "").startsWith(prefix));
    if (!paragraph) throw new Error(`Word 模板缺少字段：${prefix}`);
    return paragraph;
}

function shortDate(value: string): string {
    const match = value.match(/^\d{4}年(\d{2})月(\d{2})日$/);
    return match ? `${match[1]}月${match[2]}日` : value;
}

async function openDocument(bytes: Uint8Array): Promise<{ zip: JSZip; document: WordDocument }> {
    const zip = await JSZip.loadAsync(bytes);
    const file = zip.file("word/document.xml");
    if (!file) throw new Error("不是有效的 DOCX 模板。");
    return { zip, document: parseWordXml(await file.async("string")) };
}

async function saveDocument(zip: JSZip, document: WordDocument): Promise<Uint8Array> {
    zip.file("word/document.xml", serializeWordXml(document));
    return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

async function fillInstructorSurvey(source: Uint8Array, draft: DangerousGoodsDraft): Promise<Uint8Array> {
    const { zip, document } = await openDocument(source);
    const body = firstBody(document);
    setWordText(findParagraph(body, "培训教员："), `培训教员：${draft.instructor}`);
    return saveDocument(zip, document);
}

function worksheetTable(document: WordDocument, index: number): WordElement {
    const table = wordChildren(firstBody(document), "tbl")[index];
    if (!table) throw new Error(`Word 模板缺少第 ${index + 1} 个表格。`);
    return table;
}

function prepareParticipantRows(table: WordElement, start: number, count: number, footer?: WordElement): WordRow[] {
    const rows = wordRows(table);
    const end = footer ? rows.findIndex(row => row.element === footer) : rows.length;
    if (end <= start || !rows[start]) throw new Error("Word 模板缺少名单样板行。");
    const sample = rows[start].element.cloneNode(true) as WordElement;
    for (const row of rows.slice(start, end)) table.removeChild(row.element);
    for (let i = 0; i < count; i++) table.insertBefore(sample.cloneNode(true), footer || null);
    return wordRows(table).slice(start, start + count);
}

async function fillAttitude(source: Uint8Array, draft: DangerousGoodsDraft): Promise<Uint8Array> {
    const { zip, document } = await openDocument(source);
    const table = worksheetTable(document, 0);
    const rows = wordRows(table);
    const footer = rows.find(row => wordText(row.cells[0]).trim().startsWith("说明："))?.element;
    if (!footer) throw new Error("学员态度评价表模板缺少表尾说明。");
    const dataRows = prepareParticipantRows(table, 3, draft.participants.length, footer);
    draft.participants.forEach((person, index) => {
        const cells = dataRows[index].cells;
        setWordText(cells[0], String(index + 1));
        setWordText(cells[1], person.employeeId);
        setWordText(cells[2], person.name);
        setWordText(cells[3], "飞行部");
    });
    return saveDocument(zip, document);
}

async function fillAttendance(source: Uint8Array, draft: DangerousGoodsDraft): Promise<Uint8Array> {
    const { zip, document } = await openDocument(source);
    const body = firstBody(document);
    replacePlaceholder(document, "{培训时间}", draft.trainingDate);
    replacePlaceholder(document, "{任务模拟日期}", draft.taskDate);
    replacePlaceholder(document, "{试卷考核日期}", draft.examDate);
    replacePlaceholder(document, "{培训地点}", draft.location);
    const table = worksheetTable(document, 0);
    const rows = wordRows(table);
    const header = rows[8]?.cells;
    if (!header || header.length < 5) throw new Error("签到表模板缺少学员表头。");
    replacePlaceholder(document, "{上午签名}", shortDate(draft.examDate));
    replacePlaceholder(document, "{下午签名}", shortDate(draft.examDate));
    const dataRows = prepareParticipantRows(table, 9, draft.participants.length);
    draft.participants.forEach((person, index) => {
        const cells = dataRows[index].cells;
        setWordText(cells[0], String(index + 1));
        setWordText(cells[1], person.employeeId);
        setWordText(cells[2], person.name);
    });
    return saveDocument(zip, document);
}

async function cloneRaw(source: Uint8Array): Promise<Uint8Array> { return source.slice(); }

function safe(value: string): string { return value.replace(/[\\/:*?"<>|]/g, "_").trim(); }

export async function buildDangerousGoodsFiles(templates: DangerousGoodsTemplates, draft: DangerousGoodsDraft): Promise<DangerousGoodsFile[]> {
    const instructor = await fillInstructorSurvey(templates.instructorSurvey, draft);
    const attitude = await fillAttitude(templates.attitude, draft);
    const attendance = await fillAttendance(templates.attendance, draft);
    const files: DangerousGoodsFile[] = [
        { fileName: "危险品复训_教员评估员调查问卷.docx", bytes: instructor },
        { fileName: "危险品复训_学员态度评价表.docx", bytes: attitude },
        { fileName: "危险品复训_签到表.docx", bytes: attendance }
    ];
    for (let index = 1; index <= 3; index++) files.push({ fileName: `危险品复训_学员培训后调查问卷_${index}.docx`, bytes: await cloneRaw(templates.postSurvey) });
    const copies = draft.participants.length + 1;
    for (let index = 1; index <= copies; index++) {
        files.push({ fileName: `危险品复训_飞行机组任务模拟评估表_${index}.docx`, bytes: await cloneRaw(templates.simulation) });
        files.push({ fileName: `危险品复训_飞行机组试卷_${index}.docx`, bytes: await cloneRaw(templates.exam) });
    }
    return files.map((file) => ({ ...file, fileName: safe(file.fileName) }));
}
