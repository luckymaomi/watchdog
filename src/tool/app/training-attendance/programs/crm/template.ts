import JSZip from "jszip";
import { DOMParser, XMLSerializer, type Document, type Element, type Node } from "@xmldom/xmldom";

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const SHEET_PATH = "xl/worksheets/sheet1.xml";

function children(parent: Node, name: string): Element[] {
    return Array.from(parent.childNodes).filter((node): node is Element =>
        node.nodeType === 1 && node.namespaceURI === NS && node.localName === name);
}

function parse(xml: string): Document {
    return new DOMParser({ onError: (level, message) => { throw new Error(`CRM 模板 XML 无法解析：${level} ${message}`); } })
        .parseFromString(xml, "application/xml");
}

// 三份内置 CRM 模板的第一张表是固定填写区域；其他文件部件原字节保留。
export class CrmTemplateSheet {
    private readonly data: Element;
    private readonly root: Element;

    private constructor(private readonly zip: JSZip, private readonly document: Document, private readonly strings: string[]) {
        const root = document.documentElement;
        if (!root || root.namespaceURI !== NS || root.localName !== "worksheet") {
            throw new Error("CRM 模板缺少标准 Excel 工作表。");
        }
        this.root = root;
        const data = children(root, "sheetData")[0];
        if (!data) throw new Error("CRM 模板缺少单元格区域。");
        this.data = data;
    }

    static async open(bytes: Uint8Array): Promise<CrmTemplateSheet> {
        const zip = await JSZip.loadAsync(bytes);
        const file = zip.file(SHEET_PATH);
        if (!file) throw new Error("CRM 模板缺少第一张工作表。");
        const shared = zip.file("xl/sharedStrings.xml");
        const strings = shared ? children(parse(await shared.async("string")).documentElement!, "si").map(item =>
            Array.from(item.getElementsByTagNameNS(NS, "t")).map(node => node.textContent || "").join("")) : [];
        return new CrmTemplateSheet(zip, parse(await file.async("string")), strings);
    }

    private row(number: number): Element {
        const row = children(this.data, "row").find(item => item.getAttribute("r") === String(number));
        if (!row) throw new Error(`CRM 模板缺少第 ${number} 行。`);
        return row;
    }

    private cell(address: string): Element {
        const row = this.row(Number(address.match(/\d+$/)?.[0]));
        const existing = children(row, "c").find(cell => cell.getAttribute("r") === address);
        if (existing) return existing;
        const cell = this.document.createElementNS(NS, "c");
        cell.setAttribute("r", address);
        const column = address.replace(/\d+$/, "");
        const next = children(row, "c").find(item => {
            const other = (item.getAttribute("r") || "").replace(/\d+$/, "");
            return other.length > column.length || (other.length === column.length && other > column);
        });
        row.insertBefore(cell, next || null);
        return cell;
    }

    text(address: string): string {
        const cell = this.cell(address);
        const value = children(cell, "v")[0]?.textContent || "";
        if (cell.getAttribute("t") === "s") return this.strings[Number(value)] || "";
        if (cell.getAttribute("t") === "inlineStr") return children(cell, "is")[0]?.textContent || "";
        return value;
    }

    set(address: string, value: string | number): void {
        const cell = this.cell(address);
        for (const tag of ["v", "is", "f"]) for (const child of children(cell, tag)) cell.removeChild(child);
        cell.setAttribute("t", typeof value === "number" ? "n" : "inlineStr");
        if (typeof value === "number") {
            const node = this.document.createElementNS(NS, "v");
            node.appendChild(this.document.createTextNode(String(value)));
            cell.appendChild(node);
        } else {
            const inline = this.document.createElementNS(NS, "is");
            const text = this.document.createElementNS(NS, "t");
            text.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
            text.appendChild(this.document.createTextNode(value));
            inline.appendChild(text);
            cell.appendChild(inline);
        }
    }

    prepareRows(start: number, count: number, columns: string): void {
        const last = start + Math.max(2, count) - 1;
        const source = this.row(start + 1).cloneNode(true) as Element;
        // 原模板的名单区以下只有空白预留行，按实际人数收缩或复制第二行扩展。
        for (const row of children(this.data, "row")) {
            if (Number(row.getAttribute("r")) > last) this.data.removeChild(row);
        }
        for (let number = start; number <= last; number++) {
            if (number > start + 1) {
                const existing = children(this.data, "row").find(row => row.getAttribute("r") === String(number));
                if (existing) this.data.removeChild(existing);
                const row = source.cloneNode(true) as Element;
                row.setAttribute("r", String(number));
                for (const cell of children(row, "c")) cell.setAttribute("r", (cell.getAttribute("r") || "").replace(/\d+$/, String(number)));
                this.data.appendChild(row);
            }
            for (const column of columns) this.set(`${column}${number}`, "");
        }
        const dimension = children(this.root, "dimension")[0];
        if (!dimension) throw new Error("CRM 模板缺少表格范围。");
        dimension.setAttribute("ref", (dimension.getAttribute("ref") || "").replace(/\d+$/, String(last)));
    }

    async save(): Promise<Uint8Array> {
        this.zip.file(SHEET_PATH, new XMLSerializer().serializeToString(this.document));
        return this.zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    }
}
