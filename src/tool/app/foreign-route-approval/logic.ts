import type { Analysis, AirportCatalog, ExportOptions, ParsedSource } from "./models";

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

export function analyzeApprovals(opened: ParsedSource, temporary: ParsedSource, catalog: AirportCatalog): Analysis {
  const merged = [...opened.rows, ...temporary.rows];
  const result: Analysis = { merged, go: [], back: [], issues: [...opened.issues, ...temporary.issues], openCount: opened.rows.length, temporaryCount: temporary.rows.length, skippedBack: 0, multiCount: 0 };
  for (const row of merged) {
    const left = catalog.multi.get(row.stationA) ?? [row.stationA];
    const right = catalog.multi.get(row.stationB) ?? [row.stationB];
    const multi = catalog.multi.has(row.stationA) || catalog.multi.has(row.stationB);
    if (multi) result.multiCount++;
    for (const name of new Set([...left, ...right])) {
      if (!catalog.ports.has(name)) result.issues.push({ severity: "warning", message: `机场列表未收录“${name}”，VLOOKUP 将返回 #N/A；保留源值，请核对源表航站。`, source: row.source, sourceRow: row.sourceRow });
    }
    if (!row.back) result.skippedBack++;
    for (const a of left) for (const b of right) {
      const shared = { company: row.company, tw: row.tw, multi, source: row.source, sourceRow: row.sourceRow };
      result.go.push({ ...shared, left: a, right: b, code: row.go });
      if (row.back) result.back.push({ ...shared, left: b, right: a, code: row.back });
    }
  }
  if (!merged.length) result.issues.push({ severity: "error", message: "两份源表均无数据。", source: "输入" });
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
