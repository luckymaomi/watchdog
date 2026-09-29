import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx-js-style";
import { calculate } from "../../../src/tool/app/personnel-structure-stats/logic";
import type { PersonnelRecord } from "../../../src/tool/app/personnel-structure-stats/models";
import { buildReportTable, buildReportText, buildWorkbook } from "../../../src/tool/app/personnel-structure-stats/report";

function record(techInfo: string): PersonnelRecord {
  return { employeeId: "", name: techInfo, techInfo, origin: "总队777", inspectorQualification: "公司检查员", qualifications: {} };
}

describe("personnel structure browser report", () => {
  const result = calculate([record("飞行教员B"), record("E类机长"), record("F类机长"), record("划转机长"), record("B类副驾驶")]);

  it("includes accurate teacher/captain subtotals and treats inspectors as a subset", () => {
    const table = buildReportTable(result.sections[1]);
    expect(table.headers).toEqual(["分组", "项目", "人数", "占比", "口径"]);
    expect(table.rows.filter(row => row.isSubtotal).map(row => row.values)).toEqual([
      ["教员（1）", "小计", 1, "25%", "C/B类教员。"],
      ["机长（3）", "小计", 3, "75%", "含F/E/D/C/B/Z类机长、转机型机长及其他机长等级。"]
    ]);
    expect(table.rows.find(row => row.values[1] === "F类机长")?.values.slice(0, 4)).toEqual(["机长（3）", "F类机长", 1, "25%"]);
    expect(table.rows.find(row => row.values[1] === "其中：检查员")?.values[2]).toBe(4);
    expect(table.rows.filter(row => !row.isSubtotal && row.values[1] !== "其中：检查员").reduce((sum, row) => sum + Number(row.values[2]), 0)).toBe(4);
  });

  it("produces tabular copy text and a four-sheet browser workbook with the same values", () => {
    const text = buildReportText(result.sections[1]);
    expect(text).toContain("机长含以上各级别占比（4人）");
    expect(text).toContain("教员（1）\t小计\t1\t25%");
    expect(text).toContain("机长（3）\tF类机长\t1\t25%");
    const workbook = buildWorkbook(XLSX, result);
    expect(workbook.SheetNames).toEqual(["统计结果", "闭环核对", "规则说明", "未识别数据"]);
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets["统计结果"], { header: 1 });
    expect(rows[0]).toEqual(["表格", "分组", "项目", "统计关系", "人数", "母数", "占比", "口径"]);
    expect(rows).toContainEqual(["机长含以上各级别占比", "机长（3）", "F类机长", "构成项", 1, 4, "25%", "技术信息为F类机长。"]);
    expect(rows).toContainEqual(["机长含以上各级别占比", "教员（1）", "小计", "分组小计", 1, 4, "25%", "C/B类教员。"]);
    expect(rows).toContainEqual(["人员居住情况", "", "副驾驶本地居住", "构成项", 1, 1, "100%", "原单位以总队开头或等于777返聘。"]);
  });

  it("does not allocate a percentage to empty groups", () => {
    const empty = calculate([]);
    expect(buildReportTable(empty.sections[1]).rows.filter(row => row.isSubtotal).map(row => row.values.slice(2, 4))).toEqual([[0, "0%"], [0, "0%"]]);
  });
});
