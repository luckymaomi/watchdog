import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { fillSecurityTemplate } from "../../../src/tool/app/training-attendance/programs/security/template";
import { parseWordXml, wordChildren, wordRows, wordText } from "../../../src/tool/app/personnel-structure-stats/docx-xml";

const load = (name: string): Uint8Array => new Uint8Array(readFileSync(resolve("public/template/training-attendance/security", name)));
const participants = Array.from({ length: 60 }, (_, i) => ({ employeeId: `00${i}`, name: `人员${String.fromCharCode(0x4e00 + i)}`, duty: "飞行员" }));
const fields = { 教员: "测试教员", 开课日期: "2026年10月29日", TSA日期: "2026年10月30日", 登机证日期: "2026年10月28日" };

describe("安保模板字段填充", () => {
    it.each([
        ["initial-china.docx", "china", 2, 5], ["recurrent-china.docx", "china", 2, 5],
        ["initial-tsa.docx", "tsa", 0, 4], ["recurrent-tsa.docx", "tsa", 0, 4],
        ["initial-permit-register.docx", "permitRegister", 0, 6]
    ] as const)("%s 可扩展到60人并保留签字空栏和正文外部件", async (name, type, tableIndex, headerCount) => {
        const source = load(name);
        const bytes = await fillSecurityTemplate(source, type, fields, participants);
        const before = await JSZip.loadAsync(source);
        const after = await JSZip.loadAsync(bytes);
        const doc = parseWordXml(await after.file("word/document.xml")!.async("string"));
        const body = wordChildren(doc.documentElement!, "body")[0];
        const rows = wordRows(wordChildren(body, "tbl")[tableIndex]);
        expect(rows).toHaveLength(headerCount + 60);
        rows.slice(headerCount).forEach((row, i) => {
            expect(wordText(row.cells[0])).toBe(String(i + 1));
            expect(wordText(row.cells[1])).toBe(participants[i].employeeId);
            expect(wordText(row.cells[2])).toBe(participants[i].name);
            if (type === "china") {
                expect(wordText(row.cells[4])).toBe("飞行员");
                for (const col of [5, 6, 7, 8]) expect(wordText(row.cells[col])).toBe("");
            } else for (const cell of new Set(row.cells.slice(3))) expect(wordText(cell)).toBe("");
        });
        expect(wordText(body)).not.toMatch(/[{}]/);
        for (const key of Object.keys(before.files)) if (key !== "word/document.xml" && !before.files[key].dir) {
            expect(await after.file(key)!.async("uint8array")).toEqual(await before.file(key)!.async("uint8array"));
        }
    });

    it("个人记录填写姓名、部门、教员学员列，结论、证件编号及签字栏留空", async () => {
        const bytes = await fillSecurityTemplate(load("initial-permit-record.docx"), "permitRecord", {
            教员: "测试教员", 姓名: "测试学员", 部门: "飞行部", 职务: "飞行员"
        });
        const zip = await JSZip.loadAsync(bytes);
        const doc = parseWordXml(await zip.file("word/document.xml")!.async("string"));
        const rows = wordRows(wordChildren(wordChildren(doc.documentElement!, "body")[0], "tbl")[0]);
        expect(wordText(rows[0].cells[0])).toBe("姓名：测试学员");
        expect(wordText(rows[0].cells[4])).toBe("");
        expect(wordText(rows[1].cells[1])).toBe("飞行部");
        for (const row of rows.slice(3, 9)) {
            expect(wordText(row.cells[1])).toBe("");
            expect(wordText(row.cells[2])).toBe("2");
            expect(wordText(row.cells[3])).toBe("测试教员");
            expect(wordText(row.cells[4])).toBe("测试学员");
        }
        expect(wordText(rows[11].cells[1])).toBe("");
        expect(wordText(rows[11].cells[4])).toBe("");
        expect(wordText(rows[12].cells[1])).toBe("");
    });

    it("缺少模板字段、空名单或缺少填写值时拒绝生成", async () => {
        const source = load("initial-china.docx");
        await expect(fillSecurityTemplate(source, "china", fields, [])).rejects.toThrow(/名单/);
        await expect(fillSecurityTemplate(source, "china", {}, participants)).rejects.toThrow(/未提供/);
        const zip = await JSZip.loadAsync(source);
        zip.file("word/document.xml", (await zip.file("word/document.xml")!.async("string")).replace("{教员}", ""));
        await expect(fillSecurityTemplate(await zip.generateAsync({ type: "uint8array" }), "china", fields, participants)).rejects.toThrow(/教员/);
    });
});
