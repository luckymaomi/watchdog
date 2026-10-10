import type {
    CandidateHeaderIndexes, CandidateSheet, HealthItem, MedicalExamPerson, MedicalWorkbookImport,
    QuotaMonth, QuotaSlot, RosterParseResult, RosterPerson, SheetRows
} from "./models";

const ROSTER_REQUIRED_HEADERS = ["员工号", "姓名", "RAMA"] as const;
const CANDIDATE_HEADERS = ["员工号", "姓名", "体检日", "备注"] as const;
const QUOTA_SHEET_PATTERN = /^可用日期(20\d{2})$/;
const CANDIDATE_SHEET_PATTERN = /^20\d{2}\.(0[1-9]|1[0-2])$/;

function candidateMonthKey(sheetName: string): string {
    return CANDIDATE_SHEET_PATTERN.test(sheetName) ? sheetName.replace(".", "-") : "";
}

function normalizeText(value: unknown): string {
    return String(value ?? "").trim();
}

function normalizeEmployeeId(value: unknown): string {
    if (typeof value === "number" && Number.isFinite(value)) return Number.isInteger(value) ? String(value) : normalizeText(value);
    return normalizeText(value);
}

function pad(value: number): string {
    return String(value).padStart(2, "0");
}

function validDateKey(year: number, month: number, day: number): string {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return "";
    const date = new Date(year, month - 1, day, 12);
    if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) return "";
    return `${year}-${pad(month)}-${pad(day)}`;
}

function parseBusinessDate(value: unknown, date1904 = false): string {
    if (value === undefined || value === null || value === "") return "";
    if (value instanceof Date && !Number.isNaN(value.valueOf())) {
        const rounded = value.getHours() === 23 ? new Date(value.getTime() + 60 * 60 * 1000) : value;
        return validDateKey(rounded.getFullYear(), rounded.getMonth() + 1, rounded.getDate());
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        const integerText = Number.isInteger(value) ? String(value) : "";
        if (/^\d{8}$/.test(integerText)) return validDateKey(Number(integerText.slice(0, 4)), Number(integerText.slice(4, 6)), Number(integerText.slice(6, 8)));
        const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
        const date = new Date(epoch + Math.floor(value) * 86400000);
        return validDateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    }
    const text = normalizeText(value);
    let matched = text.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!matched) matched = text.match(/^(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/);
    if (!matched) matched = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
    return matched ? validDateKey(Number(matched[1]), Number(matched[2]), Number(matched[3])) : "";
}

function buildHeaderMap(row: unknown[]): Map<string, number> {
    const result = new Map<string, number>();
    row.forEach((value, index) => {
        const text = normalizeText(value);
        if (text && !result.has(text)) result.set(text, index);
    });
    return result;
}

function findHeader(rows: unknown[][], required: readonly string[]): { rowIndex: number; map: Map<string, number> } | null {
    for (let rowIndex = 0; rowIndex < Math.min(rows.length, 20); rowIndex += 1) {
        const map = buildHeaderMap(rows[rowIndex] || []);
        if (required.every((header) => map.has(header))) return { rowIndex, map };
    }
    return null;
}

function healthItem(id: string, severity: HealthItem["severity"], title: string, message: string): HealthItem {
    return { id, severity, title, message };
}

