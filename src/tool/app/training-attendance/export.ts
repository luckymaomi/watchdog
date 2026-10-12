import type { CrmTemplateBuffers, GeneratedTrainingFile, TrainingAttendanceDraft } from "./models";
import { CrmTemplateSheet } from "./template";

async function bookingFile(bytes: Uint8Array, draft: TrainingAttendanceDraft): Promise<Uint8Array> {
    const sheet = await CrmTemplateSheet.open(bytes);
    sheet.prepareRows(3, draft.participants.length, "ABCDEFGHIJ");
    sheet.set("A1", `南货航开班${draft.sessionLabel}CRM培训名单（广州壹泉湾温泉酒店）`);
    sheet.set("K3", [draft.instructor1, draft.instructor2, draft.instructor3].join("、"));
    draft.participants.forEach((person, index) => {
        const row = index + 3;
        const values = [index + 1, "南货航飞行部", draft.sessionLabel, draft.startDate, draft.endDate,
            person.name, person.employeeId, person.rank, 777, ""];
        values.forEach((value, column) => sheet.set(`${"ABCDEFGHIJ"[column]}${row}`, value));
    });
    return sheet.save();
}

async function attendanceFile(bytes: Uint8Array, draft: TrainingAttendanceDraft, day: 1 | 2): Promise<Uint8Array> {
    const sheet = await CrmTemplateSheet.open(bytes);
    const location = sheet.text("C3").match(/[；;](.+)$/)?.[1]?.trim();
    if (!location) throw new Error("CRM 签到表模板缺少培训地点。");
    sheet.prepareRows(9, draft.participants.length, "ABCDE");
    sheet.set("C2", `CRM年度培训（${draft.sessionLabel}）`);
    sheet.set("C3", `${day === 1 ? draft.startDate : draft.endDate}；${location}`);
    sheet.set("C5", (day === 1 ? [draft.instructor1, draft.instructor2]
        : [draft.instructor1, draft.instructor2, draft.instructor3]).join("、"));
    draft.participants.forEach((person, index) => {
        const row = index + 9;
        sheet.set(`A${row}`, index + 1);
        sheet.set(`B${row}`, person.employeeId);
        sheet.set(`C${row}`, person.name);
    });
    return sheet.save();
}

export async function buildCrmFiles(templates: CrmTemplateBuffers, draft: TrainingAttendanceDraft): Promise<GeneratedTrainingFile[]> {
    const session = draft.sessionLabel.replace(/[\\/:*?"<>|]/g, "_").trim();
    const [booking, day1, day2] = await Promise.all([
        bookingFile(templates.booking, draft),
        attendanceFile(templates.attendanceDay1, draft, 1),
        attendanceFile(templates.attendanceDay2, draft, 2)
    ]);
    return [
        { fileName: `CRM（${session}）预订报名表.xlsx`, bytes: booking },
        { fileName: `CRM年度培训（${session}）签到表1.xlsx`, bytes: day1 },
        { fileName: `CRM年度培训（${session}）签到表2.xlsx`, bytes: day2 }
    ];
}
