import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildEmergencyDraft, canExportEmergency } from "../../../src/tool/app/training-attendance/programs/emergency/logic";
import { buildEmergencyFile, EMERGENCY_TEMPLATES } from "../../../src/tool/app/training-attendance/programs/emergency/export";
import type { EmergencyInput } from "../../../src/tool/app/training-attendance/programs/emergency/models";
import { parseWordXml, wordChildren, wordRows, wordText } from "../../../src/tool/app/personnel-structure-stats/docx-xml";

const roster = [
    { id: "001001", name: "测试甲", department: "测试单位", techInfo: "", techLevel: "" },
    { id: "001002", name: "测试乙", department: "测试单位", techInfo: "", techLevel: "" }
];
const input: EmergencyInput = { kind: "initial", startDate: "2026-12-31", location: "测试地点", sourceText: "通知：测试乙、测试甲、测试乙，请参加。" };
const load = (kind: "initial" | "recurrent"): Uint8Array => new Uint8Array(readFileSync(resolve("public", EMERGENCY_TEMPLATES[kind].replace("../../../", ""))));

describe("应急培训签到表", () => {
    it("按姓名出现顺序去重并保留员工号前导零，初训一天，复训两天", () => {
        const draft = buildEmergencyDraft(roster, input);
        expect(draft.participants.map(p => p.employeeId)).toEqual(["001002", "001001"]);
        expect(draft.trainingTime).toBe("2026年12月31日");
        expect(canExportEmergency(draft)).toBe(true);
        expect(buildEmergencyDraft(roster, { ...input, kind: "recurrent" }).trainingTime).toBe("2026年12月31日至2027年1月1日");
        expect(buildEmergencyDraft(roster, { ...input, kind: "recurrent", startDate: "2028-02-28" }).trainingTime).toBe("2028年2月28日至2028年2月29日");
        expect(buildEmergencyDraft(roster, { ...input, kind: "recurrent", startDate: "2027-02-28" }).trainingTime).toBe("2027年2月28日至2027年3月1日");
    });

    it("拒绝无效参数、重名和员工号冲突，重复花名册记录不增加人数", () => {
        for (const change of [{ startDate: "2026-02-29" }, { startDate: "" }, { location: "" }, { location: "A\u0001B" }, { sourceText: "" }, { sourceText: "不在册" }, { kind: "unknown" }]) {
            expect(canExportEmergency(buildEmergencyDraft(roster, { ...input, ...change }))).toBe(false);
        }
        expect(canExportEmergency(buildEmergencyDraft([...roster, { ...roster[0], id: "999" }], input))).toBe(false);
        expect(canExportEmergency(buildEmergencyDraft([...roster, { ...roster[0], name: "另一人" }], input))).toBe(false);
        expect(buildEmergencyDraft([...roster, roster[0]], input).participants).toHaveLength(2);
    });

    it.each(["initial", "recurrent"] as const)("填充 %s 模板，动态扩展名单并保留课程、签字栏和其他 Word 部件", async kind => {
        const many = Array.from({ length: 32 }, (_, i) => ({ ...roster[0], id: `00${i}`, name: `人员${String.fromCharCode(0x4e00 + i)}` }));
        const draft = buildEmergencyDraft(many, { ...input, kind, location: "A&B<会议室>", sourceText: many.map(p => p.name).join("、") });
        const source = load(kind);
        const file = await buildEmergencyFile(source, draft);
        const before = await JSZip.loadAsync(source);
        const after = await JSZip.loadAsync(file.bytes);
        const document = parseWordXml(await after.file("word/document.xml")!.async("string"));
        const body = wordChildren(document.documentElement!, "body")[0];
        const rows = wordRows(wordChildren(body, "tbl")[0]);
        const headerIndex = kind === "initial" ? 8 : 14;
        expect(rows).toHaveLength(headerIndex + 1 + many.length);
        expect(wordText(rows[1].cells[1])).toBe(draft.trainingTime);
        expect(wordText(rows[1].cells[kind === "initial" ? 4 : 5])).toBe("A&B<会议室>");
        expect(wordText(rows[3].cells[1])).toBe(kind === "initial" ? "转机型" : "正常复训");
        expect(wordText(rows[6].cells[0])).toBe(kind === "initial" ? "一次性应急训练" : "紧急医疗事件处置训练");
        for (const row of rows.slice(6, headerIndex)) expect(wordText(row.cells[5])).toBe("");
        rows.slice(headerIndex + 1).forEach((row, i) => {
            expect(row.cells).toHaveLength(6);
            expect(row.cells[2]).toBe(row.cells[3]);
            expect(wordText(row.cells[0])).toBe(String(i + 1));
            expect(wordText(row.cells[1])).toBe(many[i].id);
            expect(wordText(row.cells[2])).toBe(many[i].name);
            expect(wordText(row.cells[5])).toBe("");
        });
        expect(wordText(body)).not.toMatch(/[{}]/);
        expect(file.fileName).toBe(`应急${kind === "initial" ? "初训" : "复训"}_签到表_2026-12-31.docx`);
        for (const name of Object.keys(before.files)) {
            if (name !== "word/document.xml" && !before.files[name].dir) expect(await after.file(name)!.async("uint8array")).toEqual(await before.file(name)!.async("uint8array"));
        }
        const single = await buildEmergencyFile(source, buildEmergencyDraft(roster, { ...input, kind, sourceText: "测试甲" }));
        const singleZip = await JSZip.loadAsync(single.bytes);
        const singleDoc = parseWordXml(await singleZip.file("word/document.xml")!.async("string"));
        expect(wordRows(wordChildren(wordChildren(singleDoc.documentElement!, "body")[0], "tbl")[0])).toHaveLength(headerIndex + 2);
    });

    it("模板字段缺失和数据健康检查错误时拒绝生成", async () => {
        const source = load("initial");
        await expect(buildEmergencyFile(source, buildEmergencyDraft(roster, { ...input, sourceText: "" }))).rejects.toThrow();
        await expect(buildEmergencyFile(source, buildEmergencyDraft(roster, { ...input, kind: "recurrent" }))).rejects.toThrow(/类型/);
        const zip = await JSZip.loadAsync(source);
        zip.file("word/document.xml", (await zip.file("word/document.xml")!.async("string")).replace("{培训时间}", ""));
        await expect(buildEmergencyFile(await zip.generateAsync({ type: "uint8array" }), buildEmergencyDraft(roster, input))).rejects.toThrow(/培训时间/);
        const unknown = await JSZip.loadAsync(source);
        unknown.file("word/document.xml", (await unknown.file("word/document.xml")!.async("string")).replace("{培训时间}", "{未知字段}"));
        await expect(buildEmergencyFile(await unknown.generateAsync({ type: "uint8array" }), buildEmergencyDraft(roster, input))).rejects.toThrow(/未知字段/);
    });
});
