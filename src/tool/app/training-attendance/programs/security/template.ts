import JSZip from "jszip";
import { parseWordXml, serializeWordXml, wordChildren, wordRows, wordText, WORD_NS, type WordElement } from "../../../personnel-structure-stats/docx-xml";

export type SecurityDocumentType = "china" | "tsa" | "permitRegister" | "permitRecord";
export interface SecurityPerson {
    employeeId: string;
    name: string;
    duty: string;
}
export type SecurityFields = Partial<Record<"教员" | "开课日期" | "TSA日期" | "登机证日期" | "姓名" | "部门" | "职务", string>>;
const DOCUMENT_FIELDS: Record<SecurityDocumentType, string[]> = {
    china: ["教员", "开课日期"], tsa: ["TSA日期"], permitRegister: ["登机证日期"],
    permitRecord: ["姓名", "部门", "职务", "教员"]
};

function fill(target: WordElement, values: Record<string, string>, required: string[]): void {
    const found = new Set<string>();
    for (const node of Array.from(target.getElementsByTagNameNS(WORD_NS, "t"))) {
        node.textContent = (node.textContent || "").replace(/\{([^{}]+)\}/g, (_marker, field: string) => {
            if (!Object.prototype.hasOwnProperty.call(values, field)) throw new Error(`安保模板存在未知或未填写字段：${field}`);
            found.add(field);
            return values[field];
        });
    }
    for (const field of required) if (!found.has(field)) throw new Error(`安保模板缺少字段：${field}`);
}

export async function fillSecurityTemplate(source: Uint8Array, type: SecurityDocumentType, fields: SecurityFields, participants: SecurityPerson[] = []): Promise<Uint8Array> {
    const values: Record<string, string> = {};
    for (const field of DOCUMENT_FIELDS[type]) {
        const value = fields[field as keyof SecurityFields];
        if (value === undefined) throw new Error(`安保资料未提供字段：${field}`);
        values[field] = value;
    }
    const zip = await JSZip.loadAsync(source);
    const part = zip.file("word/document.xml");
    if (!part) throw new Error("安保模板缺少 Word 正文。");
    const document = parseWordXml(await part.async("string"));
    const body = wordChildren(document.documentElement!, "body")[0];
    if (!body) throw new Error("安保模板缺少正文。");
    if (type !== "permitRecord") {
        if (!participants.length) throw new Error("请提供参训人员名单。");
        const table = wordChildren(body, "tbl").find(t => wordRows(t).some(row => wordText(row.cells[0]) === "{序号}"));
        const rows = table && wordRows(table);
        const sample = rows?.find(row => wordText(row.cells[0]) === "{序号}")?.element;
        if (!table || !sample || sample !== rows?.at(-1)?.element) throw new Error("安保模板缺少末尾名单样板行。");
        table.removeChild(sample);
        fill(body, values, DOCUMENT_FIELDS[type]);
        participants.forEach((person, index) => {
            const row = sample.cloneNode(true) as WordElement;
            const data: Record<string, string> = { 序号: String(index + 1), 员工号: person.employeeId, 姓名: person.name };
            if (type === "china") data.职务 = person.duty;
            fill(row, data, Object.keys(data));
            table.appendChild(row);
        });
    } else fill(body, values, DOCUMENT_FIELDS[type]);
    zip.file("word/document.xml", serializeWordXml(document));
    return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
