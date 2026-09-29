import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { calculate } from "../../../src/tool/app/personnel-structure-stats/logic";
import type { PersonnelRecord } from "../../../src/tool/app/personnel-structure-stats/models";
import { fillPersonnelDocx, inspectPersonnelDocx } from "../../../src/tool/app/personnel-structure-stats/docx-report";

const wordNs = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const record = (techInfo: string, origin = "总队777"): PersonnelRecord => ({
  employeeId: "1", name: techInfo, techInfo, origin, inspectorQualification: "", qualifications: {}
});
const result = calculate([record("飞行教员B"), record("E类机长"), record("F类机长"), record("划转机长"), record("A1类副驾驶")]);
const escape = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const cell = (value: string, merge = ""): string => `<w:tc><w:tcPr>${merge}</w:tcPr><w:p><w:r><w:t>${escape(value)}</w:t></w:r></w:p></w:tc>`;
const row = (...values: string[]): string => `<w:tr>${values.map(v => cell(v)).join("")}</w:tr>`;
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
    table(["777", "737", "320", "909", ...result.sections[7].items.slice(4).map(i => i.label)], true),
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
    expect(output.warnings).toContain("机长航线资格占比：模板补充分类行 其他。");
    expect(xml).toContain("<w:t xml:space=\"preserve\">其他</w:t>");
    expect(output.filledRows).toBeGreaterThan(50);
  });

});
