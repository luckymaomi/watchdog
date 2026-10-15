import { describe, expect, it } from "vitest";
import JSZip from "jszip";

import { buildTrainingTemplateArchive, TRAINING_TEMPLATE_FILES } from "../../../src/tool/app/training-attendance/template-export";

describe("training attendance template archive", () => {
    it("exports every template under Chinese project folders", async () => {
        const content = new TextEncoder().encode("template");
        const archive = await buildTrainingTemplateArchive(async () => content);
        const zip = await JSZip.loadAsync(archive);
        const files = Object.keys(zip.files).filter((name) => !name.endsWith("/")).sort();
        expect(files).toEqual(TRAINING_TEMPLATE_FILES.map((item) => item.target).sort());
        expect(await zip.file("CRM/预订报名表.xlsx")!.async("string")).toBe("template");
        expect(await zip.file("危险品复训/危险品（复训）签到表.docx")!.async("string")).toBe("template");
        expect(await zip.file("开课通知/B777机型机长转机型理论培训开课通知模板.docx")!.async("string")).toBe("template");
        expect(await zip.file("开课通知/B777机型副驾驶转机型理论培训开课通知模板.docx")!.async("string")).toBe("template");
    });
});
