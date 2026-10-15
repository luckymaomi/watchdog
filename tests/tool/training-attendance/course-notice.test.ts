import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";
import type { CrewRosterEntry } from "../../../src/tool/app/crew-match-name-id/models";
import { matchRosterEntriesByText } from "../../../src/tool/app/crew-match-name-id/logic";
import { buildCourseNoticeDraft, canExportCourseNotice } from "../../../src/tool/app/training-attendance/programs/course-notice/logic";
import { buildCourseNoticeFile, COURSE_NOTICE_TEMPLATES } from "../../../src/tool/app/training-attendance/programs/course-notice/export";
import type { CourseNoticeInput } from "../../../src/tool/app/training-attendance/programs/course-notice/models";

const roster: CrewRosterEntry[] = [
  { id: "001001", name: "测试甲", department: "测试分部", techInfo: "", techLevel: "" },
  { id: "001002", name: "测试乙", department: "测试分部", techInfo: "", techLevel: "" }
];
const input: CourseNoticeInput = {
  role: "机长", year: "2027", period: "一", addressee: "测试单位", participantUnit: "测试单位", classNumber: "TEST-2701",
  startDate: "2027-03-01", endDate: "2027-03-23", issueDate: "2027-02-25", sourceText: "培训安排：测试乙(001002)、测试甲；其他说明和不在册文字。"
};
const loadTemplate = (role: string): Uint8Array => new Uint8Array(readFileSync(resolve("public", COURSE_NOTICE_TEMPLATES[role].replace("../../../", ""))));
const textOf = (xml: string): string => new DOMParser().parseFromString(xml, "application/xml").documentElement!.textContent || "";

