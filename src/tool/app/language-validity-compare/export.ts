import type * as XLSX from "xlsx-js-style";
import type { LanguageComparisonResult } from "./models";

type WorkbookApi = typeof XLSX;

export function buildLanguageExportWorkbook(XLSXApi: WorkbookApi, result: LanguageComparisonResult): XLSX.WorkBook {
  const workbook = XLSXApi.utils.book_new();
  const summaryRows = [
    ["语言", "人员信息人数", "局方人数", "姓名匹配人数", "双方一致/均无有效期", "日期不一致", "需关注"],
    ...result.summaries.map((summary) => [summary.language, summary.personnelPeople, summary.caacPeople, summary.matchedPeople, summary.sameCount, summary.dateDifferenceCount, summary.attentionCount])
  ];
  const detailRows = [
    ["姓名", "语言", "状态", "员工号", "飞行员ID", "人员信息原值", "局方备注提取值", "人员信息日期", "局方日期", "人员信息来源", "局方来源"],
    ...result.details.map((detail) => [detail.name, detail.language, detail.status, detail.employeeId, detail.pilotId, detail.personnelValue, detail.caacValue, detail.personnelDate, detail.caacDate, detail.personnelSource, detail.caacSource])
  ];
  const issueRows = [
    ["来源", "问题类型", "语言", "姓名", "编号", "说明", "工作表", "行号"],
    ...result.issues.map((item) => [item.source === "personnel" ? "人员信息" : "局方数据", item.kind, item.language || "", item.name || "", item.identifier || "", item.message, item.sheetName, item.rowNumber || ""])
  ];
  const sheets: Array<[string, unknown[][], number]> = [["语言汇总", summaryRows, 7], ["比对明细", detailRows, 11], ["数据问题", issueRows, 8]];
  for (const [name, rows, width] of sheets) {
    const sheet = XLSXApi.utils.aoa_to_sheet(rows);
    sheet["!autofilter"] = { ref: `A1:${String.fromCharCode(64 + width)}${Math.max(1, rows.length)}` };
    sheet["!freeze"] = { ySplit: 1 } as never;
    sheet["!cols"] = Array.from({ length: width }, (_, index) => ({ wch: index === 5 ? 30 : index < 3 ? 16 : 18 }));
    XLSXApi.utils.book_append_sheet(workbook, sheet, name);
  }
  return workbook;
}
