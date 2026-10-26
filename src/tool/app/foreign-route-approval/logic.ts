import type { AirlineOption, Analysis, AirportCatalog, ExportOptions, ParsedSource } from "./models";

export const normalizeAirline = (code: string): string => code.trim().toUpperCase();

function sourceCompanies(source: ParsedSource): string[] {
  const rows = new Set(source.rows.map(row => row.sourceRow));
  const failed = new Map<number, string>();
  for (const issue of source.issues) if (issue.sourceRow && !rows.has(issue.sourceRow)) failed.set(issue.sourceRow, issue.company ?? "");
  return [...source.rows.map(row => row.company), ...failed.values()];
}

export function listAirlines(opened: ParsedSource, temporary: ParsedSource): AirlineOption[] {
  const counts = new Map<string, AirlineOption>([["CSG", { code: "CSG", openCount: 0, temporaryCount: 0 }]]);
  for (const [source, field] of [[opened, "openCount"], [temporary, "temporaryCount"]] as const) {
    for (const value of sourceCompanies(source)) {
      const code = normalizeAirline(value);
      if (!code) continue;
      const item = counts.get(code) ?? { code, openCount: 0, temporaryCount: 0 };
      item[field]++;
      counts.set(code, item);
    }
  }
  return [...counts.values()].sort((a, b) => a.code === "CSG" ? -1 : b.code === "CSG" ? 1 : a.code.localeCompare(b.code));
}

export function validateDates(effective: string, expiry: string): string[] {
  const valid = (value: string): boolean => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return y >= 1900 && y <= 9999 && date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  };
  if (!valid(effective) || !valid(expiry)) return ["请填写有效的生效、失效日期（YYYY-MM-DD）。"];
  return effective > expiry ? ["失效日期不能早于生效日期。"] : [];
}

export function analyzeApprovals(opened: ParsedSource, temporary: ParsedSource, catalog: AirportCatalog, airlines: readonly string[] = ["CSG"]): Analysis {
  const selected = new Set(airlines.map(normalizeAirline).filter(Boolean));
  const openRows = opened.rows.filter(row => selected.has(normalizeAirline(row.company)));
  const tempRows = temporary.rows.filter(row => selected.has(normalizeAirline(row.company)));
  const merged = [...openRows, ...tempRows];
  const issues = [...opened.issues, ...temporary.issues].filter(issue => !issue.company || selected.has(normalizeAirline(issue.company)));
  const rawOpenCount = sourceCompanies(opened).length;
  const rawTemporaryCount = sourceCompanies(temporary).length;
  const includedCount = [...sourceCompanies(opened), ...sourceCompanies(temporary)].filter(code => !code || selected.has(normalizeAirline(code))).length;
  const result: Analysis = { merged, go: [], back: [], issues, openCount: openRows.length, temporaryCount: tempRows.length, rawOpenCount, rawTemporaryCount, excludedCount: rawOpenCount + rawTemporaryCount - includedCount, airlines: [...selected], skippedGo: 0, skippedBack: 0, multiCount: 0 };
  if (!selected.size) result.issues.push({ severity: "error", message: "请至少选择一个航司后运行。", source: "航司筛选" });
  for (const row of merged) {
    const left = catalog.multi.get(row.stationA) ?? [row.stationA];
    const right = catalog.multi.get(row.stationB) ?? [row.stationB];
    const multi = catalog.multi.has(row.stationA) || catalog.multi.has(row.stationB);
    if (multi) result.multiCount++;
    for (const name of new Set([...left, ...right])) {
      if (!catalog.ports.has(name)) result.issues.push({ severity: "warning", message: `机场列表未收录“${name}”，VLOOKUP 将返回 #N/A；保留源值，请核对源表航站。`, source: row.source, sourceRow: row.sourceRow });
    }
    if (!row.go) result.skippedGo++;
    if (!row.back) result.skippedBack++;
    if (!row.go && !row.back) result.issues.push({ severity: "warning", message: "去程、回程均为空，仅保留合并原记录，不生成录入航段。", source: row.source, sourceRow: row.sourceRow });
    for (const a of left) for (const b of right) {
      const shared = { company: row.company, tw: row.tw, multi, source: row.source, sourceRow: row.sourceRow };
      if (row.go) result.go.push({ ...shared, left: a, right: b, code: row.go });
      if (row.back) result.back.push({ ...shared, left: b, right: a, code: row.back });
    }
  }
  if (selected.size && !merged.length) result.issues.push({ severity: "error", message: `所选航司 ${[...selected].join("、")} 在两份源表中没有可处理记录，请核对航司范围。`, source: "航司筛选" });
  return result;
}

export function inferSeason(...names: string[]): string {
  for (const name of names) {
    const match = /(20\d{2})\s*(夏秋|冬春)/.exec(name);
    if (match) return match[1] + match[2];
  }
  return "";
}

export function outputFilename(options: ExportOptions): string {
  const season = options.season.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
  return `${season}外籍带飞开放临开合并（由皮燕子合并去程回程生效${options.effective}至${options.expiry}）.xlsx`;
}
