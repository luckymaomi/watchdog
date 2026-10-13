import * as XLSX from "xlsx-js-style";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { TrainingToolScanner as Scanner } from "../../../src/tool/app/training-workbench/scripts/scanner";
import { TrainingToolWorkbench as Workbench } from "../../../src/tool/app/training-workbench/scripts/workbench";
import { TrainingToolWorkbenchExport as Export } from "../../../src/tool/app/training-workbench/scripts/workbench-export";
import { TrainingToolScheduleGapCheck as Gaps } from "../../../src/tool/app/training-workbench/scripts/schedule-gap-check";
import { TrainingToolQualificationPressure as Pressure } from "../../../src/tool/app/training-workbench/scripts/qualification-pressure";
import { TrainingToolUtils as Utils } from "../../../src/tool/app/training-workbench/scripts/utils";

const date = (value: string): Date => Utils.parseDate(value)!;

function workbook() {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ["员工号", "姓名", "TSA"],
    ["1", "历史专用人员", date("2027-05-31")],
    ["2", "逾期安排", date("2027-05-31")],
    ["3", "有效安排", date("2027-05-31")],
    ["4", "推荐人员", date("2027-07-31")],
    ["5", "过期人员", date("2026-09-30")],
    ["6", "暂不需排人员", date("2027-12-31")],
    ["7", "异常人员", "待确认"],
    ["8", "未录入的无效安排", date("2027-05-31")],
    ["9", "无记录人员", date("2027-05-31")],
    ["10", "取消安排", date("2027-05-31")],
    ["11", "矛盾记录", date("2027-05-31")]
  ], { cellDates: true }), "人员信息表");
  const record = (id: string, name: string, entered: string, day: string, remark = "") =>
    [id, name, "TSA", entered, date(day), date(day), "", remark];
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ["员工号", "姓名", "项目名称", "培训信息是否录入", "培训开始日期", "培训结束日期", "有效期", "备注"],
    record("1", "历史专用人员", "是", "2026-05-12"),
    record("1", "历史专用人员", "是", "2025-05-12"),
    record("2", "逾期安排", "是", "2026-05-12"),
    record("2", "逾期安排", "否", "2027-06-01"),
    record("3", "有效安排", "是", "2026-05-12"),
    record("3", "有效安排", "否", "2026-11-15"),
    record("4", "推荐人员", "是", "2026-07-12"),
    record("5", "过期人员", "是", "2025-09-12"),
    record("8", "未录入的无效安排", "否", "2026-05-12"),
    record("10", "取消安排", "否", "2026-11-15", "取消"),
    record("11", "矛盾记录", "是", "2026-11-15", "取消"),
    record("11", "矛盾记录", "否", "2026-12-15")
  ], { cellDates: true }), "TSA");
  return book;
}

function assess() {
  return Workbench.buildWorkbench(Scanner.analyzeWorkbook(workbook()), {
    today: date("2026-10-13"), stageEnd: date("2027-05-31")
  });
}

