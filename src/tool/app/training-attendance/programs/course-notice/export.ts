import JSZip from "jszip";
import { canExportCourseNotice } from "./logic";
import type { CourseNoticeDraft, CourseNoticeFile } from "./models";

export const COURSE_NOTICE_TEMPLATES: Record<string, string> = {
    机长: "../../../template/training-notice/B777机型机长转机型理论培训开课通知模板.docx",
    副驾驶: "../../../template/training-notice/B777机型副驾驶转机型理论培训开课通知模板.docx"
};

function escapeXml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function buildCourseNoticeFile(source: Uint8Array, draft: CourseNoticeDraft): Promise<CourseNoticeFile> {
    if (!canExportCourseNotice(draft)) throw new Error("请先修正数据健康检查中的错误。");
    const zip = await JSZip.loadAsync(source);
    const part = zip.file("word/document.xml");
    if (!part) throw new Error("开课通知模板缺少 Word 正文。");
    const found = new Set<string>();
    const xml = (await part.async("string")).replace(/(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/g, (_match, open: string, text: string, close: string) => {
        const filled = text.replace(/\{([^{}]+)\}/g, (_marker, field: string) => {
            if (!Object.prototype.hasOwnProperty.call(draft.fields, field)) throw new Error(`开课通知模板存在未知字段：${field}`);
            found.add(field);
            return escapeXml(draft.fields[field]);
        });
        return open + filled + close;
    });
    for (const field of Object.keys(draft.fields)) {
        if (!found.has(field)) throw new Error(`开课通知模板缺少字段：${field}`);
    }
    zip.file("word/document.xml", xml);
    return {
        fileName: `${draft.title.replace(/[\\/:*?"<>|]/g, "_")}.docx`,
        bytes: await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" })
    };
}
