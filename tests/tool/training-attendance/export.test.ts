import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx-js-style";

import { createTrainingAttendanceExporter } from "../../../src/tool/app/training-attendance/export";
import type { CrmTemplateBuffers, TrainingAttendanceDraft, TrainingParticipant } from "../../../src/tool/app/training-attendance/models";

function bytes(fileName: string): Uint8Array {
  return new Uint8Array(readFileSync(resolve("public/template/training-attendance/crm", fileName)));
}

const templates: CrmTemplateBuffers = {
  booking: bytes("booking.xlsx"),
  attendanceDay1: bytes("attendance-day1.xlsx"),
  attendanceDay2: bytes("attendance-day2.xlsx")
};

function draft(participants: TrainingParticipant[]): TrainingAttendanceDraft {
  return {
    sessionLabel: "第12期",
    startDate: "2026/10/20",
    endDate: "2026/10/21",
    instructor1: "教员甲",
    instructor2: "教员乙",
    instructor3: "教员丙",
    participants,
    issues: []
  };
}

const participants: TrainingParticipant[] = [
  { employeeId: "100001", name: "张三", technicalInfo: "777:C类机长", rank: "机长" },
  { employeeId: "100002", name: "李四", technicalInfo: "777:A2类副驾驶", rank: "副驾驶" },
  { employeeId: "100003", name: "王五", technicalInfo: "777:飞行教员A", rank: "机长" }
];

describe("training attendance CRM export", () => {
  it("fills the booking form and both attendance sheets with one roster", () => {
    const output = createTrainingAttendanceExporter(XLSX).buildCrmWorkbooks(templates, draft(participants));
    expect(output.map((item) => item.fileName)).toEqual([
      "CRM（第12期）预订报名表.xlsx",
      "CRM年度培训（第12期）签到表1.xlsx",
      "CRM年度培训（第12期）签到表2.xlsx"
    ]);

    const booking = output[0].workbook.Sheets[output[0].workbook.SheetNames[0]];
    const day1 = output[1].workbook.Sheets[output[1].workbook.SheetNames[0]];
    const day2 = output[2].workbook.Sheets[output[2].workbook.SheetNames[0]];
    expect(booking.A1.v).toContain("第12期CRM培训名单");
    expect(booking.K3.v).toBe("教员甲、教员乙、教员丙");
    expect([booking.F3.v, booking.F4.v, booking.F5.v]).toEqual(["张三", "李四", "王五"]);
    expect([booking.G3.v, booking.G4.v, booking.G5.v]).toEqual(["100001", "100002", "100003"]);
    expect([booking.H3.v, booking.H4.v, booking.H5.v]).toEqual(["机长", "副驾驶", "机长"]);
    expect(booking.D3.v).toBe("2026/10/20");
    expect(booking.E3.v).toBe("2026/10/21");
    expect(booking.I3.v).toBe(777);
    expect(booking.J3.v).toBe("");

    expect(day1.C2.v).toBe("CRM年度培训（第12期）");
    expect(day1.C3.v).toBe("2026/10/20；广州从化壹泉湾温泉酒店");
    expect(day1.C5.v).toBe("教员甲、教员乙");
    expect(day1.C4.v).toBe("09:00-17:00");
    expect(day1.B6.v).toBe("监控与自动化，惊吓与复原力");
    expect(day2.C3.v).toBe("2026/10/21；广州从化壹泉湾温泉酒店");
    expect(day2.C5.v).toBe("教员甲、教员乙、教员丙");
    expect(day2.B6.v).toBe("文化SOP与CRM，心理课程");
    expect([day1.C9.v, day1.C10.v, day1.C11.v]).toEqual(["张三", "李四", "王五"]);
    expect([day2.C9.v, day2.C10.v, day2.C11.v]).toEqual(["张三", "李四", "王五"]);
  });

  it("extends the two-row templates downward while preserving row styles", () => {
    const many = Array.from({ length: 50 }, (_, index): TrainingParticipant => ({
      employeeId: String(200000 + index),
      name: `人员${index + 1}`,
      technicalInfo: "777:C类机长",
      rank: "机长"
    }));
    const output = createTrainingAttendanceExporter(XLSX).buildCrmWorkbooks(templates, draft(many));
    const booking = output[0].workbook.Sheets[output[0].workbook.SheetNames[0]];
    const day1 = output[1].workbook.Sheets[output[1].workbook.SheetNames[0]];

    expect(booking.A52.v).toBe(50);
    expect(booking.F52.v).toBe("人员50");
    expect(booking.A52.s).toBeTruthy();
    expect(day1.A58.v).toBe(50);
    expect(day1.C58.v).toBe("人员50");
    expect(day1.A58.s).toBeTruthy();
  });

  it("keeps serialized workbooks compact by dropping column metadata beyond the template range", () => {
    const output = createTrainingAttendanceExporter(XLSX).buildCrmWorkbooks(templates, draft(participants));

    output.forEach((item) => {
      const bytes = XLSX.write(item.workbook, { type: "array", bookType: "xlsx", cellStyles: true });
      expect(bytes.byteLength).toBeLessThan(100_000);
      const roundTrip = XLSX.read(bytes, { type: "array", cellStyles: true });
      const sheet = roundTrip.Sheets[roundTrip.SheetNames[0]];
      expect(sheet["!cols"]?.length || 0).toBeLessThanOrEqual(15);
    });
  });
});
