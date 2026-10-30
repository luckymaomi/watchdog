import { canExportSecurity } from "./logic";
import type { SecurityDraft } from "./models";
import { fillSecurityTemplate } from "./template";
import { SECURITY_EXAM_NAMES, securityTemplateKeys, type SecurityTemplateKey, type SecurityTemplates } from "./templates";
import type { PreviewFile } from "../../document-preview";

export async function buildSecurityFiles(templates: SecurityTemplates, draft: SecurityDraft): Promise<PreviewFile[]> {
    if (!canExportSecurity(draft)) throw new Error("请先修正数据健康检查中的错误。");
    for (const key of securityTemplateKeys(draft.kind)) if (!templates[key]) throw new Error(`安保模板未加载：${key}`);
    const source = (key: SecurityTemplateKey): Uint8Array => templates[key]!;
    const initial = draft.kind === "initial";
    const files: PreviewFile[] = [
        { fileName: "签到表1安保中国签到表.docx", bytes: await fillSecurityTemplate(source(initial ? "initialChina" : "recurrentChina"), "china", { 教员: draft.instructor, 开课日期: draft.chinaDate }, draft.participants) },
        { fileName: "签到表2安保美国TSA签到表.docx", bytes: await fillSecurityTemplate(source(initial ? "initialTsa" : "recurrentTsa"), "tsa", { TSA日期: draft.tsaDate }, draft.participants) }
    ];
    if (initial) {
        files.push({ fileName: "签到表3空勤登机证管理规定培训登记表.docx", bytes: await fillSecurityTemplate(source("permitRegister"), "permitRegister", { 登机证日期: draft.permitDate }, draft.participants) });
        files.push({ fileName: "签到表4申办空勤登机证人员培训记录.docx", bytes: source("permitRecord").slice() });
    }
    const examKeys = initial ? ["initialExam", "tsaExam", "permitExam"] as const : ["recurrentExam", "tsaExam"] as const;
    for (const key of examKeys) files.push({ fileName: SECURITY_EXAM_NAMES[key], bytes: source(key).slice() });
    return files;
}
