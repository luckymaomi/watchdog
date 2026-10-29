import JSZip from "jszip";
import { SECURITY_DOWNLOAD_TEMPLATES } from "./programs/security/templates";

export interface TrainingTemplateFile {
    source: string;
    target: string;
}

export const TRAINING_TEMPLATE_FILES: TrainingTemplateFile[] = [
    ...SECURITY_DOWNLOAD_TEMPLATES,
    { source: "../../../template/training-attendance/emergency/initial.docx", target: "应急训练/应急初训签到表模板.docx" },
    { source: "../../../template/training-attendance/emergency/recurrent.docx", target: "应急训练/应急复训签到表模板.docx" },
    { source: "../../../template/training-attendance/crm/booking.xlsx", target: "CRM/预订报名表.xlsx" },
    { source: "../../../template/training-attendance/crm/attendance-day1.xlsx", target: "CRM/签到表1.xlsx" },
    { source: "../../../template/training-attendance/crm/attendance-day2.xlsx", target: "CRM/签到表2.xlsx" },
    { source: "../../../template/training-attendance/dangerous-goods/instructor-survey.docx", target: "危险品复训/打1份 教员评估员调查问卷.docx" },
    { source: "../../../template/training-attendance/dangerous-goods/attitude.docx", target: "危险品复训/打1份 学员态度评价表.docx" },
    { source: "../../../template/training-attendance/dangerous-goods/post-survey.docx", target: "危险品复训/打3份 学员培训后调查问卷3份.docx" },
    { source: "../../../template/training-attendance/dangerous-goods/simulation.docx", target: "危险品复训/打N+1份 飞行机组任务模拟评估表.docx" },
    { source: "../../../template/training-attendance/dangerous-goods/exam.docx", target: "危险品复训/打N+1份 飞行机组试卷.docx" },
    { source: "../../../template/training-attendance/dangerous-goods/attendance.docx", target: "危险品复训/危险品（复训）签到表.docx" },
    { source: "../../../template/training-notice/B777机型机长转机型理论培训开课通知模板.docx", target: "开课通知/B777机型机长转机型理论培训开课通知模板.docx" },
    { source: "../../../template/training-notice/B777机型副驾驶转机型理论培训开课通知模板.docx", target: "开课通知/B777机型副驾驶转机型理论培训开课通知模板.docx" }
];

export async function buildTrainingTemplateArchive(
    fetcher: (source: string) => Promise<Uint8Array> = fetchTemplateBytes
): Promise<Uint8Array> {
    const zip = new JSZip();
    for (const file of TRAINING_TEMPLATE_FILES) zip.file(file.target, await fetcher(file.source));
    return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

async function fetchTemplateBytes(source: string): Promise<Uint8Array> {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`模板加载失败：${source}`);
    return new Uint8Array(await response.arrayBuffer());
}
