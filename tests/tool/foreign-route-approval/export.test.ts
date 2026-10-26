import { readFileSync } from "node:fs";
import * as XLSX from "xlsx-js-style";
import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { buildApprovalWorkbook } from "../../../src/tool/app/foreign-route-approval/export";
import { analyzeApprovals } from "../../../src/tool/app/foreign-route-approval/logic";
import { readAirportCatalog, readApprovals } from "../../../src/tool/app/foreign-route-approval/workbook";

const bytes = readFileSync("public/template/foreign-route-approval/approval-template.xlsx");
const template = XLSX.read(bytes);
const catalog = readAirportCatalog(XLSX, template);
const header = ["序号", "公司", "航站", "航站", "去程", "回程", "是否有台湾地区飞行员"];
const parse = (rows: unknown[][]) => readApprovals(XLSX, XLSX.utils.aoa_to_sheet([header, ...rows]), "测试", "open");
const result = analyzeApprovals(parse([[9, "CSG", "广州", "伦敦", "<&>\nG", "B", "是"]]), parse([[1, "CSG", "上海/浦东", "广州", "T", "", ""]]), catalog);
const options = { season: "2026夏秋", effective: "2026-03-29", expiry: "2026-10-24" };

describe("原模板导出", () => {
  it("三张结果表只含所选航司，空选或无命中拒绝导出", async () => {
    const opened = parse([[1, "CSN", "广州", "伦敦", "OTHER", "OTHER"], [2, "CSG", "广州", "伦敦", "G", "B"]]);
    for (const selection of [undefined, ["CSN"], ["CSG", "CSN"]]) {
      const filtered = analyzeApprovals(opened, { rows: [], issues: [] }, catalog, selection);
      const output = XLSX.read(await buildApprovalWorkbook(bytes, filtered, options));
      for (const name of output.SheetNames.slice(0, 3)) {
        const rows = XLSX.utils.sheet_to_json<unknown[]>(output.Sheets[name], { header: 1 });
        expect(rows.slice(1).every(row => (selection ?? ["CSG"]).includes(String(row[1])))).toBe(true);
      }
      expect(output.Sheets["开放与临开合并"]["!ref"]).toBe(selection?.length === 2 ? "A1:G3" : "A1:G2");
    }
    for (const selection of [[], ["NO_MATCH"]]) await expect(buildApprovalWorkbook(bytes, analyzeApprovals(opened, { rows: [], issues: [] }, catalog, selection), options)).rejects.toThrow();
  });
  it("保留五表、原表头和机场部件，按行写公式、Excel 日期与蓝字全挂码", async () => {
    const output = await buildApprovalWorkbook(bytes, result, options);
    const workbook = XLSX.read(output, { cellStyles: true, cellNF: true });
    expect(workbook.SheetNames).toEqual(template.SheetNames);
    expect(workbook.Sheets["开放与临开合并"].A2.v).toBe(1);
    expect(workbook.Sheets["开放与临开合并"].G3.v).toBe("否");
    const go = workbook.Sheets["去程"];
    expect(go.G2.v).toBe("<&>\nG");
    expect(go.G4.v).toBe("<&>\nG");
    expect(go.E2.f).toBe("VLOOKUP(C2,机场列表!A:B,2,FALSE)");
    expect(go.K2.f).toBe("VLOOKUP(E2,俄罗斯机场列表!A:C,3,FALSE)");
    expect(go.I2.v).toBe(46110);
    expect(go.J2.v).toBe(46319);
    expect(go.I2.z).toBe("YYYY-MM-DD");
    expect(workbook.Sheets["回程"].C2.v).toBe("伦敦1");
    expect(workbook.Sheets["回程"].D2.v).toBe("广州");
    expect(workbook.Sheets["回程"].C1.v).toBe(template.Sheets["回程"].C1.v);
    const original = await JSZip.loadAsync(bytes);
    const generated = await JSZip.loadAsync(output);
    for (const name of Object.keys(original.files).filter(n => !original.files[n].dir && !["xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml", "xl/worksheets/sheet3.xml", "xl/styles.xml", "xl/workbook.xml"].includes(n))) {
      expect(await generated.file(name)!.async("uint8array"), name).toEqual(await original.file(name)!.async("uint8array"));
    }
    const xml = await generated.file("xl/worksheets/sheet2.xml")!.async("string");
    const style = /<c r="G2" s="(\d+)"/.exec(xml)![1];
    const styles = await generated.file("xl/styles.xml")!.async("string");
    const doc = new DOMParser().parseFromString(styles, "application/xml");
    const xfs = doc.getElementsByTagName("cellXfs")[0].getElementsByTagName("xf");
    const fontId = Number(xfs[Number(style)].getAttribute("fontId"));
    const font = doc.getElementsByTagName("fonts")[0].getElementsByTagName("font")[fontId];
    expect(font.getElementsByTagName("color")[0].getAttribute("rgb")).toBe("FF0000FF");
  });
  it("日期或预检错误阻止导出", async () => {
    await expect(buildApprovalWorkbook(bytes, result, { ...options, effective: "" })).rejects.toThrow();
    await expect(buildApprovalWorkbook(bytes, { ...result, issues: [{ source: "测试", severity: "error", message: "机场缺失" }] }, options)).rejects.toThrow();
  });
  it("仅回程、仅去程和双向空白按方向输出，不导出空码航段", async () => {
    const route = "NIXAL-ZGGG-01R,SARIN-ZGGG-01,MORIT-ZGGG-01";
    const analysis = analyzeApprovals(parse([
      [1, "CSG", "广州", "伦敦", "", route, "否"],
      [2, "CSG", "广州", "上海/浦东", "任何非空字符串", "", "是"],
      [3, "CSG", "广州", "伦敦", " ", "\n", "否"]
    ]), { rows: [], issues: [] }, catalog);
    const workbook = XLSX.read(await buildApprovalWorkbook(bytes, analysis, options));
    expect(workbook.Sheets["开放与临开合并"]["!ref"]).toBe("A1:G4");
    const go = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["去程"], { header: 1 });
    const back = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["回程"], { header: 1 });
    expect(go.slice(1).map(r => [r[0], r[2], r[3], r[6]])).toEqual([[1, "广州", "上海/浦东", "任何非空字符串"]]);
    expect(back.slice(1).map(r => [r[0], r[2], r[3], r[6]])).toEqual([1, 2, 3].map(i => [i, `伦敦${i}`, "广州", route]));
    const empty = analyzeApprovals(parse([[1, "CSG", "广州", "伦敦", "", "", "否"]]), { rows: [], issues: [] }, catalog);
    const emptyWorkbook = XLSX.read(await buildApprovalWorkbook(bytes, empty, options));
    expect(emptyWorkbook.Sheets["去程"]["!ref"]).toBe("A1:L1");
    expect(emptyWorkbook.Sheets["回程"]["!ref"]).toBe("A1:L1");
    expect(emptyWorkbook.Sheets["开放与临开合并"]["!ref"]).toBe("A1:G2");
  });
});
