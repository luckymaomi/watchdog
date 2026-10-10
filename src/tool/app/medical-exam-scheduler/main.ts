import type * as XlsxRuntime from "xlsx-js-style";

import { createMedicalExamExporter } from "./export";
import { MedicalExamLogic as logic } from "./logic";
import type {
    CandidateSheet,
    HealthItem,
    MedicalExamPerson,
    MedicalWorkbookImport,
    QuotaSlot,
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

function monthsFromSlots(slots: QuotaSlot[]): string[] {
    return [...new Set(slots.map((slot) => slot.date.slice(0, 7)))].sort();
}

function inferMonth(candidateName: string, months: string[]): string {
    const matched = candidateName.match(/(20\d{2})[.\-/年](\d{1,2})/);
    if (!matched) return months[0] || "";
    const current = new Date(Number(matched[1]), Number(matched[2]) - 1, 1, 12);
    current.setMonth(current.getMonth() + 1);
    const expected = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
    return months.includes(expected) ? expected : months[0] || "";
}

function currentCandidate(): CandidateSheet | null {
    return imported?.candidateSheets[candidateIndex] || null;
}

function currentSlots(): QuotaSlot[] {
    return imported?.slots.filter((slot) => slot.date.startsWith(selectedMonth)) || [];
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
    const pendingCount = people.filter((person) => !person.examDate).length;
    view.requireElement("allocateButton", HTMLButtonElement).disabled = !valid || pendingCount === 0;
    view.requireElement("allocateButton", HTMLButtonElement).textContent = pendingCount === people.length ? "生成预排" : "补充分配";
    view.requireElement("exportButton", HTMLButtonElement).disabled = !valid || !sourceWorkbook;
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
    const months = monthsFromSlots(imported.slots);
    if (!selectedMonth || !months.includes(selectedMonth)) {
        selectedMonth = inferMonth(currentCandidate()?.name || "", months);
    }
    view.populateSelect("monthField", "monthSelect", months.map((month) => ({ value: month, label: month })), selectedMonth);
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
        ? `预排完成，仍有 ${pending} 人因额度不足未分配。`
        : "预排完成：北美带队已优先安排，其余人员已按额度均衡分配。", pending ? "warning" : "success");
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

function toggleLock(employeeId: string): void {
    people = people.map((person) => {
        if (person.employeeId !== employeeId) return person;
        const locked = !person.locked;
        return {
            ...person,
            locked,
            adjusted: true,
            adjustmentNotes: [...person.adjustmentNotes, `锁班状态：${locked ? "已锁" : "未锁"}`]
        };
    });
    renderCurrent();
}

function exportCurrent(): void {
    const candidate = currentCandidate();
    if (!sourceWorkbook || !candidate) return;
    exporter.exportWorkbook(sourceWorkbook, sourceFileName, candidate.name, candidate.headerRowIndex, candidate.indexes, people);
    view.setStatus("medicalStatus", "已导出体检预排工作簿。", "success");
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
        selectedMonth = inferMonth(currentCandidate()?.name || "", monthsFromSlots(imported?.slots || []));
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
    view.requireElement("exportButton", HTMLButtonElement).addEventListener("click", exportCurrent);
    document.addEventListener("change", (event) => {
        const checkbox = (event.target as Element | null)?.closest<HTMLInputElement>(".person-select");
        const employeeId = checkbox?.dataset.employeeId;
        if (!checkbox || !employeeId) return;
        if (checkbox.checked) selectedEmployeeIds.add(employeeId);
        else selectedEmployeeIds.delete(employeeId);
        renderCurrent();
    });
    document.addEventListener("click", (event) => {
        const button = (event.target as Element | null)?.closest<HTMLButtonElement>(".lock-button");
        const employeeId = button?.dataset.lockId;
        if (employeeId) toggleLock(employeeId);
    });
}

bindEvents();
void loadDefaultRoster();
