import type { SecurityKind } from "./models";

export const SECURITY_TEMPLATE_PATHS = {
    initialChina: "../../../template/training-attendance/security/initial-china.docx",
    recurrentChina: "../../../template/training-attendance/security/recurrent-china.docx",
    initialTsa: "../../../template/training-attendance/security/initial-tsa.docx",
    recurrentTsa: "../../../template/training-attendance/security/recurrent-tsa.docx",
    permitRegister: "../../../template/training-attendance/security/initial-permit-register.docx",
    permitRecord: "../../../template/training-attendance/security/initial-permit-record.docx",
    initialExam: "../../../template/training-attendance/security/initial-exam.doc",
    recurrentExam: "../../../template/training-attendance/security/recurrent-exam.docx",
    tsaExam: "../../../template/training-attendance/security/tsa-exam.doc",
    permitExam: "../../../template/training-attendance/security/permit-exam.docx"
} as const;
export type SecurityTemplateKey = keyof typeof SECURITY_TEMPLATE_PATHS;
export type SecurityTemplates = Partial<Record<SecurityTemplateKey, Uint8Array>>;
export const SECURITY_EXAM_NAMES = {
    initialExam: "试题1（初训）安保初训测试BAACD 、ABB (9ABCD、10ABC、11ABC、12ABCD、13ABC、14ABCD、 15ABD、 16-19ABCD、20ACD).doc",
    recurrentExam: "试题1（复训）安保复训测试答案：第二题单选B，其余多选全选.docx",
    tsaExam: "试题2：全货机飞美机组安保清舱培训考试题（模板答案）.doc",
    permitExam: "试题3：空勤登机证管理规定培训考核CBAAB(A,B)(BCD,ACD,ABCD,ABDE)错对对错，6对.docx"
} as const;
export function securityTemplateKeys(kind: SecurityKind): SecurityTemplateKey[] {
    return kind === "initial"
        ? ["initialChina", "initialTsa", "permitRegister", "permitRecord", "initialExam", "tsaExam", "permitExam"]
        : ["recurrentChina", "recurrentTsa", "recurrentExam", "tsaExam"];
}

export const SECURITY_DOWNLOAD_TEMPLATES: { source: string; target: string }[] = [
    { source: SECURITY_TEMPLATE_PATHS.initialChina, target: "安保/初训/签到表1安保中国签到表.docx" },
    { source: SECURITY_TEMPLATE_PATHS.initialTsa, target: "安保/初训/签到表2安保美国TSA签到表.docx" },
    { source: SECURITY_TEMPLATE_PATHS.permitRegister, target: "安保/初训/签到表3空勤登机证管理规定培训登记表.docx" },
    { source: SECURITY_TEMPLATE_PATHS.permitRecord, target: "安保/初训/签到表4申办空勤登机证人员培训记录.docx" },
    { source: SECURITY_TEMPLATE_PATHS.initialExam, target: `安保/初训/${SECURITY_EXAM_NAMES.initialExam}` },
    { source: SECURITY_TEMPLATE_PATHS.tsaExam, target: `安保/初训/${SECURITY_EXAM_NAMES.tsaExam}` },
    { source: SECURITY_TEMPLATE_PATHS.permitExam, target: `安保/初训/${SECURITY_EXAM_NAMES.permitExam}` },
    { source: SECURITY_TEMPLATE_PATHS.recurrentChina, target: "安保/复训/签到表1安保中国签到表.docx" },
    { source: SECURITY_TEMPLATE_PATHS.recurrentTsa, target: "安保/复训/签到表2安保美国TSA签到表.docx" },
    { source: SECURITY_TEMPLATE_PATHS.recurrentExam, target: `安保/复训/${SECURITY_EXAM_NAMES.recurrentExam}` },
    { source: SECURITY_TEMPLATE_PATHS.tsaExam, target: `安保/复训/${SECURITY_EXAM_NAMES.tsaExam}` }
];
