import type * as XlsxRuntime from "xlsx-js-style";

import { createMedicalExamExporter } from "./export";
import { MedicalExamLogic as logic } from "./logic";
import type {
    CandidateSheet,
    HealthItem,
    MedicalExamPerson,
    MedicalWorkbookImport,
    QuotaSlot,
    QuotaMonth,
    RosterParseResult,
    SheetRows
} from "./models";
import { MedicalExamView as view } from "./view";

const ROSTER_PATH = "../../../template/机组花名册.xlsx";
const XLSX = window.XLSX as unknown as typeof XlsxRuntime;
const exporter = createMedicalExamExporter(XLSX);

let roster: RosterParseResult | null = null;
let sourceWorkbook: XlsxRuntime.WorkBook | null = null;
let sourceFileName = "";
let imported: MedicalWorkbookImport | null = null;
let candidateIndex = 0;
let selectedMonth = "";
let people: MedicalExamPerson[] = [];
const selectedEmployeeIds = new Set<string>();

function workbookSheets(workbook: XlsxRuntime.WorkBook): SheetRows[] {
    return workbook.SheetNames.map((name) => ({
        name,
        rows: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], {
            header: 1,
            raw: true,
            defval: null
        })
    }));
}

function readWorkbook(data: ArrayBuffer | Uint8Array): XlsxRuntime.WorkBook {
    return XLSX.read(data, { type: "array", cellDates: true, cellStyles: true });
}

function monthsFromQuota(quotaMonths: QuotaMonth[]): string[] {
    return quotaMonths.map((month) => month.key);
}

function inferMonth(candidateName: string, months: string[]): string {
    const expected = logic.candidateMonthKey(candidateName);
    return months.includes(expected) ? expected : "";
}

function currentCandidate(): CandidateSheet | null {
    return imported?.candidateSheets[candidateIndex] || null;
}

function currentSlots(): QuotaSlot[] {
    if (!imported || !selectedMonth) return [];
    return imported.slots.filter((slot) => slot.date.startsWith(selectedMonth));
}

function activeImport(slots: QuotaSlot[]): MedicalWorkbookImport | null {
    return imported ? { ...imported, slots } : null;
}

function hasErrors(items: HealthItem[]): boolean {
    return items.some((item) => item.severity === "error");
}

function renderCurrent(): void {
    if (!roster || !imported) return;
    const candidate = currentCandidate();
    if (!candidate) return;
    const slots = currentSlots();
    const scopedImport = activeImport(slots) as MedicalWorkbookImport;
    if (!people.length || !people.every((person) => candidate.people.some((item) => item.employeeId === person.employeeId))) {
        people = logic.enrichPeople(candidate.people, roster.people);
    }
    const health = logic.buildHealthReport(roster, scopedImport, candidate, people);
    view.renderHealth(health);
    view.renderWorkspace(people, slots, selectedEmployeeIds);
    const valid = !hasErrors(health);
    const pendingCount = people.filter((person) => !person.examDate && !person.isNorthAmericaLeader).length;
    view.requireElement("allocateButton", HTMLButtonElement).disabled = !valid || pendingCount === 0;
    view.requireElement("allocateButton", HTMLButtonElement).textContent = pendingCount === 0
        ? "非北美带队已全部分配"
        : "一键分配非北美带队";
    const hasAssignments = people.some((person) => Boolean(person.examDate));
    view.requireElement("exportButton", HTMLButtonElement).disabled = !valid || !sourceWorkbook || !hasAssignments;
}

function resetPeople(): void {
    selectedEmployeeIds.clear();
    if (!roster || !imported) return;
    const candidate = currentCandidate();
    people = candidate ? logic.enrichPeople(candidate.people, roster.people) : [];
    renderCurrent();
}

function setupSelectors(): void {
    if (!imported) return;
    const candidateOptions = imported.candidateSheets.map((candidate, index) => ({ value: String(index), label: candidate.name }));
    view.populateSelect("candidateField", "candidateSelect", candidateOptions, String(candidateIndex));
    const months = monthsFromQuota(imported.quotaMonths);
    if (!selectedMonth || !months.includes(selectedMonth)) {
        selectedMonth = inferMonth(currentCandidate()?.name || "", months);
    }
    const monthOptions = selectedMonth ? [selectedMonth] : [];
    view.populateSelect("monthField", "monthSelect", monthOptions.map((month) => {
        const metadata = imported?.quotaMonths.find((item) => item.key === month);
        const sources = metadata?.sourceSheets.join("、") || "额度表";
        return { value: month, label: `${month} · ${sources}` };
    }), selectedMonth);
}

async function loadDefaultRoster(): Promise<void> {
    try {
        const response = await fetch(ROSTER_PATH);
        if (!response.ok) throw new Error("默认花名册不存在");
        const workbook = readWorkbook(await response.arrayBuffer());
        roster = logic.parseRosterSheets(workbookSheets(workbook));
        view.setStatus("rosterStatus", `已自动加载机组花名册：${roster.people.length} 人，RAMA=1 共 ${roster.people.filter((person) => person.isNorthAmericaLeader).length} 人。`, "success");
        resetPeople();
    } catch (error) {
        view.setStatus("rosterStatus", `默认花名册加载失败，请手动选择：${error instanceof Error ? error.message : String(error)}`, "danger");
    }
}

