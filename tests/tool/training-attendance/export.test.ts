import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx-js-style";
import JSZip from "jszip";
import { DOMParser, XMLSerializer, type Document } from "@xmldom/xmldom";

import { buildCrmFiles } from "../../../src/tool/app/training-attendance/export";
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
  it("fills the booking form and both attendance sheets with one roster", async () => {
    const output = await buildCrmFiles(templates, draft(participants));
    expect(output.map((item) => item.fileName)).toEqual([
      "CRM（第12期）预订报名表.xlsx",
      "CRM年度培训（第12期）签到表1.xlsx",
      "CRM年度培训（第12期）签到表2.xlsx"
    ]);

    const [booking, day1, day2] = output.map(item => {
      const workbook = XLSX.read(item.bytes, { type: "array", cellStyles: true });
      return workbook.Sheets[workbook.SheetNames[0]];
    });
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

  it("extends the two-row templates downward while preserving row styles", async () => {
    const many = Array.from({ length: 50 }, (_, index): TrainingParticipant => ({
      employeeId: String(200000 + index),
      name: `人员${index + 1}`,
      technicalInfo: "777:C类机长",
      rank: "机长"
    }));
    const output = await buildCrmFiles(templates, draft(many));
    const [booking, day1] = output.map(item => {
      const workbook = XLSX.read(item.bytes, { type: "array", cellStyles: true });
      return workbook.Sheets[workbook.SheetNames[0]];
    });

    expect(booking.A52.v).toBe(50);
    expect(booking.F52.v).toBe("人员50");
    expect(booking.A52.s).toBeTruthy();
    expect(day1.A58.v).toBe(50);
    expect(day1.C58.v).toBe("人员50");
    expect(day1.A58.s).toBeTruthy();
    const originalBooking = XLSX.read(templates.booking, { type: "array", cellStyles: true });
    const originalDay1 = XLSX.read(templates.attendanceDay1, { type: "array", cellStyles: true });
    expect(booking.A52.s).toEqual(originalBooking.Sheets[originalBooking.SheetNames[0]].A4.s);
    expect(day1.A58.s).toEqual(originalDay1.Sheets[originalDay1.SheetNames[0]].A10.s);
    expect(booking["!rows"]?.[51]).toEqual(originalBooking.Sheets[originalBooking.SheetNames[0]]["!rows"]?.[3]);
    expect(day1["!rows"]?.[57]).toEqual(originalDay1.Sheets[originalDay1.SheetNames[0]]["!rows"]?.[9]);
  });

  it("preserves original images, relationships, styles and print settings", async () => {
    const output = await buildCrmFiles(templates, draft(participants));
    const sources = [templates.booking, templates.attendanceDay1, templates.attendanceDay2];
    for (const [index, item] of output.entries()) {
      const before = await JSZip.loadAsync(sources[index]);
      const after = await JSZip.loadAsync(item.bytes);
      const parts = Object.keys(before.files).filter(name => !before.files[name].dir);
      expect(Object.keys(after.files).filter(name => !after.files[name].dir).sort()).toEqual(parts.sort());
      for (const name of parts.filter(name => name !== "xl/worksheets/sheet1.xml")) {
        expect(await after.file(name)!.async("uint8array"), name).toEqual(await before.file(name)!.async("uint8array"));
      }
      const parse = async (zip: JSZip) => new DOMParser().parseFromString(await zip.file("xl/worksheets/sheet1.xml")!.async("string"), "application/xml");
      const original = await parse(before);
      const filled = await parse(after);
      // Only the data and used range change; all other worksheet settings remain intact.
      const settings = (document: Document) =>
        Array.from(document.documentElement!.childNodes).filter(node => !["sheetData", "dimension"].includes(node.localName || ""))
          .map(node => new XMLSerializer().serializeToString(node));
      expect(settings(filled)).toEqual(settings(original));
      if (index > 0) expect(after.file("xl/media/image1.png")).not.toBeNull();
    }
  });

  it("retains two blank rows for a short list and preserves text identifiers and XML characters", async () => {
    const people: TrainingParticipant[] = [{ ...participants[0], name: "测试<&人员", employeeId: "001234" }];
    const output = await buildCrmFiles(templates, draft(people));
    for (const [index, item] of output.entries()) {
      const workbook = XLSX.read(item.bytes, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      expect(sheet[index ? "C9" : "F3"].v).toBe(people[0].name);
      expect(sheet[index ? "B9" : "G3"].v).toBe("001234");
      const range = XLSX.utils.decode_range(sheet["!ref"]!);
      expect(range.e.r + 1).toBe(index ? 10 : 4);
      expect(sheet[index ? "C10" : "F4"].v).toBe("");
    }
  });
});