function parseRosterSheets(sheets: SheetRows[]): RosterParseResult {
    for (const sheet of sheets) {
        const header = findHeader(sheet.rows, ROSTER_REQUIRED_HEADERS);
        if (!header) continue;
        const issues: HealthItem[] = [];
        const people: RosterPerson[] = [];
        const seen = new Set<string>();
        const employeeIdIndex = header.map.get("员工号") as number;
        const nameIndex = header.map.get("姓名") as number;
        const ramaIndex = header.map.get("RAMA") as number;
        const departmentIndex = header.map.get("分部");
        const technicalInfoIndex = header.map.get("技术信息");
        sheet.rows.slice(header.rowIndex + 1).forEach((row, offset) => {
            const sourceRow = header.rowIndex + offset + 2;
            const employeeId = normalizeEmployeeId(row[employeeIdIndex]);
            const name = normalizeText(row[nameIndex]);
            if (!employeeId && !name) return;
            if (!employeeId) {
                issues.push(healthItem(`roster-missing-id-${sourceRow}`, "error", "花名册员工号缺失", `${sheet.name} 第 ${sourceRow} 行没有员工号。`));
                return;
            }
            if (seen.has(employeeId)) {
                issues.push(healthItem(`roster-duplicate-${employeeId}`, "error", "花名册员工号重复", `员工号 ${employeeId} 在花名册中重复。`));
                return;
            }
            seen.add(employeeId);
            people.push({
                employeeId, name,
                department: departmentIndex === undefined ? "" : normalizeText(row[departmentIndex]),
                technicalInfo: technicalInfoIndex === undefined ? "" : normalizeText(row[technicalInfoIndex]),
                isNorthAmericaLeader: row[ramaIndex] === 1 || row[ramaIndex] === true || normalizeText(row[ramaIndex]) === "1",
                sourceRow
            });
        });
        return { sheetName: sheet.name, headerRowIndex: header.rowIndex, people, issues };
    }
    throw new Error(`机组花名册未找到完整表头：${ROSTER_REQUIRED_HEADERS.join("、")}。`);
}

function parseCandidateSheet(sheet: SheetRows): CandidateSheet | null {
    const header = (sheet.rows[0] || []).map(normalizeText);
    if (header.length !== 4 || CANDIDATE_HEADERS.some((name, index) => header[index] !== name)) return null;
    const indexes: CandidateHeaderIndexes = { employeeId: 0, name: 1, examDate: 2, note: 3 };
    const people: MedicalExamPerson[] = [];
    const issues: HealthItem[] = [];
    const seen = new Set<string>();
    sheet.rows.slice(1).forEach((row, offset) => {
        const sourceRow = offset + 2;
        const employeeId = normalizeEmployeeId(row[0]);
        const name = normalizeText(row[1]);
        if (!employeeId && !name) return;
        if (!employeeId) {
            issues.push(healthItem(`${sheet.name}-missing-id-${sourceRow}`, "error", "待排名单员工号缺失", `${sheet.name} 第 ${sourceRow} 行没有员工号。`));
            return;
        }
        if (seen.has(employeeId)) {
            issues.push(healthItem(`${sheet.name}-duplicate-${employeeId}`, "error", "待排名单员工号重复", `${sheet.name} 中员工号 ${employeeId} 重复。`));
            return;
        }
        seen.add(employeeId);
        const examDate = parseBusinessDate(row[2]);
        if (normalizeText(row[2]) && !examDate) issues.push(healthItem(`${sheet.name}-invalid-date-${sourceRow}`, "error", "体检日无法识别", `${sheet.name} 第 ${sourceRow} 行的体检日无法识别。`));
        people.push({
            employeeId, name, sourceRow, department: "", technicalInfo: "", isNorthAmericaLeader: false,
            examDate, note: normalizeText(row[3]), matchedRoster: false, adjusted: false, adjustmentNotes: []
        });
    });
    return { name: sheet.name, headerRowIndex: 0, indexes, people, issues };
}

