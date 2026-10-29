import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import * as XLSX from "xlsx-js-style";
import { buildDocumentPreview } from "../../../src/tool/app/training-attendance/document-preview";
import { buildEmergencyFile } from "../../../src/tool/app/training-attendance/programs/emergency/export";
import { buildEmergencyDraft } from "../../../src/tool/app/training-attendance/programs/emergency/logic";
import { buildCrmFiles } from "../../../src/tool/app/training-attendance/programs/crm/export";

describe("生成资料内容预览", () => {
  it("三份 CRM 生成资料均能预览完整长名单和培训参数", async () => {
    const read = (name: string): Uint8Array => new Uint8Array(readFileSync(resolve("public/template/training-attendance/crm", name)));
    const participants = Array.from({ length: 60 }, (_, i) => ({ employeeId: `00${i}`, name: `人员${String.fromCharCode(0x4e00 + i)}`, technicalInfo: "", rank: "机长" as const }));
    const files = await buildCrmFiles({ booking: read("booking.xlsx"), attendanceDay1: read("attendance-day1.xlsx"), attendanceDay2: read("attendance-day2.xlsx") }, {
      sessionLabel: "第12期", startDate: "2026/10/20", endDate: "2026/10/21", instructor1: "教员甲", instructor2: "教员乙", instructor3: "教员丙", participants, issues: []
    });
    for (const file of files) {
      const html = await buildDocumentPreview(file, XLSX);
      expect(html).toContain("第12期");
      expect(html).toContain("教员甲");
      for (const p of participants) { expect(html).toContain(p.name); expect(html).toContain(p.employeeId); }
    }
  });

  it("读取真实生成的 Word，显示复训日期、完整名单、课程和地点", async () => {
    const roster = Array.from({ length: 60 }, (_, i) => ({ id: `00${i}`, name: `人员${String.fromCharCode(0x4e00 + i)}`, department: "", techInfo: "", techLevel: "" }));
    const draft = buildEmergencyDraft(roster, { kind: "recurrent", startDate: "2026-07-29", location: "A&B<会议室>", sourceText: roster.map(p => p.name).join("、") });
    const file = await buildEmergencyFile(new Uint8Array(readFileSync(resolve("public/template/training-attendance/emergency/recurrent.docx"))), draft);
    const html = await buildDocumentPreview(file, XLSX);
    expect(html).toContain("2026年07月29日-30日");
    expect(html).toContain("紧急医疗事件处置训练");
    expect(html).toContain("A&amp;B&lt;会议室&gt;");
    for (const p of roster) { expect(html).toContain(p.name); expect(html).toContain(p.id); }
    expect(html).toContain('colspan="2"');
  });

  it("读取各个 Excel 工作表，保留前导零、显示值和合并，转义用户内容", async () => {
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([["培训标题", ""], ["001234", "<img src=x onerror=alert(1)>"]]);
    sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
    XLSX.utils.book_append_sheet(book, sheet, "报名表");
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["第二张表"]]), "签到表");
    const html = await buildDocumentPreview({ fileName: "资料.xlsx", bytes: XLSX.write(book, { type: "array", bookType: "xlsx" }) }, XLSX);
    expect(html).toContain("报名表");
    expect(html).toContain("第二张表");
    expect(html).toContain("001234");
    expect(html).toContain('colspan="2"');
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<img src=x");
  });

  it("展示 Word 内嵌图片和换行，忽略外部图片并转义文本", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:r><w:t>&lt;script&gt;alert(1)&lt;/script&gt;</w:t><w:br/><w:t>第二行</w:t><w:drawing><a:blip r:embed="rId1"/><a:blip r:link="rId2"/></w:drawing></w:r></w:p></w:body></w:document>');
    zip.file("word/_rels/document.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="media/test.png" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"/><Relationship Id="rId2" Target="https://example.invalid/secret.png" TargetMode="External" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"/></Relationships>');
    zip.file("word/media/test.png", new Uint8Array([137, 80, 78, 71]));
    const html = await buildDocumentPreview({ fileName: "问卷.docx", bytes: await zip.generateAsync({ type: "uint8array" }) }, XLSX);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("<br>");
    expect(html).toContain("data:image/png;base64,");
    expect(html).not.toContain("example.invalid");
    expect(html).not.toContain("<script>");
  });

  it("拒绝无正文和不支持的文件类型", async () => {
    const zip = new JSZip();
    await expect(buildDocumentPreview({ fileName: "empty.docx", bytes: await zip.generateAsync({ type: "uint8array" }) }, XLSX)).rejects.toThrow(/正文/);
    await expect(buildDocumentPreview({ fileName: "data.exe", bytes: new Uint8Array() }, XLSX)).rejects.toThrow(/格式/);
  });

  it("保留旧版 DOC 附件并提示下载查看，扩展名为 DOC 的实际 DOCX 可预览正文", async () => {
    const html = await buildDocumentPreview({ fileName: "试题.doc", bytes: new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]) }, XLSX);
    expect(html).toContain("旧版 Word");
    const zip = new JSZip();
    zip.file("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>原始试题正文</w:t></w:r></w:p></w:body></w:document>');
    expect(await buildDocumentPreview({ fileName: "试题.doc", bytes: await zip.generateAsync({ type: "uint8array" }) }, XLSX)).toContain("原始试题正文");
  });
});
