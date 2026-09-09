import * as XLSX from "xlsx-js-style";
import { describe, expect, it } from "vitest";
import { compareLanguageValidity } from "../../../src/tool/app/language-validity-compare/comparison";
import { buildLanguageExportWorkbook } from "../../../src/tool/app/language-validity-compare/export";
import { parseCaacWorkbook, parsePersonnelWorkbook, normalizeDate, extractLanguageNoteValue } from "../../../src/tool/app/language-validity-compare/workbook";

function workbook(rows: unknown[][], sheetName = "数据"): XLSX.WorkBook {
  const result = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(result, XLSX.utils.aoa_to_sheet(rows), sheetName);
  return result;
}

describe("language validity workbook parsing", () => {
  it("normalizes Excel dates and Chinese date text without timezone leakage", () => {
    expect(normalizeDate(new Date(2028, 8, 14, 23, 59))).toBe("2028-09-14");
    expect(normalizeDate(47011)).toBe("2028-09-15");
    expect(normalizeDate("2028年9月15日")).toBe("2028-09-15");
    expect(normalizeDate("9/15/28")).toBe("");
  });

  it("extracts each language date from the AK license note", () => {
    const note = "英语语言能力 4级，有效期至 2029-07-15\n汉语语言能力 6级，有效期至 2030/8/1";
    expect(extractLanguageNoteValue(note, "英语")).toEqual(expect.objectContaining({ date: "2029-07-15" }));
    expect(extractLanguageNoteValue(note, "汉语")).toEqual(expect.objectContaining({ date: "2030-08-01" }));
  });

  it("finds tables by headers and parses personnel M/N and CAAC AK values", () => {
    const personnel = parsePersonnelWorkbook(XLSX, workbook([["说明"], ["员工号", "姓名", "英语能力", "汉语能力"], ["001", "张三", "2028年9月15日", "不适用"]], "任意人员"));
    const caac = parseCaacWorkbook(XLSX, workbook([["飞行员ID", "姓名", "执照备注"], ["900", "张三", "英语语言能力 4级，有效期至 2028-09-15\n汉语语言能力 6级，无线电通信资格"]], "任意局方"));
    expect(personnel.records[0]).toEqual(expect.objectContaining({ employeeId: "001", name: "张三", english: { raw: "2028年9月15日", date: "2028-09-15" } }));
    expect(caac.records[0]).toEqual(expect.objectContaining({ pilotId: "900", name: "张三", english: expect.objectContaining({ date: "2028-09-15" }), chinese: expect.objectContaining({ raw: expect.stringContaining("汉语") }) }));
  });
});

describe("language validity comparison", () => {
  it("matches by name when employee and pilot identifiers use different systems", () => {
    const personnel = parsePersonnelWorkbook(XLSX, workbook([["员工号", "姓名", "英语能力", "汉语能力"], ["181001", "张三", "2028-09-15", "不适用"], ["181002", "李四", "2028-09-15", "待确认"]]));
    const caac = parseCaacWorkbook(XLSX, workbook([["飞行员ID", "姓名", "执照备注"], ["9001", "张三", "英语语言能力 4级，有效期至 2028-09-16\n汉语语言能力 6级"], ["9002", "王五", "英语语言能力 4级，有效期至 2028-09-15"]]));
    const result = compareLanguageValidity(personnel, caac);
    expect(result.totals).toMatchObject({ personnelPeople: 2, caacPeople: 2, matchedPeople: 1, personnelOnlyPeople: 1, caacOnlyPeople: 1 });
    expect(result.details.find((item) => item.name === "张三" && item.language === "英语")).toEqual(expect.objectContaining({ status: "日期不一致", personnelDate: "2028-09-15", caacDate: "2028-09-16" }));
    expect(result.details.find((item) => item.name === "张三" && item.language === "汉语")).toEqual(expect.objectContaining({ status: "均无有效期" }));
    expect(result.details.find((item) => item.name === "李四" && item.language === "英语")).toEqual(expect.objectContaining({ status: "人员未匹配" }));
    expect(result.details.find((item) => item.name === "王五" && item.language === "英语")).toEqual(expect.objectContaining({ status: "局方未匹配" }));
  });

  it("exports summaries, details and data issues with frozen headers", () => {
    const personnel = parsePersonnelWorkbook(XLSX, workbook([["员工号", "姓名", "英语能力", "汉语能力"], ["1", "张三", "2028-09-15", "不适用"]]));
    const caac = parseCaacWorkbook(XLSX, workbook([["飞行员ID", "姓名", "执照备注"], ["2", "张三", "英语语言能力 4级，有效期至 2028-09-16"]]));
    const result = compareLanguageValidity(personnel, caac);
    const exported = buildLanguageExportWorkbook(XLSX, result);
    expect(exported.SheetNames).toEqual(["语言汇总", "比对明细", "数据问题"]);
    expect(exported.Sheets["比对明细"].A1.v).toBe("姓名");
    expect(exported.Sheets["比对明细"]["!autofilter"]?.ref).toBe("A1:K3");
    expect((exported.Sheets["语言汇总"] as XLSX.WorkSheet & { "!freeze"?: { ySplit: number } })["!freeze"]?.ySplit).toBe(1);
  });
});
