import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { calculate } from "../../../src/tool/app/personnel-structure-stats/logic";
import type { PersonnelRecord } from "../../../src/tool/app/personnel-structure-stats/models";
import { fillPersonnelDocx, inspectPersonnelDocx } from "../../../src/tool/app/personnel-structure-stats/docx-report";
import { parseWordXml, wordChildren, wordRows, normalizedWordText } from "../../../src/tool/app/personnel-structure-stats/docx-xml";

const wordNs = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const record = (techInfo: string, origin = "总队777"): PersonnelRecord => ({
  employeeId: "1", name: techInfo, techInfo, origin, inspectorQualification: "", qualifications: {}
});
const result = calculate([record("飞行教员B"), record("E类机长"), record("F类机长"), record("划转机长"), record("A1类副驾驶")]);
const escape = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const cell = (value: string, merge = ""): string => `<w:tc><w:tcPr>${merge}</w:tcPr><w:p><w:r><w:t>${escape(value)}</w:t></w:r></w:p></w:tc>`;
const row = (...values: string[]): string => `<w:tr>${values.map(v => cell(v)).join("")}</w:tr>`;
const mergedLabelRow = (label: string): string => `<w:tr>${cell(label, '<w:gridSpan w:val="2"/>')}${["", "", "/", "5%"].map(v => cell(v)).join("")}</w:tr>`;
const para = (value: string): string => `<w:p><w:r><w:t>${escape(value)}</w:t></w:r></w:p>`;
const table = (labels: string[], grouped = false): string => {
  const header = grouped ? ["", "", "8月", "9月", "本月变化", "本月占比"] : ["", "8月", "9月", "本月变化", "本月占比"];
  return `<w:tbl>${row(...header)}${labels.map((label, i) => grouped
    ? row(i < 2 ? "教员（2）" : "机长（2）", label, i === 0 ? "1" : "", "", "/", "5%")
    : row(label, i === 0 ? "1" : "0", "", "/", "0%")
  ).join("")}</w:tbl>`;
};

async function fixture(): Promise<Uint8Array> {
  const zip = new JSZip();
  const tables = [
    table(["管理人员"]),
    table(["教员", "机长", "副驾驶"]),
    table(["检查员", "C类教员", "B类教员", "F类机长", "E类机长", "D类机长", "C类机长", "B类机长", "Z类机长", "在训机长"], true),
    table(result.sections[2].items.filter(i => i.label !== "其他").map(i => i.label)),
    table(result.sections[3].items.map(i => i.label)),
    table(["D类副驾驶", "C类副驾驶", "B类副驾驶", "A类副驾驶", "在训副驾驶"]),
    table(result.sections[5].items.map(i => i.label)),
    table(["本地居住", "异地居住", "本地居住", "异地居住"], true),
    table(["777", "737", "320", "909", ...result.sections[7].items.slice(4).filter(i => !["飞行/总队 919", "顺丰航空"].includes(i.label)).map(i => i.label)], true),
    table(["其他部门"])
  ];
  const titles = result.sections.map(s => s.title);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${wordNs}"><w:body>${para("飞行部")}${tables.map((t, i) => `${para(i > 0 && i < 9 ? `${titles[i - 1]}（旧人数）` : "保持原文")}${t}`).join("")}${para("人员引进情况不修改")}</w:body></w:document>`);
  zip.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
  return zip.generateAsync({ type: "uint8array" });
}

