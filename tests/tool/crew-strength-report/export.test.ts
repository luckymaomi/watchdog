import * as XLSX from "xlsx-js-style";
import { describe, expect, it } from "vitest";

import {
    buildCategoryComparisonExportRows,
    buildSnapshotExportRows,
    buildStrengthExportWorkbook,
    buildTechnicalDetailExportRows
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
        technicalDetails: [
            { category: "instructor", label: "飞行教员B", count: 3 },
            { category: "captain", label: "C类机长", count: 3 },
            { category: "firstOfficer", label: "A2类副驾驶", count: 4 }
        ],
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
        technicalDetails: [
            { category: "instructor", label: "飞行教员B", count: 3 },
            { category: "captain", label: "C类机长", count: 4 },
            { category: "firstOfficer", label: "A2类副驾驶", count: 3 }
        ],
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
    it("exports ordered snapshots, category comparison and technical details", () => {
        expect(buildSnapshotExportRows(snapshots)).toEqual([
            ["顺序", "快照", "源文件", "数据表", "数据行", "非运行", "运行人员", "教员", "机长", "副驾驶", "北美带队（RAMA）", "欧洲带队（REUO）", "技术信息未识别"],
            [1, "2026-09-04", "实力表20260904.xlsx", "人员信息", 12, 2, 10, 3, 3, 4, 2, 1, 0],
            [2, "2026-09-12", "实力表20260912.xlsx", "人员信息", 13, 2, 11, 3, 4, 3, 2, 2, 1]
        ]);
        expect(buildCategoryComparisonExportRows(snapshots)).toEqual([
            ["类别", "2026-09-04", "2026-09-12"],
            ["运行人员", 10, 11],
            ["教员", 3, 3],
            ["机长", 3, 4],
            ["副驾驶", 4, 3],
            ["北美带队（RAMA）", 2, 2],
            ["欧洲带队（REUO）", 1, 2]
        ]);
        expect(buildTechnicalDetailExportRows(snapshots)).toEqual([
            ["快照", "技术大类", "技术细分类", "人数"],
            ["2026-09-04", "教员", "飞行教员B", 3],
            ["2026-09-04", "机长", "C类机长", 3],
            ["2026-09-04", "副驾驶", "A2类副驾驶", 4],
            ["2026-09-12", "教员", "飞行教员B", 3],
            ["2026-09-12", "机长", "C类机长", 4],
            ["2026-09-12", "副驾驶", "A2类副驾驶", 3]
        ]);
    });

    it("builds a workbook with snapshot, category comparison and technical detail sheets", () => {
        const workbook = buildStrengthExportWorkbook(XLSX, snapshots);

        expect(workbook.SheetNames).toEqual(["快照统计", "分类对比", "技术细分"]);
        expect(workbook.Sheets["快照统计"]["G3"].v).toBe(11);
        expect(workbook.Sheets["分类对比"]["C4"].v).toBe(4);
        expect(workbook.Sheets["技术细分"]["C2"].v).toBe("飞行教员B");
    });
});
