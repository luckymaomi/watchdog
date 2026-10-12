import { buildTrainingTemplateArchive } from "./template-export";

// 培训签到表的入口页只负责选择培训项目；每个项目使用独立页面和独立模块。
document.querySelectorAll<HTMLAnchorElement>("[data-program-link]").forEach((link) => {
    link.addEventListener("click", () => { link.setAttribute("aria-busy", "true"); });
});

const exportButton = document.querySelector<HTMLButtonElement>("[data-template-export]");
if (exportButton) {
    exportButton.addEventListener("click", async () => {
        if (exportButton.disabled) return;
        exportButton.disabled = true;
        exportButton.textContent = "正在整理模板...";
        try {
            const bytes = await buildTrainingTemplateArchive();
            const buffer = new ArrayBuffer(bytes.byteLength);
            new Uint8Array(buffer).set(bytes);
            const url = URL.createObjectURL(new Blob([buffer], { type: "application/zip" }));
            const link = document.createElement("a");
            link.href = url;
            link.download = "培训签到表全部模板.zip";
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            exportButton.textContent = "已导出全部模板";
        } catch (error) {
            exportButton.textContent = error instanceof Error ? error.message : "模板导出失败";
        } finally {
            window.setTimeout(() => {
                exportButton.disabled = false;
                exportButton.textContent = "导出全部模板";
            }, 1800);
        }
    });
}
