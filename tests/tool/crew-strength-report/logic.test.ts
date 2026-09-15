import { describe, expect, it } from "vitest";

import {
    METRIC_DEFINITIONS,
    analyzeStrengthRows,
    buildSnapshotLabel,
    getChangedMetricKeys,
    getDefaultSelectedMetricKeys,
    moveSnapshotByIndex
} from "../../../src/tool/app/crew-strength-report/logic";
import type { StrengthSnapshot } from "../../../src/tool/app/crew-strength-report/models";

function snapshot(overrides: Partial<StrengthSnapshot> = {}): StrengthSnapshot {
    return {
        id: "snapshot-1",
        fileName: "实力表20260904.xlsx",
        label: "2026-09-04",
        sheetName: "人员信息",
        totalDataRows: 10,
        excludedRows: 0,
        unclassifiedOperationalRows: 0,
        metrics: {
            operationalTotal: 10,
            instructor: 3,
            captain: 3,
            firstOfficer: 4,
            northAmericaLeader: 2,
            europeLeader: 1
        },
        ...overrides
    };
}

describe("crew strength report logic", () => {
    it("finds headers by name, keeps only running people and classifies the three technical groups", () => {
        const result = analyzeStrengthRows([
            ["南货航飞行实力表"],
            [" 姓名 ", "REUO", "是否运行", "技术信息", "RAMA"],
            ["甲", "", "是", "777:飞行教员B", 1],
            ["乙", 1, "是", "777:C类机长", ""],
            ["丙", "", "是", "777:A2类副驾驶", ""],
            ["丁", 1, "否", "777:C类机长", 1],
            ["戊", "", "", "777:飞行教员C", 1],
            ["己", 0, " 是 ", "777:B类副驾驶", 0],
            ["庚", "", "是", "待定", ""]
        ], {
            id: "sample",
            fileName: "实力表20260904.xlsx",
            sheetName: "人员信息"
        });

        expect(result.label).toBe("2026-09-04");
        expect(result.totalDataRows).toBe(7);
        expect(result.excludedRows).toBe(2);
        expect(result.unclassifiedOperationalRows).toBe(1);
        expect(result.metrics).toEqual({
            operationalTotal: 5,
            instructor: 1,
            captain: 1,
            firstOfficer: 2,
            northAmericaLeader: 1,
            europeLeader: 1
        });
    });

    it("rejects a worksheet that does not contain all required headers", () => {
        expect(() => analyzeStrengthRows([
            ["姓名", "技术信息", "是否运行", "RAMA"]
        ], {
            id: "missing",
            fileName: "missing.xlsx",
            sheetName: "Sheet1"
        })).toThrow(/REUO/);
    });

    it("builds a date label from the file name and otherwise keeps the base name", () => {
        expect(buildSnapshotLabel("南货航飞行实力表20260912.xlsx")).toBe("2026-09-12");
        expect(buildSnapshotLabel("实力周报.xlsx")).toBe("实力周报");
        expect(buildSnapshotLabel("实力表20261340.xlsx")).toBe("实力表20261340");
    });

    it("defaults to changed metrics for multiple snapshots and all metrics for one snapshot", () => {
        const first = snapshot();
        const second = snapshot({
            id: "snapshot-2",
            label: "2026-09-12",
            metrics: {
                operationalTotal: 11,
                instructor: 3,
                captain: 4,
                firstOfficer: 4,
                northAmericaLeader: 2,
                europeLeader: 2
            }
        });

        expect(getChangedMetricKeys([first, second])).toEqual([
            "operationalTotal",
            "captain",
            "europeLeader"
        ]);
        expect(getDefaultSelectedMetricKeys([first, second])).toEqual([
            "operationalTotal",
            "captain",
            "europeLeader"
        ]);
        expect(getDefaultSelectedMetricKeys([first])).toEqual(
            METRIC_DEFINITIONS.map((item) => item.key)
        );
    });

    it("moves snapshots without mutating the source order", () => {
        const items = [snapshot({ id: "a" }), snapshot({ id: "b" }), snapshot({ id: "c" })];

        expect(moveSnapshotByIndex(items, 0, 2).map((item) => item.id)).toEqual(["b", "c", "a"]);
        expect(items.map((item) => item.id)).toEqual(["a", "b", "c"]);
        expect(moveSnapshotByIndex(items, 2, 0).map((item) => item.id)).toEqual(["c", "a", "b"]);
    });
});
