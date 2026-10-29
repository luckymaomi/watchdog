import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

import { buildDangerousGoodsFiles } from "../../../src/tool/app/training-attendance/programs/dangerous-goods/export";
import { DangerousGoodsLogic } from "../../../src/tool/app/training-attendance/programs/dangerous-goods/logic";
import type { DangerousGoodsTemplates } from "../../../src/tool/app/training-attendance/programs/dangerous-goods/models";
import type { CrewRosterEntry } from "../../../src/tool/app/crew-match-name-id/models";
import { parseWordXml, wordChildren, wordRows, wordText, type WordElement } from "../../../src/tool/app/personnel-structure-stats/docx-xml";

const serializeElement = (node: WordElement): string => new XMLSerializer().serializeToString(node);

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
  it.each([1, 21, 22, 26, 27, 60])("按实际 %i 人生成评价表和签到表，保留评分栏、签字空栏及表尾说明", async count => {
    const many = Array.from({ length: count }, (_, i) => ({ ...roster[0], id: `00${i}`, name: `人员${String.fromCharCode(0x4e00 + i)}` }));
    const draft = DangerousGoodsLogic.buildDangerousGoodsDraft(many, {
      sourceText: many.map(p => p.name).join("、"), instructor: "测试教员", trainingDate: "2026-10-20", taskDate: "2026-10-21", examDate: "2026-10-22", location: "测试会议室"
    });
    expect(draft.participants).toHaveLength(count);
    expect(DangerousGoodsLogic.canExportDangerousGoods(draft)).toBe(true);
    const files = await buildDangerousGoodsFiles(templates, draft);
    expect(files).toHaveLength(6 + 2 * (count + 1));
    for (const [outputIndex, source, start, footerCount] of [[1, templates.attitude, 3, 1], [2, templates.attendance, 9, 0]] as const) {
      const before = await JSZip.loadAsync(source);
      const after = await JSZip.loadAsync(files[outputIndex].bytes);
      const readTable = async (zip: JSZip) => {
        const doc = parseWordXml(await zip.file("word/document.xml")!.async("string"));
        return wordRows(wordChildren(wordChildren(doc.documentElement!, "body")[0], "tbl")[0]);
      };
      const original = await readTable(before);
      const rows = await readTable(after);
      expect(rows).toHaveLength(start + count + footerCount);
      rows.slice(start, start + count).forEach((row, i) => {
        expect(wordText(row.cells[0])).toBe(String(i + 1));
        expect(wordText(row.cells[1])).toBe(many[i].id);
        expect(wordText(row.cells[2])).toBe(many[i].name);
        if (outputIndex === 1) {
          expect(wordText(row.cells[3])).toBe("飞行部");
          expect(wordText(row.cells[8])).toBe(wordText(original[start].cells[8]));
          expect(wordText(row.cells[8])).toContain("合格");
          for (const col of [4, 5, 6, 7, 9]) expect(wordText(row.cells[col])).toBe("");
        } else {
          expect(row.cells[3]).toBe(row.cells[4]);
          expect(row.cells[5]).toBe(row.cells[6]);
          for (const col of [3, 5, 7]) expect(wordText(row.cells[col])).toBe("");
        }
        // 每个扩展名单行保留原样板行的单元格布局和字体。
        for (const [col, cell] of row.cells.entries()) {
          const originalCell = original[start].cells[col];
          expect(wordChildren(cell, "tcPr").map(serializeElement)).toEqual(wordChildren(originalCell, "tcPr").map(serializeElement));
          const firstRunProps = (target: typeof cell) => {
            const run = wordChildren(wordChildren(target, "p")[0], "r")[0];
            return run ? wordChildren(run, "rPr").map(serializeElement) : [];
          };
          expect(firstRunProps(cell)).toEqual(firstRunProps(originalCell));
        }
      });
      if (footerCount) expect(serializeElement(rows.at(-1)!.element)).toBe(serializeElement(original.at(-1)!.element));
      for (const name of Object.keys(before.files)) {
        if (name !== "word/document.xml" && !before.files[name].dir) expect(await after.file(name)!.async("uint8array")).toEqual(await before.file(name)!.async("uint8array"));
      }
    }
    expect(files.filter(f => f.fileName.includes("飞行机组任务模拟评估表"))).toHaveLength(count + 1);
    expect(files.filter(f => f.fileName.includes("飞行机组试卷"))).toHaveLength(count + 1);
  });

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
