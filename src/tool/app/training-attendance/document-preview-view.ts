import { buildDocumentPreview, type PreviewFile, type PreviewXlsx } from "./document-preview";

export interface DocumentPreviewController {
    update(key: string, ready: boolean): void;
}

export function mountDocumentPreview(buildFiles: () => Promise<PreviewFile[]>, xlsx: PreviewXlsx): DocumentPreviewController {
    const exportButton = document.getElementById("exportButton");
    const main = document.querySelector("main");
    if (!(exportButton instanceof HTMLButtonElement) || !main) throw new Error("页面缺少资料预览入口。");
    const actions = document.createElement("div");
    actions.className = "document-actions";
    exportButton.before(actions);
    const button = document.createElement("button");
    button.type = "button"; button.className = "btn btn-outline-primary"; button.textContent = "在线预览"; button.disabled = true;
    actions.append(button, exportButton);
    const panel = document.createElement("section");
    panel.className = "panel document-preview-panel";
    panel.hidden = true;
    panel.innerHTML = '<div class="section-head"><div><h2>资料在线预览</h2><p class="section-summary">预览生成资料的正文、表格和图片，完整排版及分页以下载文件为准。</p></div><button type="button" class="btn btn-outline-secondary" data-close>收起预览</button></div><label class="field-group"><span>选择资料</span><select class="form-select" aria-label="选择预览资料"></select></label><p class="section-summary" role="status" data-status></p><div class="document-preview-scroll"><article class="document-preview-paper" aria-label="资料内容"></article></div>';
    main.append(panel);
    const select = panel.querySelector("select")!;
    const status = panel.querySelector<HTMLElement>("[data-status]")!;
    const content = panel.querySelector("article")!;
    let files: PreviewFile[] = [];
    let key = "";
    let version = 0;
    let selection = 0;
    let pending = false;
    let ready = false;
    const syncButton = (): void => {
        button.disabled = pending || !ready;
        button.textContent = pending ? "正在生成预览..." : "在线预览";
    };
    async function showFile(): Promise<void> {
        const file = files[Number(select.value)];
        if (!file) return;
        const request = ++selection;
        const generation = version;
        content.replaceChildren();
        status.textContent = `正在读取 ${file.fileName}...`;
        try {
            const html = await buildDocumentPreview(file, xlsx);
            if (request !== selection || generation !== version) return;
            content.innerHTML = html;
            status.textContent = `共 ${files.length} 份资料 · ${file.fileName}`;
        } catch (error) {
            if (request !== selection || generation !== version) return;
            status.textContent = `预览失败：${error instanceof Error ? error.message : String(error)}，可重新选择资料重试。`;
        }
    }
    button.addEventListener("click", async () => {
        if (!ready || pending) return;
        const request = ++version;
        pending = true; syncButton();
        panel.hidden = false;
        status.textContent = "正在生成资料...";
        content.replaceChildren(); select.replaceChildren();
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
        try {
            const generated = await buildFiles();
            if (request !== version) return;
            files = generated;
            files.forEach((file, index) => {
                const option = document.createElement("option");
                option.value = String(index); option.textContent = file.fileName;
                select.append(option);
            });
            if (!files.length) throw new Error("没有可预览的资料。");
            await showFile();
        } catch (error) {
            if (request === version) status.textContent = `生成预览失败：${error instanceof Error ? error.message : String(error)}，请点击在线预览重试。`;
        } finally {
            if (request === version) { pending = false; syncButton(); }
        }
    });
    select.addEventListener("change", () => void showFile());
    panel.querySelector("[data-close]")!.addEventListener("click", () => { panel.hidden = true; });
    return {
        update(nextKey, nextReady): void {
            ready = nextReady;
            if (nextKey !== key) {
                key = nextKey; version++; selection++; pending = false; files = [];
                select.replaceChildren(); content.replaceChildren();
                status.textContent = "参数或名单已变化，请重新点击在线预览。";
            }
            syncButton();
        }
    };
}
