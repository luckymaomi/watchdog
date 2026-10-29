import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";
import type * as XlsxRuntime from "xlsx-js-style";
import { parseWordXml, wordChildren, wordRows, WORD_NS, type WordElement } from "../personnel-structure-stats/docx-xml";

export interface PreviewFile { fileName: string; bytes: Uint8Array }
export type PreviewXlsx = Pick<typeof XlsxRuntime, "read" | "utils">;
const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const VML_NS = "urn:schemas-microsoft-com:vml";

function escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function wordImages(zip: JSZip): Promise<Map<string, string>> {
    const images = new Map<string, string>();
    const part = zip.file("word/_rels/document.xml.rels");
    if (!part) return images;
    const rels = new DOMParser().parseFromString(await part.async("string"), "application/xml");
    const nodes = Array.from(rels.getElementsByTagName("Relationship"));
    await Promise.all(nodes.map(async rel => {
        if (rel.getAttribute("TargetMode") === "External" || !rel.getAttribute("Type")?.endsWith("/image")) return;
        const target = rel.getAttribute("Target") || "";
        const extension = /\.(png|jpe?g|gif|webp|bmp)$/i.exec(target)?.[1].toLowerCase();
        if (!extension || /[\\:#?]/.test(target)) return;
        const segments: string[] = target.startsWith("/") ? [] : ["word"];
        for (const segment of target.split("/")) {
            if (segment === "..") segments.pop();
            else if (segment && segment !== ".") segments.push(segment);
        }
        const file = zip.file(segments.join("/"));
        if (!file) return;
        const mime = extension === "jpg" ? "jpeg" : extension;
        images.set(rel.getAttribute("Id") || "", `data:image/${mime};base64,${await file.async("base64")}`);
    }));
    return images;
}

function inlineWord(node: WordElement, images: Map<string, string>): string {
    if (node.namespaceURI === WORD_NS) {
        if (node.localName === "t") return escapeHtml(node.textContent || "");
        if (["br", "cr"].includes(node.localName || "")) return "<br>";
        if (node.localName === "tab") return "&#8195;";
    }
    if ((node.namespaceURI === DRAWING_NS && node.localName === "blip") || (node.namespaceURI === VML_NS && node.localName === "imagedata")) {
        const id = node.getAttributeNS(REL_NS, "embed") || node.getAttributeNS(REL_NS, "id");
        const source = id && images.get(id);
        return source ? `<img src="${source}" alt="文档内嵌图片">` : "";
    }
    return Array.from(node.childNodes).filter(child => child.nodeType === 1).map(child => inlineWord(child as WordElement, images)).join("");
}

function wordBlocks(parent: WordElement, images: Map<string, string>): string {
    return Array.from(parent.childNodes).filter(child => child.nodeType === 1).map(child => {
        const node = child as WordElement;
        if (node.namespaceURI !== WORD_NS) return "";
        if (node.localName === "p") return `<p>${inlineWord(node, images) || "<br>"}</p>`;
        if (node.localName !== "tbl") return "";
        const rows = wordRows(node);
        return `<table><tbody>${rows.map((row, r) => {
            let cells = "";
            for (let c = 0; c < row.cells.length;) {
                const cell = row.cells[c];
                let span = 1;
                while (row.cells[c + span] === cell) span++;
                if (r === 0 || rows[r - 1].cells[c] !== cell) {
                    let height = 1;
                    while (rows[r + height]?.cells[c] === cell) height++;
                    cells += `<td colspan="${span}" rowspan="${height}">${wordBlocks(cell, images)}</td>`;
                }
                c += span;
            }
            return `<tr>${cells}</tr>`;
        }).join("")}</tbody></table>`;
    }).join("");
}

function excelHtml(bytes: Uint8Array, xlsx: PreviewXlsx): string {
    const workbook = xlsx.read(bytes, { type: "array" });
    return workbook.SheetNames.map(name => {
        const sheet = workbook.Sheets[name];
        if (!sheet["!ref"]) return `<h3>${escapeHtml(name)}</h3><p>空工作表</p>`;
        const range = xlsx.utils.decode_range(sheet["!ref"]);
        const values = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "", blankrows: true, range });
        const merges = sheet["!merges"] || [];
        const rows = values.map((row, index) => {
            const r = index + range.s.r;
            let cells = "";
            for (let c = range.s.c; c <= range.e.c; c++) {
                const merge = merges.find(m => r >= m.s.r && r <= m.e.r && c >= m.s.c && c <= m.e.c);
                if (merge && (r !== merge.s.r || c !== merge.s.c)) continue;
                cells += `<td colspan="${merge ? merge.e.c - merge.s.c + 1 : 1}" rowspan="${merge ? merge.e.r - merge.s.r + 1 : 1}">${escapeHtml(String(row[c - range.s.c] ?? "")).replace(/\n/g, "<br>")}</td>`;
            }
            return `<tr>${cells}</tr>`;
        });
        return `<h3>${escapeHtml(name)}</h3><table><tbody>${rows.join("")}</tbody></table>`;
    }).join("");
}

export async function buildDocumentPreview(file: PreviewFile, xlsx: PreviewXlsx): Promise<string> {
    if (/\.xlsx$/i.test(file.fileName)) return excelHtml(file.bytes, xlsx);
    if (!/\.docx$/i.test(file.fileName)) throw new Error("暂不支持该文件格式的在线预览。");
    const zip = await JSZip.loadAsync(file.bytes);
    const part = zip.file("word/document.xml");
    if (!part) throw new Error("Word 文件缺少正文。");
    const doc = parseWordXml(await part.async("string"));
    const body = wordChildren(doc.documentElement!, "body")[0];
    if (!body) throw new Error("Word 文件缺少正文。");
    return wordBlocks(body, await wordImages(zip));
}
