import * as XLSX from "xlsx-js-style";
import { describe, expect, it } from "vitest";

import { findStrengthWorksheet } from "../../../src/tool/app/crew-strength-report/workbook";

describe("crew strength report workbook", () => {
    it("finds the data sheet by required headers instead of a fixed sheet name", () => {
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
            ["说明"],
            ["这里不是人员表"]
        ]), "实力简介");
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
            ["姓名", "技术信息", "RAMA", "REUO", "是否运行"],
            ["甲", "777:飞行教员B", 1, "", "是"]
        ]), "本周人员");

        const result = findStrengthWorksheet(XLSX, workbook);

        expect(result.sheetName).toBe("本周人员");
        expect(result.rows[1]).toEqual(["甲", "777:飞行教员B", 1, "", "是"]);
    });

    it("reports the missing header contract when no sheet matches", () => {
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["姓名"]]), "人员信息");

        expect(() => findStrengthWorksheet(XLSX, workbook)).toThrow(/技术信息.*是否运行.*RAMA.*REUO/);
    });
});