async function handleRosterFile(file: File): Promise<void> {
    try {
        roster = logic.parseRosterSheets(workbookSheets(readWorkbook(await file.arrayBuffer())));
        view.setStatus("rosterStatus", `已加载 ${file.name}：${roster.people.length} 人，RAMA=1 共 ${roster.people.filter((person) => person.isNorthAmericaLeader).length} 人。`, "success");
        resetPeople();
    } catch (error) {
        view.setStatus("rosterStatus", `花名册解析失败：${error instanceof Error ? error.message : String(error)}`, "danger");
    }
}

async function handleMedicalFile(file: File): Promise<void> {
    try {
        sourceWorkbook = readWorkbook(await file.arrayBuffer());
        sourceFileName = file.name;
        imported = logic.parseMedicalSheets(workbookSheets(sourceWorkbook));
        candidateIndex = 0;
        selectedMonth = "";
        setupSelectors();
        resetPeople();
        const type = imported.issues.some((item) => item.severity === "error") ? "danger" : "success";
        view.setStatus("medicalStatus", `已导入 ${file.name}：识别 ${imported.candidateSheets.length} 张待排名单、${imported.slots.length} 个正额度体检日。`, type);
    } catch (error) {
        sourceWorkbook = null;
        imported = null;
        people = [];
        view.setStatus("medicalStatus", `体检工作簿解析失败：${error instanceof Error ? error.message : String(error)}`, "danger");
    }
}

function allocate(): void {
    if (!imported || !roster) return;
    const result = logic.allocatePeople(people, currentSlots());
    people = result.people;
    selectedEmployeeIds.clear();
    renderCurrent();
    const pending = result.pendingEmployeeIds.length;
    view.setStatus("medicalStatus", pending
        ? `一键分配完成，仍有 ${pending} 名非北美带队因额度不足未分配。`
        : "一键分配完成：所有未排的非北美带队均已安排。", pending ? "warning" : "success");
}

function moveSelected(): void {
    const target = view.requireElement("moveTarget", HTMLSelectElement).value;
    try {
        people = logic.movePeople(people, [...selectedEmployeeIds], target, currentSlots());
        selectedEmployeeIds.clear();
        renderCurrent();
        view.setStatus("medicalStatus", `已将所选人员移动到 ${target}。`, "success");
    } catch (error) {
        view.setStatus("medicalStatus", error instanceof Error ? error.message : String(error), "danger");
    }
}

function unassignSelected(): void {
    try {
        people = logic.unassignPeople(people, [...selectedEmployeeIds]);
        selectedEmployeeIds.clear();
        renderCurrent();
        view.setStatus("medicalStatus", "已将所选人员移回待分配区。", "success");
    } catch (error) {
        view.setStatus("medicalStatus", error instanceof Error ? error.message : String(error), "danger");
    }
}

function exportCurrent(): void {
    const candidate = currentCandidate();
    if (!sourceWorkbook || !candidate) return;
    exporter.exportWorkbook(sourceWorkbook, sourceFileName, candidate.name, candidate.headerRowIndex, candidate.indexes, people);
    view.setStatus("medicalStatus", "已导出体检预排工作簿。", "success");
}

async function copyLeaderAssignments(): Promise<void> {
    const button = view.requireElement("copyLeaderButton", HTMLButtonElement);
    try {
        await navigator.clipboard.writeText(logic.buildLeaderCopyText(people, currentSlots()));
        button.textContent = "已复制";
        window.setTimeout(() => {
            button.textContent = "复制带队安排信息";
        }, 1500);
    } catch (error) {
        view.setStatus("medicalStatus", `复制失败：${error instanceof Error ? error.message : String(error)}`, "danger");
    }
}

function bindEvents(): void {
    view.requireElement("medicalFile", HTMLInputElement).addEventListener("change", (event) => {
        const file = (event.currentTarget as HTMLInputElement).files?.[0];
        if (file) void handleMedicalFile(file);
    });
    view.requireElement("rosterFile", HTMLInputElement).addEventListener("change", (event) => {
        const file = (event.currentTarget as HTMLInputElement).files?.[0];
        if (file) void handleRosterFile(file);
    });
    view.requireElement("candidateSelect", HTMLSelectElement).addEventListener("change", (event) => {
        candidateIndex = Number((event.currentTarget as HTMLSelectElement).value);
        selectedMonth = inferMonth(currentCandidate()?.name || "", monthsFromQuota(imported?.quotaMonths || []));
        setupSelectors();
        resetPeople();
    });
    view.requireElement("monthSelect", HTMLSelectElement).addEventListener("change", (event) => {
        selectedMonth = (event.currentTarget as HTMLSelectElement).value;
        resetPeople();
    });
    view.requireElement("allocateButton", HTMLButtonElement).addEventListener("click", allocate);
    view.requireElement("moveButton", HTMLButtonElement).addEventListener("click", moveSelected);
    view.requireElement("unassignButton", HTMLButtonElement).addEventListener("click", unassignSelected);
    view.requireElement("clearSelectionButton", HTMLButtonElement).addEventListener("click", () => {
        selectedEmployeeIds.clear();
        renderCurrent();
    });
    view.requireElement("copyLeaderButton", HTMLButtonElement).addEventListener("click", () => void copyLeaderAssignments());
    view.requireElement("exportButton", HTMLButtonElement).addEventListener("click", exportCurrent);
    document.addEventListener("change", (event) => {
        const checkbox = (event.target as Element | null)?.closest<HTMLInputElement>(".person-select");
        const employeeId = checkbox?.dataset.employeeId;
        if (!checkbox || !employeeId) return;
        if (checkbox.checked) selectedEmployeeIds.add(employeeId);
        else selectedEmployeeIds.delete(employeeId);
        renderCurrent();
    });
}

bindEvents();
void loadDefaultRoster();