describe("training scheduling status partition", () => {
  beforeAll(() => vi.stubGlobal("XLSX", XLSX));

  it("keeps historical training separate from next-cycle must, recommended, and overdue needs", () => {
    const result = assess();
    const rows = new Map(result.allDetailRows.map(row => [row.employeeId, row]));
    expect(rows.get("1")).toMatchObject({ status: "必须排", scheduledDate: "", historyDate: "2026-05-12", scheduleNotice: "" });
    expect(rows.get("4")).toMatchObject({ status: "推荐排", scheduledDate: "", historyDate: "2026-07-12", scheduleNotice: "" });
    expect(rows.get("5")).toMatchObject({ status: "已过期", scheduledDate: "", historyDate: "2025-09-12", scheduleNotice: "" });
    expect(rows.get("1")?.status).toBe(rows.get("9")?.status);
    const future = Workbench.buildWorkbench(Scanner.analyzeWorkbook(workbook()), {
      today: date("2027-05-01"), stageEnd: date("2027-05-31")
    });
    expect(future.allDetailRows.find(row => row.employeeId === "1")).toMatchObject({ status: "必须排", scheduledDate: "", historyDate: "2026-05-12" });
  });

  it("preserves urgency for ineffective plans and only marks covering plans as scheduled", () => {
    const rows = new Map(assess().allDetailRows.map(row => [row.employeeId, row]));
    expect(rows.get("2")).toMatchObject({ status: "必须排", scheduledDate: "2027-06-01", scheduleNotice: "已排未覆盖", historyDate: "2026-05-12" });
    expect(rows.get("3")).toMatchObject({ status: "已排", scheduledDate: "2026-11-15", scheduleNotice: "", historyDate: "2026-05-12" });
    expect(rows.get("8")).toMatchObject({ status: "必须排", scheduledDate: "2026-05-12", scheduleNotice: "已排未覆盖", historyDate: "" });
    expect(rows.get("10")).toMatchObject({ status: "必须排", scheduledDate: "", scheduleNotice: "" });
    expect(rows.get("11")?.status).toBe("异常");
  });

  it("counts all six exclusive classes while default details focus on pending and abnormal rows", () => {
    const result = assess();
    const expected = { "已过期": 1, "必须排": 5, "推荐排": 1, "异常": 2, "已排": 1, "暂不需排": 1 };
    expect(Object.fromEntries(result.statsCards.map(card => [card.label, card.value]))).toEqual(expected);
    expect(result.statsCards.reduce((total, card) => total + card.value, 0)).toBe(result.allDetailRows.length);
    expect(Object.fromEntries(result.chartData.statusRows.map(row => [row.name, row.value]))).toEqual(expected);
    expect(result.summaryData.projectSummaryRows[0].total).toBe(11);
    expect(Object.values(result.summaryData.projectSummaryRows[0].rowsByStatus).flat()).toHaveLength(11);
    expect(result.detailRows).toHaveLength(9);
    expect(new Set(result.allDetailRows.map(row => `${row.employeeId}/${row.projectName}`)).size).toBe(11);
    const scheduled = Workbench.viewFromRows(result, { statuses: ["已排"] });
    expect(scheduled.detailRows.map(row => row.employeeId)).toEqual(["3"]);
    expect(scheduled.summaryData.projectSummaryRows[0].total).toBe(1);
    const inactive = Workbench.viewFromRows(result, { statuses: ["暂不需排"] });
    expect(inactive.detailRows.map(row => row.employeeId)).toEqual(["6"]);
    const filtered = Workbench.viewFromRows(result, { projects: ["TSA"], months: ["2027-05"], searchText: "历史专用人员" });
    expect(filtered.statsCards.reduce((n, card) => n + card.value, 0)).toBe(1);
    expect(filtered.detailRows[0].employeeId).toBe("1");
    const all = Workbench.viewFromRows(result, { statuses: result.filterOptions.statuses });
    expect(all.detailRows).toHaveLength(11);
    expect(all.statsCards.reduce((total, card) => total + card.value, 0)).toBe(11);
    expect(result.chartData.projectRows.reduce((total, row) => total + row.expired + row.must + row.recommended + row.abnormal + row.scheduled + row.notNeeded, 0)).toBe(11);
  });

  it("keeps recommended and overdue classes when new schedules miss the deadline", () => {
    const book = workbook();
    const data = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets.TSA, { header: 1 });
    data.push(["4", "推荐人员", "TSA", "否", date("2027-08-01"), date("2027-08-01"), "", ""]);
    data.push(["5", "过期人员", "TSA", "否", date("2026-10-15"), date("2026-10-15"), "", ""]);
    book.Sheets.TSA = XLSX.utils.aoa_to_sheet(data, { cellDates: true });
    const result = Workbench.buildWorkbench(Scanner.analyzeWorkbook(book), { today: date("2026-10-13"), stageEnd: date("2027-05-31") });
    expect(result.allDetailRows.find(row => row.employeeId === "4")).toMatchObject({ status: "推荐排", scheduleNotice: "已排未覆盖", scheduledDate: "2027-08-01" });
    expect(result.allDetailRows.find(row => row.employeeId === "5")).toMatchObject({ status: "已过期", scheduleNotice: "已排未覆盖", scheduledDate: "2026-10-15" });
    expect(result.statsCards.reduce((total, card) => total + card.value, 0)).toBe(11);
  });

  it("shares history and ineffective-plan semantics with gap checks and pressure forecasts", () => {
    const analysis = Scanner.analyzeWorkbook(workbook());
    const gaps = Gaps.build(analysis, { baseDate: "2027-05-01", horizonDays: 30 });
    expect(gaps.rows.find(row => row.employeeId === "1")).toMatchObject({ attentionLabel: "未安排", scheduledDate: "" });
    expect(gaps.rows.find(row => row.employeeId === "2")).toMatchObject({ workbenchStatus: "必须排", attentionLabel: "已排未覆盖", scheduledDate: "2027-06-01" });
    expect(gaps.rows.some(row => row.employeeId === "3")).toBe(false);
    const pressure = Pressure.buildPressure(analysis, { startMonth: "2026-10", projectName: "TSA" });
    expect(pressure.items.find(row => row.employeeId === "1")).toMatchObject({ coverageStatus: "未安排", scheduledDate: "", forecastExpiry: "2027-05-31" });
    expect(pressure.items.find(row => row.employeeId === "2")).toMatchObject({ coverageStatus: "晚于截止日", scheduledDate: "2027-06-01", forecastExpiry: "2027-05-31" });
    expect(pressure.items.find(row => row.employeeId === "3")).toMatchObject({ coverageStatus: "已覆盖", forecastExpiry: "2027-11-30" });
  });

  it("exports primary classes, supplemental notices and history dates in both workbooks", () => {
    const view = Workbench.viewFromRows(assess(), { statuses: ["必须排"], searchText: "逾期安排" });
    const exported = Export.buildWorkbook(view);
    const records = XLSX.utils.sheet_to_json(exported.Sheets[exported.SheetNames[0]]);
    expect(records[0]).toMatchObject({ "状态": "必须排", "补充提示": "已排未覆盖", "已排日期": "2027-06-01", "历史培训日期": "2026-05-12" });
    const selected = Export.buildSelectionWorkbook({ projectName: "TSA", status: "必须排", rows: view.detailRows });
    expect(XLSX.utils.sheet_to_json(selected.Sheets[selected.SheetNames[0]])[0]).toMatchObject({ "状态": "必须排", "补充提示": "已排未覆盖", "历史培训日期": "2026-05-12" });
  });

  it("recognizes absorbed historical renewals for window and base-month projects", () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
      ["员工号", "姓名", "危险品", "应急训练"],
      ["20", "窗口历史", date("2028-05-31"), date("2028-06-30")]
    ], { cellDates: true }), "人员信息表");
    for (const name of ["危险品", "应急训练"]) {
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
        ["员工号", "姓名", "项目名称", "培训信息是否录入", "培训开始日期", "培训结束日期"],
        ["20", "窗口历史", name, "是", date("2026-05-31"), date("2026-05-31")]
      ], { cellDates: true }), name);
    }
    const result = Workbench.buildWorkbench(Scanner.analyzeWorkbook(book), { today: date("2028-05-01"), stageEnd: date("2028-06-30") });
    expect(result.allDetailRows).toHaveLength(2);
    for (const row of result.allDetailRows) expect(row).toMatchObject({ status: "必须排", scheduledDate: "", historyDate: "2026-05-31", scheduleNotice: "" });
  });
});
