import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { validateDates } from "./logic";
import { SHEETS, type Analysis, type ExportOptions, type Leg } from "./models";

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const parse = (xml: string) => new DOMParser().parseFromString(xml, "application/xml");
const serialize = (doc: ReturnType<typeof parse>): string => new XMLSerializer().serializeToString(doc);
const escapeXml = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

async function zipText(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path);
  if (!file) throw new Error(`模板缺少部件：${path}`);
  return file.async("string");
}

function appendStyles(xml: string): { xml: string; normal: number; blue: number; date: number } {
  const doc = parse(xml);
  const append = (tag: string, value: string): number => {
    const parent = doc.getElementsByTagName(tag)[0];
    if (!parent) throw new Error(`模板样式缺少 ${tag}`);
    const index = Array.from(parent.childNodes).filter(node => node.nodeType === 1).length;
    const fragment = parse(`<root xmlns="${NS}">${value}</root>`).documentElement!.firstChild!;
    parent.appendChild(doc.importNode(fragment, true));
    parent.setAttribute("count", String(index + 1));
    return index;
  };
  const normalFont = append("fonts", '<font><name val="宋体"/><sz val="11"/></font>');
  const blueFont = append("fonts", '<font><name val="宋体"/><sz val="11"/><color rgb="FF0000FF"/></font>');
  const border = append("borders", '<border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border>');
  const numFmts = doc.getElementsByTagName("numFmts")[0];
  const existing = Array.from(numFmts.getElementsByTagName("numFmt")).map(n => Number(n.getAttribute("numFmtId")));
  const dateFormat = Math.max(163, ...existing) + 1;
  append("numFmts", `<numFmt numFmtId="${dateFormat}" formatCode="YYYY-MM-DD"/>`);
  const style = (font: number, format = 0): number => append("cellXfs", `<xf numFmtId="${format}" fontId="${font}" fillId="0" borderId="${border}" xfId="0" applyAlignment="1" applyNumberFormat="1"><alignment wrapText="1" vertical="center"/></xf>`);
  const normal = style(normalFont);
  const blue = style(blueFont);
  const date = style(normalFont, dateFormat);
  return { xml: serialize(doc), normal, blue, date };
}

// Excel 1900 日期系统；模板固定使用该系统，保留闰年兼容偏移。
function dateSerial(value: string): number {
  const [y, m, d] = value.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d);
  return (utc - Date.UTC(1899, 11, 31)) / 86400000 + (utc >= Date.UTC(1900, 2, 1) ? 1 : 0);
}
function cell(address: string, value: string | number, style: number, formula = false): string {
  if (formula) return `<c r="${address}" s="${style}"><f>${escapeXml(String(value))}</f></c>`;
  if (typeof value === "number") return `<c r="${address}" s="${style}" t="n"><v>${value}</v></c>`;
  return `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}
function replaceData(xml: string, rows: string[], lastColumn: string): string {
  const header = /<row\b[^>]*r="1"[^>]*>[\s\S]*?<\/row>/.exec(xml)?.[0];
  if (!header) throw new Error("模板缺少第 1 行表头。");
  const ref = `A1:${lastColumn}${rows.length + 1}`;
  return xml.replace(/<sheetData\b[^>]*>[\s\S]*?<\/sheetData>/, `<sheetData>${header}${rows.join("")}</sheetData>`)
    .replace(/<dimension\b[^>]*\/>/, `<dimension ref="${ref}"/>`)
    .replace(/<autoFilter\b[^>]*\/>/, `<autoFilter ref="${ref}"/>`);
}

export async function buildApprovalWorkbook(template: Uint8Array | ArrayBuffer, result: Analysis, options: ExportOptions): Promise<Uint8Array> {
  const errors = [...validateDates(options.effective, options.expiry), ...result.issues.filter(i => i.severity === "error").map(i => i.message)];
  if (errors.length) throw new Error(errors.join("\n"));
  const zip = await JSZip.loadAsync(template);
  const workbook = parse(await zipText(zip, "xl/workbook.xml"));
  const relationships = parse(await zipText(zip, "xl/_rels/workbook.xml.rels"));
  const sheetPaths = new Map<string, string>();
  for (const node of Array.from(workbook.getElementsByTagName("sheet"))) {
    const id = node.getAttribute("r:id");
    const relation = Array.from(relationships.getElementsByTagName("Relationship")).find(r => r.getAttribute("Id") === id);
    const target = relation?.getAttribute("Target") ?? "";
    sheetPaths.set(node.getAttribute("name") ?? "", target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  }
  for (const name of SHEETS) if (!sheetPaths.get(name)) throw new Error(`模板缺少工作表：${name}`);
  const styles = appendStyles(await zipText(zip, "xl/styles.xml"));
  zip.file("xl/styles.xml", styles.xml);
  const columns = "ABCDEFGHIJKL";
  const mergedRows = result.merged.map((item, i) => {
    const values = [i + 1, item.company, item.stationA, item.stationB, item.go, item.back, item.tw];
    const r = i + 2;
    return `<row r="${r}">${values.map((v, c) => cell(`${columns[c]}${r}`, v, styles.normal)).join("")}</row>`;
  });
  const legRows = (items: Leg[]): string[] => items.map((item, i) => {
    const r = i + 2;
    const values = [i + 1, item.company, item.left, item.right, `VLOOKUP(C${r},机场列表!A:B,2,FALSE)`, `VLOOKUP(D${r},机场列表!A:B,2,FALSE)`, item.code, item.tw, dateSerial(options.effective), dateSerial(options.expiry), `VLOOKUP(E${r},俄罗斯机场列表!A:C,3,FALSE)`, `VLOOKUP(F${r},俄罗斯机场列表!A:C,3,FALSE)`];
    return `<row r="${r}">${values.map((v, c) => cell(`${columns[c]}${r}`, v, c === 8 || c === 9 ? styles.date : c === 6 && item.multi ? styles.blue : styles.normal, [4, 5, 10, 11].includes(c))).join("")}</row>`;
  });
  for (const [index, rows] of [mergedRows, legRows(result.go), legRows(result.back)].entries()) {
    const path = sheetPaths.get(SHEETS[index])!;
    zip.file(path, replaceData(await zipText(zip, path), rows, index === 0 ? "G" : "L"));
  }
  let calculation = workbook.getElementsByTagName("calcPr")[0];
  if (!calculation) { calculation = workbook.createElementNS(NS, "calcPr"); workbook.documentElement!.appendChild(calculation); }
  calculation.setAttribute("calcMode", "auto");
  calculation.setAttribute("fullCalcOnLoad", "1");
  calculation.setAttribute("forceFullCalc", "1");
  zip.file("xl/workbook.xml", serialize(workbook));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
