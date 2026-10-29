import JSZip from "jszip";
import { parseWordXml, serializeWordXml, wordChildren, wordRows, wordText, WORD_NS, type WordElement } from "../../../personnel-structure-stats/docx-xml";
import { canExportEmergency } from "./logic";
import type { EmergencyDraft, EmergencyKind } from "./models";

export const EMERGENCY_TEMPLATES: Record<EmergencyKind, string> = {
    initial: "../../../template/training-attendance/emergency/initial.docx",
    recurrent: "../../../template/training-attendance/emergency/recurrent.docx"
};

function fillFields(target: WordElement, fields: Record<string, string>): void {
    const found = new Set<string>();
    for (const node of Array.from(target.getElementsByTagNameNS(WORD_NS, "t"))) {
        node.textContent = (node.textContent || "").replace(/\{([^{}]+)\}/g, (_marker, key: string) => {
            if (!Object.prototype.hasOwnProperty.call(fields, key)) throw new Error(`应急模板包含未知字段：${key}`);
            found.add(key);
            return fields[key];
        });
    }
    for (const key of Object.keys(fields)) if (!found.has(key)) throw new Error(`应急模板缺少字段：${key}`);
}

export async function buildEmergencyFile(source: Uint8Array, draft: EmergencyDraft): Promise<{ fileName: string; bytes: Uint8Array }> {
    if (!canExportEmergency(draft)) throw new Error("请先修正数据健康检查中的错误。");
    const zip = await JSZip.loadAsync(source);
    const part = zip.file("word/document.xml");
    if (!part) throw new Error("应急模板缺少 Word 正文。");
    const doc = parseWordXml(await part.async("string"));
    const body = wordChildren(doc.documentElement!, "body")[0];
    const table = body && wordChildren(body, "tbl")[0];
    if (!table) throw new Error("应急模板缺少签到表。");
    const rows = wordRows(table);
    const expectedType = draft.kind === "initial" ? "转机型" : "正常复训";
    if (!rows[3]?.cells[1] || wordText(rows[3].cells[1]) !== expectedType) throw new Error("应急模板与所选培训类型不符。");
    const sample = rows.find(row => wordText(row.cells[0]) === "{序号}")?.element;
    if (!sample || sample !== rows.at(-1)?.element) throw new Error("应急模板缺少名单样板行。");
    table.removeChild(sample);
    fillFields(body, { 培训时间: draft.trainingTime, 培训地点: draft.location });
    draft.participants.forEach((p, index) => {
        const row = sample.cloneNode(true) as WordElement;
        fillFields(row, { 序号: String(index + 1), 员工号: p.employeeId, 姓名: p.name });
        table.appendChild(row);
    });
    zip.file("word/document.xml", serializeWordXml(doc));
    return {
        fileName: `应急${draft.kind === "initial" ? "初训" : "复训"}_签到表_${draft.startDate}.docx`,
        bytes: await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" })
    };
}
