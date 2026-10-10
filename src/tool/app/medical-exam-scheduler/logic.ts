import type {
    AllocationResult,
    CandidateSheet,
    DailyLoad,
    ExamWarning,
    HealthItem,
    MedicalExamPerson,
    MedicalWorkbookImport,
    QuotaSlot,
    RosterParseResult,
    RosterPerson
} from "./models";
import { MedicalExamWorkbook as workbook } from "./workbook";

function clonePerson(person: MedicalExamPerson): MedicalExamPerson {
    return { ...person, adjustmentNotes: [...person.adjustmentNotes] };
}

function enrichPeople(people: MedicalExamPerson[], roster: RosterPerson[]): MedicalExamPerson[] {
    const rosterById = new Map(roster.map((person) => [person.employeeId, person]));
    return people.map((person) => {
        const match = rosterById.get(person.employeeId);
        return {
            ...clonePerson(person),
            department: match?.department || "",
            technicalInfo: match?.technicalInfo || "",
            isNorthAmericaLeader: match?.isNorthAmericaLeader || false,
            matchedRoster: Boolean(match)
        };
    });
}

function buildLoads(people: MedicalExamPerson[], slots: QuotaSlot[]): DailyLoad[] {
    const counts = new Map<string, number>();
    people.forEach((person) => {
        if (person.examDate) counts.set(person.examDate, (counts.get(person.examDate) || 0) + 1);
    });
    return slots.map((slot) => {
        const assigned = counts.get(slot.date) || 0;
        return {
            ...slot,
            assigned,
            remaining: slot.capacity - assigned,
            protectedRemaining: Math.max(slot.capacity - 1 - assigned, 0)
        };
    });
}

function shuffled<T>(items: T[], random: () => number): T[] {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const target = Math.floor(random() * (index + 1));
        [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
}

function allocatePeople(people: MedicalExamPerson[], slots: QuotaSlot[], random: () => number = Math.random): AllocationResult {
    const next = people.map(clonePerson);
    const byId = new Map(next.map((person) => [person.employeeId, person]));
    const queues = [
        next.filter((person) => !person.examDate && person.isNorthAmericaLeader),
        shuffled(next.filter((person) => !person.examDate && !person.isNorthAmericaLeader), random)
    ];
    const assignedCounts = new Map(buildLoads(next, slots).map((load) => [load.date, load.assigned]));

    const assignQueue = (queue: MedicalExamPerson[], reserve: number): MedicalExamPerson[] => {
        const pending: MedicalExamPerson[] = [];
        queue.forEach((person) => {
            const eligible = slots
                .filter((slot) => (assignedCounts.get(slot.date) || 0) < Math.max(slot.capacity - reserve, 0))
                .sort((left, right) => {
                    const loadDifference = (assignedCounts.get(left.date) || 0) - (assignedCounts.get(right.date) || 0);
                    return loadDifference || left.date.localeCompare(right.date);
                });
            const target = eligible[0];
            if (!target) {
                pending.push(person);
                return;
            }
            const original = byId.get(person.employeeId) as MedicalExamPerson;
            original.examDate = target.date;
            assignedCounts.set(target.date, (assignedCounts.get(target.date) || 0) + 1);
        });
        return pending;
    };

    const afterProtected = queues.map((queue) => assignQueue(queue, 1));
    const afterFull = afterProtected.map((queue) => assignQueue(queue, 0));
    const pendingEmployeeIds = afterFull.reduce<string[]>((result, queue) => (
        result.concat(queue.map((person) => person.employeeId))
    ), []);
    return { people: next, dailyLoads: buildLoads(next, slots), pendingEmployeeIds };
}

function parseDateKey(dateKey: string): Date | null {
    const matched = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!matched) return null;
    const year = Number(matched[1]);
    const month = Number(matched[2]);
    const day = Number(matched[3]);
    const date = new Date(year, month - 1, day, 12);
    return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day ? date : null;
}

function getWarning(examDate: string, locked: boolean, today = new Date()): ExamWarning {
    if (locked) return { level: "locked", daysUntilExam: null, label: "已锁班" };
    const date = parseDateKey(examDate);
    if (!date) return { level: "unassigned", daysUntilExam: null, label: "尚未预排" };
    const current = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
    const daysUntilExam = Math.round((date.getTime() - current.getTime()) / 86400000);
    if (daysUntilExam < 0) return { level: "pastExam", daysUntilExam, label: "体检日已过" };
    if (daysUntilExam < 10) return { level: "overdueLock", daysUntilExam, label: "已超过锁班截止" };
    if (daysUntilExam <= 10) return { level: "urgent10", daysUntilExam, label: "10天锁班截止" };
    if (daysUntilExam <= 15) return { level: "warning15", daysUntilExam, label: "15天预警" };
    if (daysUntilExam <= 30) return { level: "notice30", daysUntilExam, label: "30天提醒" };
    return { level: "none", daysUntilExam, label: "未到提醒窗口" };
}

