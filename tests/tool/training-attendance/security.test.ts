import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import * as XLSX from "xlsx-js-style";
import { buildSecurityDraft, canExportSecurity } from "../../../src/tool/app/training-attendance/programs/security/logic";
import { buildSecurityFiles } from "../../../src/tool/app/training-attendance/programs/security/export";
import { SECURITY_TEMPLATE_PATHS, type SecurityTemplates } from "../../../src/tool/app/training-attendance/programs/security/templates";
import { buildDocumentPreview } from "../../../src/tool/app/training-attendance/document-preview";
import { parseWordXml, wordChildren, wordRows, wordText } from "../../../src/tool/app/personnel-structure-stats/docx-xml";

const roster = [
    { id: "001001", name: "测试甲", department: "测试分部", techInfo: "777:C类机长", techLevel: "C" },
    { id: "001002", name: "测试乙", department: "其他部门", techInfo: "777:A类副驾驶", techLevel: "A" }
];
const input = { kind: "initial", instructor: "测试教员", chinaDate: "2026-10-29", tsaDate: "2026-10-30", permitDate: "2026-10-28", sourceText: "通知：测试乙、测试甲，测试乙" };
const templates = Object.fromEntries(Object.entries(SECURITY_TEMPLATE_PATHS).map(([key, source]) => [key, new Uint8Array(readFileSync(resolve("public", source.replace("../../../", ""))))])) as SecurityTemplates;
const tableRows = async (bytes: Uint8Array, index: number) => {
    const zip = await JSZip.loadAsync(bytes);
    const doc = parseWordXml(await zip.file("word/document.xml")!.async("string"));
    return wordRows(wordChildren(wordChildren(doc.documentElement!, "body")[0], "tbl")[index]);
};

describe("安保初训复训资料", () => {
    it("顺序去重、保留前导零，部门与职务固定，三项日期分别填写", () => {
        const draft = buildSecurityDraft(roster, input);
        expect(canExportSecurity(draft)).toBe(true);
        expect(draft.participants).toEqual([{ employeeId: "001002", name: "测试乙", duty: "飞行员" }, { employeeId: "001001", name: "测试甲", duty: "飞行员" }]);
        expect(draft.chinaDate).toBe("2026年10月29日");
        expect(draft.tsaDate).toBe("2026年10月30日");
        expect(draft.permitDate).toBe("2026年10月28日");
    });

    it("非法日期、空参数、重名、员工号冲突禁止导出，复训不要求登机证日期", () => {
        for (const change of [{ kind: "other" }, { instructor: "" }, { chinaDate: "2026-02-29" }, { tsaDate: "" }, { permitDate: "" }, { sourceText: "说明文字" }, { instructor: "A\u0001B" }]) {
            expect(canExportSecurity(buildSecurityDraft(roster, { ...input, ...change }))).toBe(false);
        }
        expect(canExportSecurity(buildSecurityDraft(roster, { ...input, kind: "recurrent", permitDate: "" }))).toBe(true);
        expect(canExportSecurity(buildSecurityDraft([...roster, { ...roster[0], id: "999" }], input))).toBe(false);
        expect(canExportSecurity(buildSecurityDraft([...roster, { ...roster[0], name: "另一人" }], input))).toBe(false);
        expect(buildSecurityDraft([...roster, roster[0]], input).participants).toHaveLength(2);
    });

    it("初训保留四类表，个人记录一人一份，人数时间和签字栏按要求留空，三类试题保持原文件", async () => {
        const files = await buildSecurityFiles(templates, buildSecurityDraft(roster, input));
        expect(files).toHaveLength(8);
        const china = await tableRows(files[0].bytes, 0);
        const chinaList = await tableRows(files[0].bytes, 2);
        expect(wordText(china[0].cells[4])).toBe("测试教员");
        expect(wordText(china[1].cells[1])).toBe("2026年10月29日");
        expect(wordText(china[6].cells[2])).toBe("初训__人");
        expect(wordText(chinaList[1].cells[3])).toBe("");
        expect(wordText(chinaList[2].cells[3])).toBe("");
        expect(wordText(chinaList[2].cells[7])).toBe("");
        const tsa = await tableRows(files[1].bytes, 0);
        expect(wordText(tsa[1].cells[1])).toBe("2026年10月30日");
        expect(wordText(tsa[0].cells[3])).toBe("");
        const register = await tableRows(files[2].bytes, 0);
        expect(wordText(register[1].cells[2])).toBe("2026年10月28日");
        const records = files.filter(f => f.fileName.includes("签到表4"));
        expect(records).toHaveLength(2);
        for (const [i, file] of records.entries()) {
            const rows = await tableRows(file.bytes, 0);
            expect(wordText(rows[0].cells[0])).toBe(`姓名：${i ? "测试甲" : "测试乙"}`);
            expect(wordText(rows[0].cells[4])).toBe("");
            expect(wordText(rows[1].cells[1])).toBe("飞行部");
            expect(wordText(rows[1].cells[4])).toBe("飞行员");
            expect(wordText(rows[12].cells[1])).toBe("");
            expect(wordText(rows[11].cells[1])).toBe("");
            expect(wordText(rows[11].cells[4])).toBe("");
            expect(wordText(rows[3].cells[3])).toBe("测试教员");
        }
        expect(files.find(f => f.fileName.includes("试题1"))!.bytes).toEqual(templates.initialExam);
        expect(files.find(f => f.fileName.includes("试题2"))!.bytes).toEqual(templates.tsaExam);
        expect(files.find(f => f.fileName.includes("试题3"))!.bytes).toEqual(templates.permitExam);
        for (const file of files) {
            const html = await buildDocumentPreview(file, XLSX);
            expect(html.length).toBeGreaterThan(30);
            if (file.fileName.endsWith(".doc") && file.bytes[0] !== 0x50) expect(html).toContain("Word 或 WPS");
        }
    });

    it("复训只生成两份签到表和两份未填写试题，60人名单完整且初复训模板互不替代", async () => {
        const many = Array.from({ length: 60 }, (_, i) => ({ ...roster[0], id: `00${i}`, name: `人员${String.fromCharCode(0x4e00 + i)}` }));
        const draft = buildSecurityDraft(many, { ...input, kind: "recurrent", permitDate: "", sourceText: many.map(p => p.name).join("、") });
        const files = await buildSecurityFiles(templates, draft);
        expect(files).toHaveLength(4);
        const rows = await tableRows(files[0].bytes, 2);
        expect(rows).toHaveLength(65);
        expect(wordText(rows[3].cells[7])).toBe("组别：复训");
        expect(wordText(rows.at(-1)!.cells[1])).toBe("0059");
        expect((await tableRows(files[1].bytes, 0))).toHaveLength(64);
        expect(files[2].bytes).toEqual(templates.recurrentExam);
        expect(files[3].bytes).toEqual(templates.tsaExam);
    });

    it("非法草稿或所选类型缺少模板时禁止生成", async () => {
        await expect(buildSecurityFiles(templates, buildSecurityDraft(roster, { ...input, instructor: "" }))).rejects.toThrow();
        await expect(buildSecurityFiles({ ...templates, initialChina: undefined }, buildSecurityDraft(roster, input))).rejects.toThrow(/模板/);
        const recurrent = buildSecurityDraft(roster, { ...input, kind: "recurrent", permitDate: "" });
        await expect(buildSecurityFiles({ ...templates, permitRecord: undefined, permitRegister: undefined }, recurrent)).resolves.toHaveLength(4);
    });
});