describe("personnel structure Word template filling", () => {
  it("fills the eight flying-department tables and leaves the surrounding document intact", async () => {
    const source = await fixture();
    expect((await inspectPersonnelDocx(source)).suggestedMonth).toBe(9);
    const filled = await fillPersonnelDocx(source, result, 9);
    const xml = await (await JSZip.loadAsync(filled.bytes)).file("word/document.xml")!.async("string");
    expect(xml).toContain("人员引进情况不修改");
    expect(xml).toContain("其他部门");
    expect(xml).toContain("机长含以上各级别占比（4人）");
    expect(xml).toContain("新增3人");
    expect(xml).toContain("F类机长");
    expect(xml).toContain("E类机长");
    expect(filled.warnings.some(w => w.includes("上月") && w.includes("F类机长"))).toBe(true);
    expect(filled.filledRows).toBeGreaterThan(50);
  });

  it("rejects missing target month or incorrect template titles without downloading", async () => {
    const source = await fixture();
    await expect(fillPersonnelDocx(source, result, 10)).rejects.toThrow(/10月/);
    const zip = await JSZip.loadAsync(source);
    zip.file("word/document.xml", (await zip.file("word/document.xml")!.async("string")).replace("教员、机长、副驾驶占比", "无关标题"));
    await expect(inspectPersonnelDocx(await zip.generateAsync({ type: "uint8array" }))).rejects.toThrow(/标题/);
  });

  it("rejects a month cell merged across two data rows", async () => {
    const zip = await JSZip.loadAsync(await fixture());
    const xml = await zip.file("word/document.xml")!.async("string");
    zip.file("word/document.xml", xml
      .replace(row("教员", "1", "", "/", "0%"), `<w:tr>${cell("教员")}${cell("1")}${cell("", '<w:vMerge w:val="restart"/>')}${cell("/")}${cell("0%")}</w:tr>`)
      .replace(row("机长", "0", "", "/", "0%"), `<w:tr>${cell("机长")}${cell("0")}${cell("", "<w:vMerge/>")}${cell("/")}${cell("0%")}</w:tr>`));
    await expect(fillPersonnelDocx(await zip.generateAsync({ type: "uint8array" }), result, 9)).rejects.toThrow(/合并/);
  });

  it("keeps earlier month cells and reports missing E/F history rather than deriving it", async () => {
    const input = await fixture();
    const output = await fillPersonnelDocx(input, result, 9);
    const xml = await (await JSZip.loadAsync(output.bytes)).file("word/document.xml")!.async("string");
    expect(xml).toContain("教员（1）");
    expect(xml).toContain("机长（3）");
    expect(output.warnings.filter(w => /[EF]类机长/.test(w) && /上月无有效人数/.test(w))).toHaveLength(2);
    expect(xml).toContain("<w:t xml:space=\"preserve\">/</w:t>");
  });

  it("adds a nonzero category missing from the Word template", async () => {
    const withOther = calculate([record("D类机长")]);
    const output = await fillPersonnelDocx(await fixture(), withOther, 9);
    const xml = await (await JSZip.loadAsync(output.bytes)).file("word/document.xml")!.async("string");
    expect(output.warnings).not.toContain("机长航线资格占比：模板补充分类行 其他。");
    expect(xml).not.toContain("<w:t xml:space=\"preserve\">其他</w:t>");
    expect(xml).toContain("<w:t xml:space=\"preserve\">1</w:t>");
    expect(output.filledRows).toBeGreaterThan(50);
  });

  it("adds origin categories when the last template row merges the first two columns", async () => {
    const source = await fixture();
    const zip = await JSZip.loadAsync(source);
    const xml = await zip.file("word/document.xml")!.async("string");
    zip.file("word/document.xml", xml.replace(row("机长（2）", "上海", "", "", "/", "5%"), mergedLabelRow("上海")));
    const originResult = calculate([record("B类机长", "总队919"), record("B类机长", "未映射单位")]);
    const output = await fillPersonnelDocx(await zip.generateAsync({ type: "uint8array" }), originResult, 9);
    const outputXml = await (await JSZip.loadAsync(output.bytes)).file("word/document.xml")!.async("string");
    expect(output.warnings).toContain("空勤人员原单位情况：模板补充分类行 飞行/总队 919。");
    expect(output.warnings).toContain("空勤人员原单位情况：模板补充分类行 其他。");
    expect(outputXml).toContain("<w:t xml:space=\"preserve\">飞行总队</w:t>");
    expect(outputXml).toContain("<w:t xml:space=\"preserve\">919</w:t>");
    expect(outputXml).toContain("<w:t xml:space=\"preserve\">其他</w:t>");
  });

  it("fills the new E first officer, 919 and Shunfeng rows without adding origin categories", async () => {
    const zip = await JSZip.loadAsync(await fixture());
    const originalXml = await zip.file("word/document.xml")!.async("string");
    zip.file("word/document.xml", originalXml
      .replace(table(["D类副驾驶", "C类副驾驶", "B类副驾驶", "A类副驾驶", "在训副驾驶"]), table(["D类副驾驶", "C类副驾驶", "B类副驾驶", "A类副驾驶", "转机型副驾驶", "E类副驾驶"]))
      .replace(row("机长（2）", "上海", "", "", "/", "5%"), row("机长（2）", "上海", "", "", "/", "5%") + row("飞行总队", "919", "", "99", "/", "5%") + mergedLabelRow("顺丰航空")));
    const current = calculate([record("E类副驾驶", "总队777"), record("划转机长", "总队919"), record("划转机长", "顺丰航空")]);
    const output = await fillPersonnelDocx(await zip.generateAsync({ type: "uint8array" }), current, 9);
    const document = parseWordXml(await (await JSZip.loadAsync(output.bytes)).file("word/document.xml")!.async("string"));
    const tables = wordChildren(wordChildren(document.documentElement!, "body")[0], "tbl");
    const firstOfficer = wordRows(tables[5]).find(r => normalizedWordText(r.cells[0]) === "E类副驾驶")!;
    expect(firstOfficer.cells.slice(1).map(normalizedWordText)).toEqual(["0", "1", "新增1人", "100%"]);
    const originRows = wordRows(tables[8]);
    const fleet = originRows.find(r => normalizedWordText(r.cells[1]) === "919")!;
    const shunfeng = originRows.find(r => normalizedWordText(r.cells[1]) === "顺丰航空")!;
    expect(fleet.cells.slice(2).map(normalizedWordText)).toEqual(["", "1", "/", "33%"]);
    expect(shunfeng.cells.slice(2).map(normalizedWordText)).toEqual(["", "1", "/", "33%"]);
    expect(current.sections[7].closure).toEqual({ total: 3, denominator: 3, closed: true });
    expect(current.unrecognized.origin).toEqual([]);
    expect(output.warnings.some(w => w.startsWith("空勤人员原单位情况") && (w.includes("模板补充分类行") || w.includes("未识别模板分类")))).toBe(false);
  });

});