describe("course opening notice", () => {
  it("matches names to employee IDs in input order, keeps leading zeros and generates the original list punctuation", () => {
    const draft = buildCourseNoticeDraft(roster, input);
    expect(draft.participants.map(person => person.employeeId)).toEqual(["001002", "001001"]);
    expect(draft.fields["参训人员"]).toBe("测试乙(001002)、测试甲(001001)");
    expect(draft.fields["人数"]).toBe("2");
    expect(draft.fields["开课日期"]).toBe("2027年3月1日");
    expect(canExportCourseNotice(draft)).toBe(true);
  });

  it("extracts names from mixed text just like the name-to-ID tool and ignores other words", () => {
    for (const sourceText of ["测试甲 不在册", "通知：测试乙/测试甲，请按时参加。", "测试甲XYZ", "测试乙(001002)、测试甲（001001），备注：待定"]) {
      const draft = buildCourseNoticeDraft(roster, { ...input, sourceText });
      expect(draft.participants.map(person => person.employeeId)).toEqual(matchRosterEntriesByText(roster, sourceText).map(person => person.id));
      expect(canExportCourseNotice(draft)).toBe(true);
    }
    for (const sourceText of ["测试", "001001", "纯说明文字"]) {
      const draft = buildCourseNoticeDraft(roster, { ...input, sourceText });
      expect(draft.participants).toHaveLength(0);
      expect(canExportCourseNotice(draft)).toBe(false);
    }
  });

  it("deduplicates repeated names and still identifies ambiguous roster names", () => {
    const duplicate = buildCourseNoticeDraft(roster, { ...input, sourceText: "测试甲\n测试乙,测试甲；测试乙" });
    expect(duplicate.participants).toHaveLength(2);
    expect(duplicate.participants.map(person => person.name)).toEqual(["测试甲", "测试乙"]);
    expect(canExportCourseNotice(duplicate)).toBe(true);
    const conflict = buildCourseNoticeDraft([...roster, { ...roster[0], id: "001003" }], { ...input, sourceText: "通知：测试甲、测试乙，请参加。" });
    expect(conflict.participants.map(person => person.name)).toEqual(["测试乙"]);
    expect(conflict.issues.some(issue => issue.message.includes("多个员工号"))).toBe(true);
    expect(canExportCourseNotice(conflict)).toBe(false);
    const identical = buildCourseNoticeDraft([...roster, { ...roster[0] }], input);
    expect(identical.participants).toHaveLength(2);
  });

  it("blocks conflicting roster records sharing an employee ID", () => {
    const conflict = buildCourseNoticeDraft([...roster, { ...roster[0], name: "另一人" }], { ...input, sourceText: "测试甲、另一人" });
    expect(canExportCourseNotice(conflict)).toBe(false);
    expect(conflict.issues.some(issue => issue.message.includes("多个姓名"))).toBe(true);
  });

  it("validates dates, roles and required notice fields without inventing missing values", () => {
    for (const change of [
      { sourceText: "" }, { year: "" }, { period: "" }, { addressee: "" }, { participantUnit: "" }, { classNumber: "" },
      { role: "其他" }, { startDate: "2027-02-29" }, { endDate: "2027-02-28" }, { issueDate: "2027-02-30" }, { year: "2027年" }
    ]) expect(canExportCourseNotice(buildCourseNoticeDraft(roster, { ...input, ...change }))).toBe(false);
    expect(canExportCourseNotice(buildCourseNoticeDraft(roster, { ...input, endDate: input.startDate }))).toBe(true);
    expect(buildCourseNoticeDraft(roster, { ...input, classNumber: "A\u0001B" }).issues.some(issue => issue.severity === "error")).toBe(true);
  });

  it.each(["机长", "副驾驶"])("fills the %s template and keeps all original formatting and other package parts", async role => {
    const source = loadTemplate(role);
    const draft = buildCourseNoticeDraft(roster, { ...input, role });
    const file = await buildCourseNoticeFile(source, draft);
    const before = await JSZip.loadAsync(source);
    const after = await JSZip.loadAsync(file.bytes);
    const original = await before.file("word/document.xml")!.async("string");
    const xml = await after.file("word/document.xml")!.async("string");
    const text = textOf(xml);
    expect(file.fileName).toBe(`关于2027年第一期B777机型${role}转机型理论培训开课的通知.docx`);
    expect(text).toContain(`关于2027年第一期B777机型${role}`);
    expect(text).toContain(`对2名飞行人员进行${role}转B777机型理论培训`);
    expect(text).toContain("测试单位：测试乙(001002)、测试甲(001001)。");
    expect(text).toContain("2027年3月1日至2027年3月23日");
    expect(text).toContain("南货航飞行部");
    expect(text).toContain("2027年2月25日");
    expect(text).not.toMatch(/[{}]|undefined/);
    const stripText = (s: string): string => s.replace(/(<w:t\b[^>]*>)[\s\S]*?(<\/w:t>)/g, "$1$2");
    expect(stripText(xml)).toBe(stripText(original));
    expect(Object.keys(after.files)).toEqual(Object.keys(before.files));
    for (const name of Object.keys(before.files)) {
      if (name !== "word/document.xml" && !before.files[name].dir) {
        expect(await after.file(name)!.async("uint8array")).toEqual(await before.file(name)!.async("uint8array"));
      }
    }
  });

  it("supports a long roster and escapes XML values while keeping exact text", async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ ...roster[0], id: String(100000 + i), name: `测试${i}` }));
    const draft = buildCourseNoticeDraft(many, { ...input, addressee: "A&B<单位>", sourceText: many.map(p => p.name).join("\n") });
    const file = await buildCourseNoticeFile(loadTemplate("机长"), draft);
    const xml = await (await JSZip.loadAsync(file.bytes)).file("word/document.xml")!.async("string");
    expect(textOf(xml)).toContain("A&B<单位>");
    expect(textOf(xml)).toContain(many.map(p => `${p.name}(${p.id})`).join("、"));
    expect(textOf(xml)).toContain("对60名飞行人员");
  });

  it("refuses invalid drafts and templates with missing fields", async () => {
    await expect(buildCourseNoticeFile(loadTemplate("机长"), buildCourseNoticeDraft(roster, { ...input, sourceText: "不在册" }))).rejects.toThrow();
    const zip = await JSZip.loadAsync(loadTemplate("机长"));
    zip.file("word/document.xml", (await zip.file("word/document.xml")!.async("string")).replace("{班级编号}", "缺失字段"));
    await expect(buildCourseNoticeFile(await zip.generateAsync({ type: "uint8array" }), buildCourseNoticeDraft(roster, input))).rejects.toThrow("班级编号");
  });
});
