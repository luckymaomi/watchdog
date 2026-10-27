/** Use the browser's local calendar day, including when a page stays open overnight. */
export function documentationDownloadName(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `watchdog开发者文档-${year}-${month}-${day}.md`;
}

export function bindDocumentationDownloads(root: ParentNode = document): void {
    root.querySelectorAll<HTMLAnchorElement>("a[data-documentation-download]").forEach((link) => {
        const updateName = (): void => { link.download = documentationDownloadName(); };
        updateName();
        link.addEventListener("click", updateName);
    });
}
