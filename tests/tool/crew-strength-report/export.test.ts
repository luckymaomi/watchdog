import * as XLSX from "xlsx-js-style";
import { describe, expect, it } from "vitest";

import {
    buildChangeExportRows,
    buildSnapshotExportRows,
    buildStrengthExportWorkbook
} from "../../../src/tool/app/crew-strength-report/export";
import type { StrengthSnapshot } from "../../../src/tool/app/crew-strength-report/models";

const snapshots: StrengthSnapshot[] = [
    {
        id: "first",
        fileName: "实力表20260904.xlsx",
        label: "2026-09-04",
        sheetName: "人员信息",
        totalDataRows: 12,
        excludedRows: 2,
        unclassifiedOperationalRows: 0,
        metrics: {
            operationalTotal: 10,
            instructor: 3,
            captain: 3,
            firstOfficer: 4,
            northAmericaLeader: 2,
            europeLeader: 1
        }
    },
    {
        id: "second",
        fileName: "实力表20260912.xlsx",
        label: "2026-09-12",
        sheetName: "人员信息",
        totalDataRows: 13,
        excludedRows: 2,
        unclassifiedOperationalRows: 1,
        metrics: {
            operationalTotal: 11,
            instructor: 3,
            captain: 4,
            firstOfficer: 3,
            northAmericaLeader: 2,
            europeLeader: 2
        }
    }
];

describe("crew strength report export", () => {
    it("exports ordered snapshots and adjacent numeric changes", () => {
        expect(buildSnapshotExportRows(snapshots)).toEqual([
            ["顺序", "快照", "源文件", "数据表", "数据行", "非运行", "运行人员", "教员", "机长", "副驾驶", "北美带队（RAMA）", "欧洲带队（REUO）", "技术信息未识别"],
            [1, "2026-09-04", "实力表20260904.xlsx", "人员信息", 12, 2, 10, 3, 3, 4, 2, 1, 0],
            [2, "2026-09-12", "实力表20260912.xlsx", "人员信息", 13, 2, 11, 3, 4, 3, 2, 2, 1]
        ]);
        expect(buildChangeExportRows(snapshots)).toEqual([
            ["从", "到", "运行人员", "教员", "机长", "副驾驶", "北美带队（RAMA）", "欧洲带队（REUO）"],
            ["2026-09-04", "2026-09-12", 1, 0, 1, -1, 0, 1]
        ]);
    });

    it("builds a workbook with snapshot and change sheets", () => {
        const workbook = buildStrengthExportWorkbook(XLSX, snapshots);

        expect(workbook.SheetNames).toEqual(["快照统计", "相邻变化"]);
        expect(workbook.Sheets["快照统计"]["G3"].v).toBe(11);
        expect(workbook.Sheets["相邻变化"]["D2"].v).toBe(0);
    });
});
