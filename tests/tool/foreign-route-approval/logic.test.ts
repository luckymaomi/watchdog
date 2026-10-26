import { readFileSync } from "node:fs";
import * as XLSX from "xlsx-js-style";
import { describe, expect, it } from "vitest";
import { analyzeApprovals, validateDates } from "../../../src/tool/app/foreign-route-approval/logic";
import { readApprovals, readAirportCatalog } from "../../../src/tool/app/foreign-route-approval/workbook";

const template = XLSX.read(readFileSync("public/template/foreign-route-approval/approval-template.xlsx"));
const catalog = readAirportCatalog(XLSX, template);
const header = ["序号", "公司", "航站", "航站", "去程", "回程", "是否有台湾地区飞行员"];
function parse(rows: unknown[][], kind: "open" | "temporary" = "open") {
  return readApprovals(XLSX, XLSX.utils.aoa_to_sheet(rows), "测试", kind);
}

describe("外籍批复核心规则", () => {
  it("按表头定位、跳空行、保留来源行和台湾原文，空白为否", () => {
    const parsed = parse([["批复标题"], header, [99, "CSG", "广州", "伦敦", "G\nG2", "B", ""], [], [1, "CSG", "上海/浦东", "迪拜", "G2", "", "另行批复"]]);
    expect(parsed.issues).toEqual([]);
    expect(parsed.rows.map(r => [r.sourceRow, r.tw, r.go])).toEqual([[3, "否", "G\nG2"], [5, "另行批复", "G2"]]);
    const reordered = parse([["公司", "序号", "航站B", "去程", "航站A", "是否有台湾地区飞行员", "回程"], ["CSG", 1, "伦敦", "G", "广州", "是", "B"]]);
    expect(reordered.rows[0]).toMatchObject({ stationA: "广州", stationB: "伦敦", go: "G", back: "B", tw: "是" });
  });
  it("临开支持标题后无表头与第一行直接数据，不丢首条", () => {
    for (const rows of [[["临开批复"], [1, "CSG", "迪拜", "广州", "G", "B"]], [[1, "CSG", "迪拜", "广州", "G", "B"]]]) {
      expect(parse(rows, "temporary").rows).toHaveLength(1);
    }
  });
  it("跳过序号列的执行要求说明尾注，仍报告真实不完整航线", () => {
    const note = "执行日期：2026年3月29日-2026年10月24日。\n相关要求：按批复航线执行。";
    const data = [1, "CSG", "广州", "伦敦", "G", "B", "否"];
    for (const kind of ["open", "temporary"] as const) {
      const rows = kind === "open" ? [header, data, [note]] : [["临开批复"], data, [note]];
      const result = parse(rows, kind);
      expect(result.rows).toHaveLength(1);
      expect(result.issues).toEqual([]);
    }
    const broken = parse([header, [2], [3, "CSG", "广州", "", "G", "B"], ["无法识别内容"]]);
    expect(broken.issues.filter(i => i.severity === "error")).toHaveLength(3);
  });
  it("缺列、空去程、缺公司或航站、错误单元格均显式报告", () => {
    expect(parse([["公司", "去程"], ["CSG", "G"]]).issues.length).toBeGreaterThan(0);
    const result = parse([header, [1, "", "广州", "伦敦", "", "B"]]);
    expect(result.issues.some(i => i.severity === "error")).toBe(true);
    const sheet = XLSX.utils.aoa_to_sheet([header, [1, "CSG", "广州", "伦敦", "G", "B"]]);
    sheet.E2 = { t: "e", v: 7 };
    expect(readApprovals(XLSX, sheet, "测试", "open").issues.some(i => i.severity === "error")).toBe(true);
    expect(parse([header]).issues.some(i => i.severity === "error")).toBe(true);
  });
  it("开放先临开后，双侧展开及重复 OD 均保留，空回程只生成去程", () => {
    const opened = parse([header, [1, "CSG", "伦敦", "迪拜", "G", "B"], [2, "CSG", "广州", "伦敦", "G2", ""], [3, "CSG", "广州", "伦敦", "G3", "B3"]]);
    const temporary = parse([["临开批复"], [1, "CSG", "迪拜", "广州", "T", "TB"]], "temporary");
    const result = analyzeApprovals(opened, temporary, catalog);
    expect(result.merged.map(r => r.go)).toEqual(["G", "G2", "G3", "T"]);
    expect(result.go).toHaveLength(14);
    expect(result.back).toHaveLength(11);
    expect(result.skippedBack).toBe(1);
    expect(result.go.slice(0, 6).map(r => [r.left, r.right])).toEqual([
      ["伦敦1", "迪拜1"], ["伦敦1", "迪拜2"], ["伦敦2", "迪拜1"], ["伦敦2", "迪拜2"], ["伦敦3", "迪拜1"], ["伦敦3", "迪拜2"]
    ]);
    expect(result.back[0]).toMatchObject({ left: "迪拜1", right: "伦敦1", code: "B", multi: true });
    expect(result.go.slice(0, 6).every(r => r.code === "G" && r.multi)).toBe(true);
    expect(result.issues).toEqual([]);
  });
  it("未知机场给来源行，保留原航站；单名机场不展开", () => {
    const result = analyzeApprovals(parse([header, [1, "CSG", "广州", "不存在机场", "G", ""]]), parse([[1, "CSG", "上海/浦东", "广州", "T", ""]], "temporary"), catalog);
    expect(result.go[0].right).toBe("不存在机场");
    expect(result.go[1]).toMatchObject({ left: "上海/浦东", right: "广州", multi: false });
    expect(result.issues[0]).toMatchObject({ sourceRow: 2, severity: "warning" });
  });
  it("日期必填、真实日历与先后校验，相同日期合法", () => {
    for (const [a, b] of [["", ""], ["2026-02-30", "2026-10-24"], ["2026-10-24", "2026-03-29"], ["5/11/26", "2026-12-01"]]) expect(validateDates(a, b).length).toBeGreaterThan(0);
    expect(validateDates("2026-03-29", "2026-10-24")).toEqual([]);
    expect(validateDates("2028-02-29", "2028-02-29")).toEqual([]);
  });
});
