import * as XLSX from "xlsx-js-style";
import { describe, expect, it } from "vitest";

import { createMedicalExamExporter } from "../../../src/tool/app/medical-exam-scheduler/export";
import type { MedicalExamPerson } from "../../../src/tool/app/medical-exam-scheduler/models";

describe("medical exam scheduler export", () => {
  it("fills the selected sheet, preserves other sheets and keeps the four-column layout", () => {
    const workbook = XLSX.utils.book_new();
    const quota = XLSX.utils.aoa_to_sheet([
      ["2026年11月日期", "2026年11月额度"],
      [new Date(2026, 10, 2), 2]
    ]);
    const roster = XLSX.utils.aoa_to_sheet([
      ["员工号", "姓名", "体检日", "备注"],
      [100001, "甲", "", "原表其他内容"]
    ]);
    XLSX.utils.book_append_sheet(workbook, quota, "可用日期2026");
    XLSX.utils.book_append_sheet(workbook, roster, "2026.11");
    const sourceQuota = JSON.stringify(workbook.Sheets["可用日期2026"]);
    const people: MedicalExamPerson[] = [{
      employeeId: "100001",
      name: "甲",
      sourceRow: 2,
      department: "一分部",
      technicalInfo: "777:D类机长",
      isNorthAmericaLeader: true,
      examDate: "2026-11-02",
      note: "",
      matchedRoster: true,
      adjusted: true,
      adjustmentNotes: ["移动：待分配 → 2026-11-02"]
    }];

    const exporter = createMedicalExamExporter(XLSX);
    const output = exporter.buildExportWorkbook(workbook, "2026.11", 0, {
      employeeId: 0,
      name: 1,
      examDate: 2,
      note: 3
    }, people);
    const sheet = output.Sheets["2026.11"];

    expect(output).not.toBe(workbook);
    expect(JSON.stringify(output.Sheets["可用日期2026"])).toBe(sourceQuota);
    expect(sheet.C2.t).toBe("d");
    expect(sheet.C2.z).toBe("yyyy-mm-dd");
    expect(sheet.D2.v).toContain("原表其他内容");
    expect(sheet.D2.v).toContain("待分配");
    expect(sheet.A1.s.alignment.horizontal).toBe("center");
    expect(sheet.A1.s.fill).toEqual({});
    expect(sheet["!rows"]?.[0]?.hpt).toBe(26);
    expect(sheet["!cols"]?.[2]?.wch).toBe(16);
    expect(sheet["!autofilter"]?.ref).toBe("A1:D2");
  });
});
