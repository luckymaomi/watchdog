import * as XLSX from "xlsx-js-style";
import { describe, expect, it } from "vitest";

import { createMedicalExamExporter } from "../../../src/tool/app/medical-exam-scheduler/export";
import type { MedicalExamPerson } from "../../../src/tool/app/medical-exam-scheduler/models";

describe("medical exam scheduler export", () => {
  it("fills the selected sheet, preserves other sheets and appends named status columns", () => {
    const workbook = XLSX.utils.book_new();
    const quota = XLSX.utils.aoa_to_sheet([
      [new Date(2026, 10, 1), "2026/11额度"],
      [new Date(2026, 10, 2), 2]
    ]);
    const roster = XLSX.utils.aoa_to_sheet([
      ["员工号", "姓名", "体检日", "备注", ""],
      [100001, "甲", "", "", "已锁/变更"]
    ]);
    XLSX.utils.book_append_sheet(workbook, quota, "额度");
    XLSX.utils.book_append_sheet(workbook, roster, "2026.10");
    const sourceQuota = JSON.stringify(workbook.Sheets["额度"]);
    const people: MedicalExamPerson[] = [{
      employeeId: "100001",
      name: "甲",
      sourceRow: 2,
      department: "一分部",
      technicalInfo: "777:D类机长",
      isNorthAmericaLeader: true,
      examDate: "2026-11-02",
      note: "",
      locked: true,
      matchedRoster: true,
      adjusted: true,
      adjustmentNotes: ["移动：待分配 → 2026-11-02"]
    }];

    const exporter = createMedicalExamExporter(XLSX);
    const output = exporter.buildExportWorkbook(workbook, "2026.10", 0, {
      employeeId: 0,
      name: 1,
      examDate: 2,
      note: 3
    }, people);
    const sheet = output.Sheets["2026.10"];

    expect(output).not.toBe(workbook);
    expect(JSON.stringify(output.Sheets["额度"])).toBe(sourceQuota);
    expect(sheet.C2.t).toBe("d");
    expect(sheet.C2.z).toBe("yyyy-mm-dd");
    expect(sheet.F1.v).toBe("锁班状态");
    expect(sheet.F2.v).toBe("已锁");
    expect(sheet.G1.v).toBe("调整说明");
    expect(sheet.G2.v).toContain("待分配");
    expect(sheet.E2.v).toBe("已锁/变更");
  });
});
