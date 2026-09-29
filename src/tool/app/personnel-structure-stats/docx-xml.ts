import { DOMParser, XMLSerializer, type Document, type Element, type Node } from "@xmldom/xmldom";

export type WordDocument = Document;
export type WordElement = Element;
export const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export function wordChildren(parent: Node, name: string): WordElement[] {
    const elements: WordElement[] = [];
    for (let child = parent.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 1) {
            const element = child as WordElement;
            if (element.namespaceURI === WORD_NS && element.localName === name) elements.push(element);
        }
    }
    return elements;
}

export function wordText(parent: Node): string {
    if (parent.nodeType === 1) {
        const element = parent as WordElement;
        if (element.namespaceURI === WORD_NS) {
            if (element.localName === "t") return element.textContent || "";
            if (["br", "tab", "cr"].includes(element.localName || "")) return " ";
        }
    }
    let text = "";
    for (let child = parent.firstChild; child; child = child.nextSibling) text += wordText(child);
    return text;
}

export function normalizedWordText(parent: Node): string {
    return wordText(parent).replace(/\s+/g, "");
}

export function parseWordXml(xml: string): WordDocument {
    const document = new DOMParser({ onError: (level, message) => { throw new Error(`Word XML 无法解析：${level} ${message}`); } })
        .parseFromString(xml, "application/xml");
    if (!document.documentElement || document.documentElement.namespaceURI !== WORD_NS || document.documentElement.localName !== "document") {
        throw new Error("DOCX 未包含标准 Word 正文。");
    }
    return document;
}

export function serializeWordXml(document: WordDocument): string {
    return new XMLSerializer().serializeToString(document);
}

function newWordElement(document: WordDocument, name: string): WordElement {
    const prefix = document.documentElement?.lookupPrefix(WORD_NS) || "w";
    return document.createElementNS(WORD_NS, `${prefix}:${name}`);
}

export function setWordText(target: WordElement, value: string): void {
    const document = target.ownerDocument;
    if (!document) throw new Error("Word 单元格不属于有效文档。");
    const paragraph = target.localName === "p" ? target : wordChildren(target, "p")[0];
    const paragraphProps = paragraph && wordChildren(paragraph, "pPr")[0]?.cloneNode(true);
    const runProps = paragraph && wordChildren(paragraph, "r")[0] && wordChildren(wordChildren(paragraph, "r")[0], "rPr")[0]?.cloneNode(true);
    for (let child = target.firstChild; child;) {
        const next = child.nextSibling;
        if (!(child.nodeType === 1 && (child as WordElement).namespaceURI === WORD_NS && (child as WordElement).localName === "tcPr")) {
            target.removeChild(child);
        }
        child = next;
    }
    const output = target.localName === "p" ? target : newWordElement(document, "p");
    if (paragraphProps) output.appendChild(paragraphProps);
    const run = newWordElement(document, "r");
    if (runProps) run.appendChild(runProps);
    const text = newWordElement(document, "t");
    text.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
    text.appendChild(document.createTextNode(value));
    run.appendChild(text);
    output.appendChild(run);
    if (target.localName !== "p") target.appendChild(output);
}

export type WordRow = { element: WordElement; cells: WordElement[] };

// 按 Word 网格展开跨列并解析纵向合并，使标题列与月份列始终对齐。
export function wordRows(table: WordElement): WordRow[] {
    const result: WordRow[] = [];
    for (const element of wordChildren(table, "tr")) {
        const cells: WordElement[] = [];
        const before = wordChildren(wordChildren(element, "trPr")[0] || element, "gridBefore")[0];
        if (before && Number(before.getAttributeNS(WORD_NS, "val"))) throw new Error("Word 表格含缺省网格列，无法确定写入位置。");
        for (const cell of wordChildren(element, "tc")) {
            const props = wordChildren(cell, "tcPr")[0];
            const spanElement = props && wordChildren(props, "gridSpan")[0];
            const span = spanElement ? Number(spanElement.getAttributeNS(WORD_NS, "val")) : 1;
            if (!Number.isInteger(span) || span < 1) throw new Error("Word 表格跨列宽度无效。");
            const merge = props && wordChildren(props, "vMerge")[0];
            const continued = merge && merge.getAttributeNS(WORD_NS, "val") !== "restart";
            const previous = result[result.length - 1]?.cells[cells.length];
            if (continued && !previous) throw new Error("Word 表格纵向合并没有起始单元格。");
            for (let i = 0; i < span; i++) cells.push(continued ? previous! : cell);
        }
        result.push({ element, cells });
    }
    return result;
}

export function appendWordRow(table: WordElement, labelColumn: number, label: string, group: string): WordRow {
    const rows = wordRows(table);
    const last = rows[rows.length - 1];
    if (rows.length < 2) throw new Error("Word 表格没有可复制的数据行。");
    const element = last.element.cloneNode(true) as WordElement;
    for (const cell of wordChildren(element, "tc")) {
        const props = wordChildren(cell, "tcPr")[0];
        if (props) for (const merge of wordChildren(props, "vMerge")) props.removeChild(merge);
        setWordText(cell, "");
    }
    table.appendChild(element);
    const added = wordRows(table).at(-1)!;
    if (!added.cells[labelColumn] || (labelColumn > 0 && added.cells[0] === added.cells[labelColumn])) {
        throw new Error("Word 表格分类列合并，无法补充分类行。");
    }
    if (labelColumn > 0) setWordText(added.cells[0], group);
    setWordText(added.cells[labelColumn], label);
    return added;
}
