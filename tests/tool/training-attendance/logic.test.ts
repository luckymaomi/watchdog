import { describe, expect, it } from "vitest";

import type { CrewRosterEntry } from "../../../src/tool/app/crew-match-name-id/models";
import { TrainingAttendanceLogic as logic } from "../../../src/tool/app/training-attendance/programs/crm/logic";

const roster: CrewRosterEntry[] = [
  { id: "100001", name: "张三", department: "一分部", techInfo: "777:C类机长", techLevel: "C" },
  { id: "100002", name: "李四", department: "二分部", techInfo: "777:A2类副驾驶", techLevel: "A2" },
  { id: "100003", name: "王五", department: "三分部", techInfo: "777:飞行教员B", techLevel: "B" }
];

describe("training attendance logic", () => {
  it("matches names in pasted order and reduces technical info to two ranks", () => {
    const draft = logic.buildTrainingAttendanceDraft(roster, {
      sourceText: "本期人员：李四、王五、张三。",
      session: "12",
      startDate: "2026-10-20",
      endDate: "2026-10-21",
      instructor1: "教员甲",
      instructor2: "教员乙",
      instructor3: "教员丙"
    });

    expect(draft.sessionLabel).toBe("第12期");
    expect(draft.startDate).toBe("2026/10/20");
    expect(draft.endDate).toBe("2026/10/21");
    expect(draft.participants.map((person) => [person.name, person.employeeId, person.rank])).toEqual([
      ["李四", "100002", "副驾驶"],
      ["王五", "100003", "机长"],
      ["张三", "100001", "机长"]
    ]);
    expect(logic.canExportTrainingAttendance(draft)).toBe(true);
  });

  it("blocks export when required fields or rank classification are invalid", () => {
    const draft = logic.buildTrainingAttendanceDraft([
      ...roster,
      { id: "100004", name: "赵六", department: "", techInfo: "777:学员", techLevel: "" }
    ], {
      sourceText: "赵六",
      session: "",
      startDate: "2026-10-22",
      endDate: "2026-10-21",
      instructor1: "",
      instructor2: "",
      instructor3: ""
    });

    expect(logic.canExportTrainingAttendance(draft)).toBe(false);
    expect(draft.issues.map((item) => item.id)).toEqual(expect.arrayContaining([
      "missing-session",
      "date-order",
      "missing-instructor-1",
      "missing-instructor-2",
      "missing-instructor-3",
      "unknown-rank"
    ]));
  });
});