function healthItem(id: string, severity: HealthItem["severity"], title: string, message: string): HealthItem {
    return { id, severity, title, message };
}

function buildHealthReport(
    roster: RosterParseResult,
    imported: MedicalWorkbookImport,
    candidate: CandidateSheet,
    people: MedicalExamPerson[]
): HealthItem[] {
    const items = [...roster.issues, ...imported.issues];
    const rosterById = new Map(roster.people.map((person) => [person.employeeId, person]));
    const unmatched = people.filter((person) => !person.matchedRoster);
    if (unmatched.length) {
        items.push(healthItem("unmatched-roster", "warning", "花名册未匹配", `${unmatched.length} 人未按员工号匹配花名册：${unmatched.map((person) => `${person.name || "未填写姓名"}(${person.employeeId})`).join("、")}。`));
    }
    const nameMismatches = people.filter((person) => {
        const rosterPerson = rosterById.get(person.employeeId);
        return rosterPerson && rosterPerson.name && person.name && rosterPerson.name !== person.name;
    });
    if (nameMismatches.length) {
        items.push(healthItem("name-mismatch", "warning", "姓名不一致", `${nameMismatches.length} 人的待排名单姓名与花名册不一致。`));
    }
    const slotDates = new Set(imported.slots.map((slot) => slot.date));
    const outsideDates = people.filter((person) => person.examDate && !slotDates.has(person.examDate));
    if (outsideDates.length) {
        items.push(healthItem("outside-quota", "warning", "体检日不在额度表", `${outsideDates.length} 人的既有体检日不在已识别额度中。`));
    }
    const overloaded = buildLoads(people, imported.slots).filter((load) => load.remaining < 0);
    if (overloaded.length) {
        items.push(healthItem("over-capacity", "error", "既有安排超过额度", overloaded.map((load) => `${load.date} 超过额度 ${Math.abs(load.remaining)} 人`).join("；") + "。"));
    }
    const totalCapacity = imported.slots.reduce((sum, slot) => sum + slot.capacity, 0);
    if (people.length > totalCapacity) {
        items.push(healthItem("insufficient-capacity", "warning", "总额度不足", `待排 ${people.length} 人，当前月份总额度 ${totalCapacity} 人，将有 ${people.length - totalCapacity} 人无法预排。`));
    }
    const protectedCapacity = imported.slots.reduce((sum, slot) => sum + Math.max(slot.capacity - 1, 0), 0);
    items.push(
        healthItem("roster-summary", "info", "花名册识别", `已从 ${roster.sheetName} 识别 ${roster.people.length} 人，其中 RAMA=1 共 ${roster.people.filter((person) => person.isNorthAmericaLeader).length} 人。`),
        healthItem("candidate-summary", "info", "待排名单", `${candidate.name} 共 ${people.length} 人，其中北美带队 ${people.filter((person) => person.isNorthAmericaLeader).length} 人。`),
        healthItem("quota-summary", "info", "体检额度", `识别 ${imported.slots.length} 个可用体检日，总额度 ${totalCapacity} 人；第一轮保留每日 1 个名额后可排 ${protectedCapacity} 人。`)
    );
    return items;
}

function movePeople(people: MedicalExamPerson[], employeeIds: string[], targetDate: string, slots: QuotaSlot[]): MedicalExamPerson[] {
    const selected = new Set(employeeIds);
    if (!selected.size) throw new Error("请先选择人员。");
    const target = slots.find((slot) => slot.date === targetDate);
    if (!target) throw new Error("目标日期没有可用额度。");
    const next = people.map(clonePerson);
    const moving = next.filter((person) => selected.has(person.employeeId) && person.examDate !== targetDate);
    if (!moving.length) throw new Error("所选人员已经在目标日期。");
    const occupiedByOthers = next.filter((person) => person.examDate === targetDate && !selected.has(person.employeeId)).length;
    if (occupiedByOthers + moving.length > target.capacity) throw new Error("目标体检日额度不足。");
    moving.forEach((person) => {
        const from = person.examDate || "待分配";
        person.examDate = targetDate;
        person.locked = false;
        person.adjusted = true;
        person.adjustmentNotes.push(`移动：${from} → ${targetDate}`);
    });
    return next;
}

function unassignPeople(people: MedicalExamPerson[], employeeIds: string[]): MedicalExamPerson[] {
    const selected = new Set(employeeIds);
    if (!selected.size) throw new Error("请先选择人员。");
    const next = people.map(clonePerson);
    const moving = next.filter((person) => selected.has(person.employeeId) && person.examDate);
    if (!moving.length) throw new Error("所选人员都在待分配区。");
    moving.forEach((person) => {
        const from = person.examDate;
        person.examDate = "";
        person.locked = false;
        person.adjusted = true;
        person.adjustmentNotes.push(`移动：${from} → 待分配`);
    });
    return next;
}

export const MedicalExamLogic = {
    ...workbook,
    enrichPeople,
    buildLoads,
    allocatePeople,
    getWarning,
    buildHealthReport,
    movePeople,
    unassignPeople
};
