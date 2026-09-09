import type * as XLSX from "xlsx-js-style";
import type {
  CaacRecord,
  Language,
  LanguageIssue,
  LanguageValue,
  ParsedCaacWorkbook,
  ParsedPersonnelWorkbook,
  PersonnelRecord,
  SourceType
} from "./models";

type Cell = string | number | boolean | Date | null | undefined;
type WorkbookApi = typeof XLSX;

interface FoundTable {
  sheetName: string;
  rows: Cell[][];
  headerIndex: number;
  headers: string[];
}

function text(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return formatDate(value);
  return String(value).trim();
}

export function normalizeName(value: Cell): string {
  return text(value).replace(/\s+/g, " ").trim();
}

export function normalizeIdentifier(value: Cell): string {
  const valueText = text(value).replace(/^'+/, "");
  if (!valueText) return "";
  return /^\d+\.0+$/.test(valueText) ? valueText.replace(/\.0+$/, "") : valueText;
}

function formatDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function normalizeDate(value: Cell): string {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return formatDate(value);
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return Number.isNaN(date.getTime()) ? "" : `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  }
  const candidate = String(value).trim();
  const match = /^(\d{4})\s*(?:[-/.年])\s*(\d{1,2})\s*(?:[-/.月])\s*(\d{1,2})\s*日?$/.exec(candidate);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${match[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function rowsForSheet(XLSXApi: WorkbookApi, sheet: XLSX.WorkSheet): Cell[][] {
  return XLSXApi.utils.sheet_to_json<Cell[]>(sheet, { header: 1, raw: false, defval: "" });
}

function findHeader(XLSXApi: WorkbookApi, workbook: XLSX.WorkBook, required: string[]): FoundTable | null {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = rowsForSheet(XLSXApi, sheet);
    for (let headerIndex = 0; headerIndex < Math.min(rows.length, 100); headerIndex += 1) {
      const headers = (rows[headerIndex] || []).map((item) => text(item));
      if (required.every((item) => headers.includes(item))) return { sheetName, rows, headerIndex, headers };
    }
  }
  return null;
}

function issue(source: SourceType, sheetName: string, kind: LanguageIssue["kind"], message: string, rowNumber?: number, name?: string, identifier?: string, language?: Language): LanguageIssue {
  return { source, sheetName, kind, message, rowNumber, name, identifier, language };
}

function value(value: Cell): LanguageValue {
  const raw = text(value);
  return { raw, date: normalizeDate(value) };
}

function checkDateValue(source: SourceType, sheetName: string, rowNumber: number, name: string, identifier: string, language: Language, item: LanguageValue, issues: LanguageIssue[]): void {
  if (item.raw && !item.date && !["不适用", "待确认", "无", "无要求"].includes(item.raw)) {
    issues.push(issue(source, sheetName, "invalid-date-value", `${language}能力值“${item.raw}”不是可识别日期。`, rowNumber, name, identifier, language));
  }
}

function extractNoteValue(note: string, language: Language): LanguageValue {
  const label = language === "英语" ? "英语(?:语言)?能力" : "汉语(?:语言)?能力";
  const linePattern = new RegExp(`${label}[^\\r\\n]*`, "i");
  const line = linePattern.exec(note)?.[0] || "";
  const dateMatch = /有效期至\s*([0-9]{4}\s*(?:[-/.年])\s*[0-9]{1,2}\s*(?:[-/.月])\s*[0-9]{1,2}\s*日?)/i.exec(line);
  if (dateMatch) return { raw: line.trim(), date: normalizeDate(dateMatch[1]) };
  return { raw: line.trim(), date: "" };
}

export function extractLanguageNoteValue(note: string, language: Language): LanguageValue {
  return extractNoteValue(note, language);
}

export function parsePersonnelWorkbook(XLSXApi: WorkbookApi, workbook: XLSX.WorkBook): ParsedPersonnelWorkbook {
  const found = findHeader(XLSXApi, workbook, ["员工号", "姓名", "英语能力", "汉语能力"]);
  if (!found) throw new Error("未找到人员信息表：需要包含“员工号”“姓名”“英语能力”“汉语能力”表头。");
  const employeeIndex = found.headers.indexOf("员工号");
  const nameIndex = found.headers.indexOf("姓名");
  const englishIndex = found.headers.indexOf("英语能力");
  const chineseIndex = found.headers.indexOf("汉语能力");
  const issues: LanguageIssue[] = [];
  const records: PersonnelRecord[] = [];
  const seenNames = new Set<string>();
  for (let index = found.headerIndex + 1; index < found.rows.length; index += 1) {
    const row = found.rows[index] || [];
    const employeeId = normalizeIdentifier(row[employeeIndex]);
    const name = normalizeName(row[nameIndex]);
    if (!employeeId && !name && !text(row[englishIndex]) && !text(row[chineseIndex])) continue;
    const rowNumber = index + 1;
    if (!name) { issues.push(issue("personnel", found.sheetName, "missing-name", "人员信息缺少姓名。", rowNumber, undefined, employeeId)); continue; }
    if (!employeeId) issues.push(issue("personnel", found.sheetName, "missing-employee-id", "人员信息缺少员工号。", rowNumber, name));
    if (seenNames.has(name)) issues.push(issue("personnel", found.sheetName, "duplicate-name", `人员信息重复姓名“${name}”，比对时使用首条记录。`, rowNumber, name, employeeId));
    seenNames.add(name);
    const english = value(row[englishIndex]);
    const chinese = value(row[chineseIndex]);
    checkDateValue("personnel", found.sheetName, rowNumber, name, employeeId, "英语", english, issues);
    checkDateValue("personnel", found.sheetName, rowNumber, name, employeeId, "汉语", chinese, issues);
    records.push({ source: "personnel", employeeId, name, english, chinese, sheetName: found.sheetName, rowNumber });
  }
  return { source: "personnel", sheetName: found.sheetName, headerRowNumber: found.headerIndex + 1, records, issues };
}

export function parseCaacWorkbook(XLSXApi: WorkbookApi, workbook: XLSX.WorkBook): ParsedCaacWorkbook {
  const found = findHeader(XLSXApi, workbook, ["飞行员ID", "姓名", "执照备注"]);
  if (!found) throw new Error("未找到局方数据表：需要包含“飞行员ID”“姓名”和“执照备注”表头。");
  const pilotIndex = found.headers.indexOf("飞行员ID");
  const nameIndex = found.headers.indexOf("姓名");
  const noteIndex = found.headers.indexOf("执照备注");
  const issues: LanguageIssue[] = [];
  const records: CaacRecord[] = [];
  const seenNames = new Set<string>();
  for (let index = found.headerIndex + 1; index < found.rows.length; index += 1) {
    const row = found.rows[index] || [];
    const pilotId = normalizeIdentifier(row[pilotIndex]);
    const name = normalizeName(row[nameIndex]);
    const note = text(row[noteIndex]);
    if (!pilotId && !name && !note) continue;
    const rowNumber = index + 1;
    if (!name) { issues.push(issue("caac", found.sheetName, "missing-name", "局方数据缺少姓名。", rowNumber, undefined, pilotId)); continue; }
    if (!pilotId) issues.push(issue("caac", found.sheetName, "missing-pilot-id", "局方数据缺少飞行员ID。", rowNumber, name));
    if (seenNames.has(name)) issues.push(issue("caac", found.sheetName, "duplicate-name", `局方数据重复姓名“${name}”，比对时使用首条记录。`, rowNumber, name, pilotId));
    seenNames.add(name);
    const english = extractNoteValue(note, "英语");
    const chinese = extractNoteValue(note, "汉语");
    if (/有效期至/.test(note) && !english.date && english.raw) issues.push(issue("caac", found.sheetName, "invalid-note-date", `英语备注日期无法识别：${english.raw}`, rowNumber, name, pilotId, "英语"));
    if (/有效期至/.test(note) && !chinese.date && chinese.raw && /汉语/.test(chinese.raw)) {
      const chineseDateText = /汉语[^\\r\\n]*有效期至/.test(note);
      if (chineseDateText) issues.push(issue("caac", found.sheetName, "invalid-note-date", `汉语备注日期无法识别：${chinese.raw}`, rowNumber, name, pilotId, "汉语"));
    }
    records.push({ source: "caac", pilotId, name, english, chinese, note, sheetName: found.sheetName, rowNumber });
  }
  return { source: "caac", sheetName: found.sheetName, headerRowNumber: found.headerIndex + 1, records, issues };
}
