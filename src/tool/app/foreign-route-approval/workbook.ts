import type { WorkBook, WorkSheet } from "xlsx-js-style";
import { SHEETS, type AirportCatalog, type ParsedSource, type SourceKind, type WorkbookApi } from "./models";

function text(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) throw new Error("文本字段出现日期单元格，请将源表改为文本。");
  return String(value).trim();
}
const key = (value: unknown): string => text(value).replace(/\s+/g, "");

export function readApprovals(api: WorkbookApi, sheet: WorkSheet, source: string, kind: SourceKind): ParsedSource {
  const result: ParsedSource = { rows: [], issues: [] };
  const error = (message: string, sourceRow?: number): void => { result.issues.push({ severity: "error", source, sourceRow, message }); };
  const grid = api.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "", blankrows: true, range: 0 });
  let columns = [0, 1, 2, 3, 4, 5, 6];
  let start = 0;
  let headerFound = false;
  try {
    for (let r = 0; r < Math.min(grid.length, 20); r++) {
      const names = grid[r].map(key);
      if (!names.includes("公司") || !names.includes("去程")) continue;
      headerFound = true;
      const stations = names.flatMap((name, i) => name === "航站" ? [i] : []);
      columns = [names.indexOf("序号"), names.indexOf("公司"), names.indexOf("航站A"), names.indexOf("航站B"), names.indexOf("去程"), names.indexOf("回程"), names.indexOf("是否有台湾地区飞行员")];
      if (columns[2] < 0) columns[2] = stations[0] ?? -1;
      if (columns[3] < 0) columns[3] = stations[1] ?? -1;
      if (columns.slice(1).some(i => i < 0)) { error("表头缺少公司、两列航站、去程、回程或台湾飞行员字段。", r + 1); return result; }
      start = r + 1;
      break;
    }
    if (!headerFound && kind === "open") { error("开放部分未找到完整表头。请选择正确工作表。"); return result; }
    for (let r = start; r < grid.length; r++) {
      const raw = grid[r];
      if (raw.every(v => v == null || v === "")) continue;
      // 无表头临开只允许单个单元格的标题行；含其他字段的坏行必须报告。
      if (!headerFound && raw.filter(v => text(v)).length === 1 && /批复|临开|临时|航季/.test(text(raw[0]))) continue;
      const values = columns.map(c => c < 0 ? "" : text(raw[c]));
      if (values[1] === "公司" && values[4] === "去程") continue;
      const badCell = columns.some(c => c >= 0 && sheet[api.utils.encode_cell({ r, c })]?.t === "e");
      if (badCell) error("存在 Excel 错误单元格，请修正后重新上传。", r + 1);
      const [, company, stationA, stationB, go, back, tw] = values;
      if (!company || !stationA || !stationB || !go) error("公司、航站A、航站B、去程不能为空。", r + 1);
      result.rows.push({ company, stationA, stationB, go, back, tw: tw || "否", source, sourceRow: r + 1 });
    }
  } catch (e) { error(e instanceof Error ? e.message : String(e)); }
  if (!result.rows.length) error("没有可处理的数据行。请选择正确工作表。");
  return result;
}

export function readAirportCatalog(api: WorkbookApi, workbook: WorkBook): AirportCatalog {
  for (const name of SHEETS) if (!workbook.Sheets[name]) throw new Error(`模板缺少工作表：${name}`);
  const rows = api.utils.sheet_to_json<unknown[]>(workbook.Sheets[SHEETS[3]], { header: 1, raw: true, defval: "" });
  const ports = new Map<string, string>();
  const numbered = new Map<string, { name: string; number: number }[]>();
  for (const row of rows.slice(1)) {
    const name = text(row[0]);
    const code = text(row[1]);
    if (!name || !code) continue;
    ports.set(name, code);
    const match = /^(.+?)(\d+)$/.exec(name);
    if (match) {
      const group = numbered.get(match[1]) ?? [];
      group.push({ name, number: Number(match[2]) });
      numbered.set(match[1], group);
    }
  }
  if (!ports.size) throw new Error("模板机场列表为空。");
  const multi = new Map([...numbered].map(([base, items]) => [base, items.sort((a, b) => a.number - b.number).map(item => item.name)]));
  return { ports, multi };
}
