import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";

import { buildDangerousGoodsFiles } from "../../../src/tool/app/training-attendance/programs/dangerous-goods/export";
import { DangerousGoodsLogic } from "../../../src/tool/app/training-attendance/programs/dangerous-goods/logic";
import type { DangerousGoodsTemplates } from "../../../src/tool/app/training-attendance/programs/dangerous-goods/models";
import type { CrewRosterEntry } from "../../../src/tool/app/crew-match-name-id/models";

const templateRoot = resolve("public/template/training-attendance/dangerous-goods");
function bytes(name: string): Uint8Array { return new Uint8Array(readFileSync(resolve(templateRoot, name))); }
const templates: DangerousGoodsTemplates = {
  instructorSurvey: bytes("instructor-survey.docx"), attitude: bytes("attitude.docx"), postSurvey: bytes("post-survey.docx"),
  simulation: bytes("simulation.docx"), exam: bytes("exam.docx"), attendance: bytes("attendance.docx")
};
const roster: CrewRosterEntry[] = [
  { id: "001", name: "张三", department: "飞行部", techInfo: "777:C类机长", techLevel: "C" },
  { id: "002", name: "李四", department: "飞行部", techInfo: "777:A类副驾驶", techLevel: "A" }
];

describe("dangerous goods retraining", () => {
  it("matches the roster and validates required dates", () => {
    const draft = DangerousGoodsLogic.buildDangerousGoodsDraft(roster, {
      sourceText: "李四、张三", instructor: "教员甲", trainingDate: "2026-10-20", taskDate: "2026-10-21", examDate: "2026-10-22", location: "飞行部会议室"
    });
    expect(draft.participants.map(item => item.name)).toEqual(["李四", "张三"]);
    expect(draft.participants.map(item => item.employeeId)).toEqual(["002", "001"]);
    expect(draft.trainingDate).toBe("2026年10月20日");
    expect(DangerousGoodsLogic.shortDate(draft.examDate)).toBe("10月22日");
    expect(DangerousGoodsLogic.canExportDangerousGoods(draft)).toBe(true);
  });

  it("exports one filled set, three post surveys and N+1 untouched copies", async () => {
    const draft = DangerousGoodsLogic.buildDangerousGoodsDraft(roster, {
      sourceText: "张三 李四", instructor: "教员甲", trainingDate: "2026-10-20", taskDate: "2026-10-21", examDate: "2026-10-22", location: "飞行部会议室"
    });
    const files = await buildDangerousGoodsFiles(templates, draft);
    expect(files).toHaveLength(3 + 3 + 2 * 3);
    expect(files[0].fileName).toContain("教员评估员调查问卷");
    expect(files[2].fileName).toContain("签到表");
    const instructorXml = await (await JSZip.loadAsync(files[0].bytes)).file("word/document.xml")!.async("string");
    expect(instructorXml).toContain("教员甲");
    const attitudeXml = await (await JSZip.loadAsync(files[1].bytes)).file("word/document.xml")!.async("string");
    expect(attitudeXml).toContain("张三");
    expect(attitudeXml).toContain("李四");
    const attendanceXml = await (await JSZip.loadAsync(files[2].bytes)).file("word/document.xml")!.async("string");
    expect(attendanceXml).toContain("2026年10月20日");
    expect(attendanceXml).toContain("2026年10月21日");
    expect(attendanceXml).toContain("2026年10月22日");
    expect(attendanceXml).not.toContain("2026年10月20日日");
    const attendanceDocument = new DOMParser().parseFromString(attendanceXml, "application/xml");
    const documentElement = attendanceDocument.documentElement;
    if (!documentElement) throw new Error("签到表 XML 缺少根节点");
    expect(documentElement.localName).toBe("document");
    expect(documentElement.textContent).toContain("培训地点飞行部会议室");
    expect(documentElement.textContent).toContain("10月22日(9:00-12:00)上午签名");
    expect(documentElement.textContent).toContain("10月22日(13:00-17:30)下午签名");
    expect(files.filter(item => item.fileName.includes("学员培训后调查问卷"))).toHaveLength(3);
    expect(files.filter(item => item.fileName.includes("飞行机组任务模拟评估表"))).toHaveLength(3);
    expect(files.filter(item => item.fileName.includes("飞行机组试卷"))).toHaveLength(3);
  });
});
