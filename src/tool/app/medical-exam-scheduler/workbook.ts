import type {
    CandidateHeaderIndexes,
    CandidateSheet,
    HealthItem,
    MedicalExamPerson,
    MedicalWorkbookImport,
    QuotaSlot,
    RosterParseResult,
    RosterPerson,
    SheetRows
} from "./models";

const ROSTER_REQUIRED_HEADERS = ["员工号", "姓名", "RAMA"] as const;
const CANDIDATE_REQUIRED_HEADERS = ["员工号", "姓名", "体检日", "备注"] as const;

function normalizeText(value: unknown): string {
    return String(value ?? "").trim();
}

function normalizeEmployeeId(value: unknown): string {
    if (typeof value === "number" && Number.isFinite(value)) {
        return Number.isInteger(value) ? String(value) : normalizeText(value);
    }
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
        const rounded = value.getHours() === 23
            ? new Date(value.getTime() + 60 * 60 * 1000)
            : value;
        return validDateKey(rounded.getFullYear(), rounded.getMonth() + 1, rounded.getDate());
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        const integerText = Number.isInteger(value) ? String(value) : "";
        if (/^\d{8}$/.test(integerText)) {
            return validDateKey(Number(integerText.slice(0, 4)), Number(integerText.slice(4, 6)), Number(integerText.slice(6, 8)));
        }
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
    const limit = Math.min(rows.length, 20);
    for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
        const map = buildHeaderMap(rows[rowIndex] || []);
        if (required.every((header) => map.has(header))) return { rowIndex, map };
    }
    return null;
}

function checkedOne(value: unknown): boolean {
    return value === 1 || value === true || normalizeText(value) === "1";
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
                employeeId,
                name,
                department: departmentIndex === undefined ? "" : normalizeText(row[departmentIndex]),
                technicalInfo: technicalInfoIndex === undefined ? "" : normalizeText(row[technicalInfoIndex]),
                isNorthAmericaLeader: checkedOne(row[ramaIndex]),
                sourceRow
            });
        });
        return { sheetName: sheet.name, headerRowIndex: header.rowIndex, people, issues };
    }
    throw new Error(`机组花名册未找到完整表头：${ROSTER_REQUIRED_HEADERS.join("、")}。`);
}

function parseCandidateSheet(sheet: SheetRows): CandidateSheet | null {
    const header = findHeader(sheet.rows, CANDIDATE_REQUIRED_HEADERS);
    if (!header) return null;
    const indexes: CandidateHeaderIndexes = {
        employeeId: header.map.get("员工号") as number,
        name: header.map.get("姓名") as number,
        examDate: header.map.get("体检日") as number,
        note: header.map.get("备注") as number,
        ...(header.map.has("调整说明") ? { adjustmentNotes: header.map.get("调整说明") as number } : {})
    };
    const people: MedicalExamPerson[] = [];
    const issues: HealthItem[] = [];
    const seen = new Set<string>();

    sheet.rows.slice(header.rowIndex + 1).forEach((row, offset) => {
        const sourceRow = header.rowIndex + offset + 2;
        const employeeId = normalizeEmployeeId(row[indexes.employeeId]);
        const name = normalizeText(row[indexes.name]);
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
        const rawDate = row[indexes.examDate];
        const examDate = parseBusinessDate(rawDate);
        if (normalizeText(rawDate) && !examDate) {
            issues.push(healthItem(`${sheet.name}-invalid-date-${sourceRow}`, "error", "体检日无法识别", `${sheet.name} 第 ${sourceRow} 行的体检日无法识别。`));
        }
        const note = normalizeText(row[indexes.note]);
        const adjustmentText = indexes.adjustmentNotes === undefined ? "" : normalizeText(row[indexes.adjustmentNotes]);
        people.push({
            employeeId,
            name,
            sourceRow,
            department: "",
            technicalInfo: "",
            isNorthAmericaLeader: false,
            examDate,
            note,
            matchedRoster: false,
            adjusted: Boolean(adjustmentText),
            adjustmentNotes: adjustmentText.split(/[；;]/).map((item) => item.trim()).filter(Boolean)
        });
    });
    return { name: sheet.name, headerRowIndex: header.rowIndex, indexes, people, issues };
}

function parseQuotaSlots(sheets: SheetRows[]): { slots: QuotaSlot[]; issues: HealthItem[] } {
    const slots: QuotaSlot[] = [];
    const issues: HealthItem[] = [];
    const byDate = new Map<string, QuotaSlot>();
    sheets.forEach((sheet) => {
        const limit = Math.min(sheet.rows.length, 10);
        for (let headerRowIndex = 0; headerRowIndex < limit; headerRowIndex += 1) {
            (sheet.rows[headerRowIndex] || []).forEach((value, quotaColumnIndex) => {
                if (quotaColumnIndex < 1 || !normalizeText(value).includes("额度")) return;
                const dateColumnIndex = quotaColumnIndex - 1;
                sheet.rows.slice(headerRowIndex + 1).forEach((dataRow, offset) => {
                    const rawDate = dataRow[dateColumnIndex];
                    const rawCapacity = dataRow[quotaColumnIndex];
                    if (!normalizeText(rawDate) && !normalizeText(rawCapacity)) return;
                    const date = parseBusinessDate(rawDate);
                    const capacity = typeof rawCapacity === "number" ? rawCapacity : Number(normalizeText(rawCapacity));
                    const sourceRow = headerRowIndex + offset + 2;
                    if (!date) {
                        issues.push(healthItem(`${sheet.name}-quota-date-${sourceRow}-${quotaColumnIndex}`, "error", "额度日期无法识别", `${sheet.name} 第 ${sourceRow} 行的额度日期无法识别。`));
                        return;
                    }
                    if (!Number.isInteger(capacity) || capacity < 0) {
                        issues.push(healthItem(`${sheet.name}-quota-value-${sourceRow}-${quotaColumnIndex}`, "error", "额度不是非负整数", `${sheet.name} 第 ${sourceRow} 行 ${date} 的额度无效。`));
                        return;
                    }
                    if (capacity === 0) return;
                    if (byDate.has(date)) {
                        issues.push(healthItem(`duplicate-quota-${date}`, "error", "体检日额度重复", `${date} 在额度表中出现多次。`));
                        return;
                    }
                    const slot = { date, capacity, sourceSheet: sheet.name, sourceRow };
                    byDate.set(date, slot);
                    slots.push(slot);
                });
            });
        }
    });
    slots.sort((left, right) => left.date.localeCompare(right.date));
    return { slots, issues };
}

function parseMedicalSheets(sheets: SheetRows[]): MedicalWorkbookImport {
    const candidateSheets = sheets.map(parseCandidateSheet).filter((sheet): sheet is CandidateSheet => Boolean(sheet));
    const quota = parseQuotaSlots(sheets);
    const issues = [...quota.issues];
    if (!candidateSheets.length) {
        issues.push(healthItem("missing-candidate-sheet", "error", "未找到待排名单", `工作簿中没有同时包含${CANDIDATE_REQUIRED_HEADERS.join("、")}的工作表。`));
    }
    if (!quota.slots.length) {
        issues.push(healthItem("missing-quota", "error", "没有可用体检额度", "工作簿中没有识别到正整数体检额度。"));
    }
    candidateSheets.forEach((sheet) => issues.push(...sheet.issues));
    return { candidateSheets, slots: quota.slots, issues };
}

export const MedicalExamWorkbook = { parseBusinessDate, parseRosterSheets, parseMedicalSheets };