function parseQuotaSheets(sheets: SheetRows[]): { slots: QuotaSlot[]; quotaMonths: QuotaMonth[]; issues: HealthItem[] } {
    const slots: QuotaSlot[] = [];
    const issues: HealthItem[] = [];
    const months = new Map<string, QuotaMonth>();
    const byDate = new Map<string, QuotaSlot>();
    sheets.filter((sheet) => QUOTA_SHEET_PATTERN.test(sheet.name)).forEach((sheet) => {
        const year = Number(sheet.name.slice(-4));
        const header = sheet.rows[0] || [];
        let foundPair = false;
        for (let quotaColumn = 1; quotaColumn < header.length; quotaColumn += 1) {
            if (!normalizeText(header[quotaColumn]).includes("额度")) continue;
            foundPair = true;
            for (let offset = 1; offset < sheet.rows.length; offset += 1) {
                const row = sheet.rows[offset] || [];
                const rawDate = row[quotaColumn - 1];
                const rawCapacity = row[quotaColumn];
                if (!normalizeText(rawDate) && !normalizeText(rawCapacity)) continue;
                const date = parseBusinessDate(rawDate);
                const sourceRow = offset + 1;
                if (!date) {
                    issues.push(healthItem(`${sheet.name}-date-${sourceRow}-${quotaColumn}`, "error", "额度日期无法识别", `${sheet.name} 第 ${sourceRow} 行的日期无法识别。`));
                    continue;
                }
                if (!date.startsWith(`${year}-`)) {
                    issues.push(healthItem(`${sheet.name}-year-${sourceRow}-${quotaColumn}`, "error", "额度年份不一致", `${sheet.name} 第 ${sourceRow} 行日期 ${date} 不属于 ${year} 年。`));
                    continue;
                }
                const capacity = typeof rawCapacity === "number" ? rawCapacity : Number(normalizeText(rawCapacity));
                if (!Number.isInteger(capacity) || capacity < 0) {
                    issues.push(healthItem(`${sheet.name}-value-${sourceRow}-${quotaColumn}`, "error", "额度不是非负整数", `${sheet.name} 第 ${sourceRow} 行 ${date} 的额度无效。`));
                    continue;
                }
                const monthKey = date.slice(0, 7);
                const month = months.get(monthKey) || { key: monthKey, sourceSheets: [], dateCount: 0, totalCapacity: 0 };
                if (!month.sourceSheets.includes(sheet.name)) month.sourceSheets.push(sheet.name);
                month.dateCount += 1;
                month.totalCapacity += capacity;
                months.set(monthKey, month);
                if (byDate.has(date)) {
                    issues.push(healthItem(`duplicate-quota-${date}`, "error", "体检日额度重复", `${date} 在额度表中出现多次。`));
                    continue;
                }
                const slot = { date, capacity, sourceSheet: sheet.name, sourceRow };
                byDate.set(date, slot);
                if (capacity > 0) slots.push(slot);
            }
        }
        if (!foundPair) issues.push(healthItem(`${sheet.name}-missing-columns`, "error", "年度额度表缺少额度列", `${sheet.name} 必须按日期列、额度列成对维护。`));
    });
    slots.sort((left, right) => left.date.localeCompare(right.date));
    return { slots, quotaMonths: [...months.values()].sort((left, right) => left.key.localeCompare(right.key)), issues };
}

function parseMedicalSheets(sheets: SheetRows[]): MedicalWorkbookImport {
    const issues: HealthItem[] = [];
    const candidateSheets: CandidateSheet[] = [];
    sheets.filter((sheet) => CANDIDATE_SHEET_PATTERN.test(sheet.name)).forEach((sheet) => {
        const candidate = parseCandidateSheet(sheet);
        if (candidate) candidateSheets.push(candidate);
        else issues.push(healthItem(`${sheet.name}-invalid-headers`, "error", "月度名单表头不符合规范", `${sheet.name} 必须只有“员工号、姓名、体检日、备注”四列表头。`));
    });
    const quota = parseQuotaSheets(sheets);
    issues.push(...quota.issues);
    if (!candidateSheets.length) issues.push(healthItem("missing-candidate-sheet", "error", "未找到月度名单", "工作簿中没有找到 YYYY.MM 格式的月度名单 sheet。"));
    if (!quota.quotaMonths.length) issues.push(healthItem("missing-quota-sheet", "error", "未找到年度额度", "工作簿中没有找到可用日期YYYY格式的年度额度 sheet。"));
    if (!quota.slots.length) issues.push(healthItem("missing-quota", "error", "没有可用体检额度", "年度额度表中没有识别到正整数体检额度。"));
    const quotaMonthKeys = new Set(quota.quotaMonths.map((month) => month.key));
    candidateSheets.forEach((sheet) => {
        const monthKey = candidateMonthKey(sheet.name);
        if (!quotaMonthKeys.has(monthKey)) issues.push(healthItem(`${sheet.name}-missing-quota-month`, "error", "月度名单缺少对应额度", `${sheet.name} 没有对应的 ${monthKey} 月额度。`));
    });
    candidateSheets.forEach((sheet) => issues.push(...sheet.issues));
    return { candidateSheets, slots: quota.slots, quotaMonths: quota.quotaMonths, issues };
}

export const MedicalExamWorkbook = { parseBusinessDate, candidateMonthKey, parseRosterSheets, parseMedicalSheets };
