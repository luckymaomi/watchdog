import { describe, expect, it } from "vitest";

import { MedicalExamLogic as logic } from "../../../src/tool/app/medical-exam-scheduler/logic";

const rosterRows = [
  ["姓名", "技术信息", "员工号", "REUO", "RAMA", "分部"],
  ["甲", "777:D类机长", 100001, "", 1, "一分部"],
  ["乙", "777:副驾驶", 100002, "", "", "二分部"],
  ["丙", "777:飞行教员B", 100003, "", "1", "三分部"]
];

const candidateRows = [
  ["员工号", "姓名", "体检日", "备注"],
  [100001, "甲", "", ""],
  [100002, "乙", "", ""],
  [100003, "丙", "", ""]
];

const quotaRows = [
  ["2026年11月日期", "2026年11月额度", "2026年12月日期", "2026年12月额度"],
  [new Date(2026, 10, 2), 2, new Date(2026, 11, 2), 0],
  [new Date(2026, 10, 3), 2, new Date(2026, 11, 3), 0]
];

describe("medical exam scheduler logic", () => {
  it("normalizes SheetJS end-of-day date objects to the displayed business date", () => {
    expect(logic.parseBusinessDate(new Date(2026, 10, 1, 23, 59, 17))).toBe("2026-11-02");
    expect(logic.parseBusinessDate(new Date(2026, 10, 2, 12))).toBe("2026-11-02");
    expect(logic.parseBusinessDate(46328)).toBe("2026-11-02");
    expect(logic.parseBusinessDate("20261102")).toBe("2026-11-02");
    expect(logic.parseBusinessDate("2026/11/2")).toBe("2026-11-02");
    expect(logic.parseBusinessDate("2026-11-2")).toBe("2026-11-02");
    expect(logic.parseBusinessDate("2026.11.2")).toBe("2026-11-02");
    expect(logic.parseBusinessDate("11/2/26")).toBe("");
  });

  it("finds RAMA by header and recognizes only value 1", () => {
    const roster = logic.parseRosterSheets([{ name: "任意表", rows: rosterRows }]);

    expect(roster.people.map((person) => [person.employeeId, person.isNorthAmericaLeader])).toEqual([
      ["100001", true],
      ["100002", false],
      ["100003", true]
    ]);
    expect(roster.headerRowIndex).toBe(0);
  });

  it("binds a monthly candidate sheet to the same quota month", () => {
    expect(logic.candidateMonthKey("2026.11")).toBe("2026-11");
    expect(logic.candidateMonthKey("2026.10名单")).toBe("");
  });

  it("parses only annual quota sheets and monthly four-column candidate sheets", () => {
    const imported = logic.parseMedicalSheets([
      { name: "填写说明", rows: [["说明"], ["不参与解析"]] },
      { name: "可用日期2026", rows: quotaRows },
      { name: "2026.11", rows: candidateRows },
      { name: "旧格式名单", rows: candidateRows }
    ]);

    expect(imported.candidateSheets).toHaveLength(1);
    expect(imported.candidateSheets[0].people).toHaveLength(3);
    expect(imported.slots.map((slot) => [slot.date, slot.capacity])).toEqual([
      ["2026-11-02", 2],
      ["2026-11-03", 2]
    ]);
    expect(imported.quotaMonths.map((month) => [month.key, month.totalCapacity])).toEqual([
      ["2026-11", 4],
      ["2026-12", 0]
    ]);
  });

  it("leaves north America leaders unassigned and allocates only other people", () => {
    const roster = logic.parseRosterSheets([{ name: "花名册", rows: rosterRows }]);
    const imported = logic.parseMedicalSheets([
      { name: "可用日期2026", rows: quotaRows },
      { name: "2026.11", rows: candidateRows }
    ]);
    const people = logic.enrichPeople(imported.candidateSheets[0].people, roster.people);
    const result = logic.allocatePeople(people, imported.slots, () => 0.5);

    const leaders = result.people.filter((person) => person.isNorthAmericaLeader);
    expect(leaders.every((person) => !person.examDate)).toBe(true);
    expect(result.people.find((person) => person.employeeId === "100002")?.examDate).toBe("2026-11-02");
    expect(result.dailyLoads.map((load) => [load.date, load.assigned, load.remaining, load.protectedRemaining])).toEqual([
      ["2026-11-02", 1, 1, 0],
      ["2026-11-03", 0, 2, 0]
    ]);
  });

  it("fills every unassigned non-leader in one action without changing existing dates", () => {
    const roster = logic.parseRosterSheets([{ name: "花名册", rows: rosterRows }]);
    const imported = logic.parseMedicalSheets([
      { name: "可用日期2026", rows: quotaRows },
      {
        name: "2026.11",
        rows: [
          ["员工号", "姓名", "体检日", "备注"],
          [100001, "甲", "2026-11-03", ""],
          [100002, "乙", "", ""],
          [100003, "丙", "", ""]
        ]
      }
    ]);
    const people = logic.enrichPeople(imported.candidateSheets[0].people, roster.people);
    const result = logic.allocatePeople(people, imported.slots, () => 0.5);

    expect(result.people.find((person) => person.employeeId === "100001")?.examDate).toBe("2026-11-03");
    expect(result.people.find((person) => person.employeeId === "100002")?.examDate).toBe("2026-11-02");
    expect(result.people.find((person) => person.employeeId === "100003")?.examDate).toBe("");
    expect(result.pendingEmployeeIds).toEqual([]);
  });

  it("treats a filled exam date as scheduled and warns unassigned leaders from the next available date", () => {
    const base = new Date(2026, 9, 1, 12);

    expect(logic.getWarning("2026-11-02", "2026-10-11", base).level).toBe("scheduled");
    expect(logic.getWarning("", "2026-11-10", base).level).toBe("none");
    expect(logic.getWarning("", "2026-10-31", base).level).toBe("notice30");
    expect(logic.getWarning("", "2026-10-16", base).level).toBe("warning15");
    expect(logic.getWarning("", "2026-10-11", base).level).toBe("urgent10");
    expect(logic.getWarning("", "", base).level).toBe("unassigned");
  });

  it("builds a copyable summary for every leader and remaining quota", () => {
    const roster = logic.parseRosterSheets([{ name: "花名册", rows: rosterRows }]);
    const imported = logic.parseMedicalSheets([
      { name: "可用日期2026", rows: quotaRows },
      { name: "2026.11", rows: candidateRows }
    ]);
    const people = logic.enrichPeople(imported.candidateSheets[0].people, roster.people);
    people.find((person) => person.employeeId === "100001")!.examDate = "2026-11-02";
    people.find((person) => person.employeeId === "100002")!.examDate = "2026-11-02";

    expect(logic.buildLeaderCopyText(people, imported.slots)).toBe(
      "北美带队安排情况：甲（100001）已安排2026年11月2日、丙（100003）未安排。当前有空余的体检日：2026年11月3日剩余2个名额。"
    );
    expect(logic.buildLeaderCopyText(people, imported.slots.map((slot) => ({ ...slot, capacity: 0 })))).toBe(
      "北美带队安排情况：甲（100001）已安排2026年11月2日、丙（100003）未安排。当前没有剩余额度的体检日。"
    );

    const fullPeople = people.map((person) => ({ ...person }));
    fullPeople.find((person) => person.employeeId === "100003")!.examDate = "2026-11-03";
    expect(logic.buildLeaderCopyText(fullPeople, imported.slots)).toBe(
      "北美带队安排情况：甲（100001）已安排2026年11月2日、丙（100003）已安排2026年11月3日。当前有空余的体检日：2026年11月3日剩余1个名额。"
    );
  });

  it("reports unmatched roster people and over-capacity dates in health checks", () => {
    const roster = logic.parseRosterSheets([{ name: "花名册", rows: rosterRows }]);
    const imported = logic.parseMedicalSheets([
      { name: "可用日期2026", rows: [["2026年11月日期", "2026年11月额度"], [new Date(2026, 10, 2), 1]] },
      {
        name: "2026.11",
        rows: [
          ["员工号", "姓名", "体检日", "备注"],
          [100001, "甲", "2026-11-02", ""],
          [999999, "未匹配", "2026-11-02", ""]
        ]
      }
    ]);
    const people = logic.enrichPeople(imported.candidateSheets[0].people, roster.people);
    const health = logic.buildHealthReport(roster, imported, imported.candidateSheets[0], people);

    expect(health.some((item) => item.severity === "warning" && item.message.includes("999999"))).toBe(true);
    expect(health.some((item) => item.severity === "error" && item.message.includes("超过额度"))).toBe(true);
    expect(health.some((item) => item.severity === "info" && item.message.includes("每日 2 个名额"))).toBe(true);
  });

  it("moves selected people without exceeding target capacity", () => {
    const roster = logic.parseRosterSheets([{ name: "花名册", rows: rosterRows }]);
    const imported = logic.parseMedicalSheets([
      { name: "可用日期2026", rows: quotaRows },
      { name: "2026.11", rows: candidateRows }
    ]);
    const people = logic.allocatePeople(
      logic.enrichPeople(imported.candidateSheets[0].people, roster.people),
      imported.slots,
      () => 0.5
    ).people;

    expect(() => logic.movePeople(people, ["100001", "100003"], "2026-11-02", imported.slots)).toThrow("额度不足");
    const moved = logic.movePeople(people, ["100001"], "2026-11-03", imported.slots);
    expect(moved.find((person) => person.employeeId === "100001")?.examDate).toBe("2026-11-03");
    expect(moved.find((person) => person.employeeId === "100001")?.adjustmentNotes).toContain("移动：待分配 → 2026-11-03");

    const pending = logic.unassignPeople(moved, ["100001"]);
    expect(pending.find((person) => person.employeeId === "100001")?.examDate).toBe("");
    const notes = pending.find((person) => person.employeeId === "100001")?.adjustmentNotes || [];
    expect(notes[notes.length - 1]).toContain("待分配");
  });
});
