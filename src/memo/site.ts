import "../tool/support-shell";
import type { MemoAudience, MemoItem, MemoSearchResult } from "./models";
import * as searchEngine from "./search";
import { memoItems as items } from "./memos-data";

type AudienceFilter = "all" | MemoAudience;

const list = requireElement("memoList", HTMLElement);
const content = requireElement("content", HTMLElement);
const sidebarMenu = requireElement("sidebarMenu", HTMLElement);
const searchInput = requireElement("memoSearch", HTMLInputElement);
const searchStatus = requireElement("searchStatus", HTMLElement);
const audienceFilter = requireElement("audienceFilter", HTMLElement);
const markdownCache = new Map<string, Promise<string>>();
let renderVersion = 0;
let searchVersion = 0;
let searchTimer: number | undefined;
let currentAudience: AudienceFilter = "all";
let activeMarkdown = "";

function requireElement<T extends HTMLElement>(id: string, Type: { new (): T }): T {
  const element = document.getElementById(id);
  if (!(element instanceof Type)) throw new Error(`页面缺少必要元素：${id}`);
  return element;
}

function hashName(): string {
  try {
    return decodeURIComponent(location.hash.replace(/^#/, ""));
  } catch {
    return "";
  }
}

function visibleItems(): MemoItem[] {
  if (currentAudience === "all") return items;
  return items.filter((item) => item.audience === currentAudience);
}

function findItem(name?: string, pool = visibleItems()): MemoItem | undefined {
  return pool.find((item) => item.name === name) || pool[0];
}

function basePath(path: string): string {
  return path.slice(0, path.lastIndexOf("/") + 1);
}

function downloadFileName(item: MemoItem): string {
  return item.downloadName || `${item.name}.md`;
}

function triggerDownload(filename: string, markdown: string): void {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function fetchMarkdown(item: MemoItem): Promise<string> {
  const cached = markdownCache.get(item.path);
  if (cached) return cached;

  const request = fetch(encodeURI(item.path)).then((response) => {
    if (!response.ok) throw new Error(`加载失败：${response.status}`);
    return response.text();
  });
  markdownCache.set(item.path, request);
  request.catch(() => markdownCache.delete(item.path));
  return request;
}

function fixImages(html: string, base: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll<HTMLImageElement>("img[src]").forEach((image) => {
    const src = image.getAttribute("src") || "";
    if (/^(https?:)?\/\//.test(src) || src.startsWith("/") || src.startsWith("data:")) return;
    image.setAttribute("src", base + src.replace(/^\.\//, ""));
  });
  return template.innerHTML;
}

function wrapTables(): void {
  content.querySelectorAll<HTMLTableElement>("table").forEach((table) => {
    if (table.parentElement?.classList.contains("table-wrap")) return;
    const wrapper = document.createElement("div");
    wrapper.className = "table-wrap";
    table.parentNode?.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  });
}

function highlightContent(value: string): void {
  const query = searchEngine.normalizeQuery(value);
  if (!query) return;

  const nodes: Text[] = [];
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest("mark, script, style, .memo-toolbar")) return NodeFilter.FILTER_REJECT;
      return node.nodeValue?.toLocaleLowerCase("zh-CN").includes(query)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    }
  });
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  nodes.forEach((node) => {
    const source = node.nodeValue || "";
    const lowerSource = source.toLocaleLowerCase("zh-CN");
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    let matchIndex = lowerSource.indexOf(query);

    while (matchIndex >= 0) {
      fragment.append(source.slice(cursor, matchIndex));
      const mark = document.createElement("mark");
      mark.className = "search-highlight";
      mark.textContent = source.slice(matchIndex, matchIndex + query.length);
      fragment.append(mark);
      cursor = matchIndex + query.length;
      matchIndex = lowerSource.indexOf(query, cursor);
    }
    fragment.append(source.slice(cursor));
    node.replaceWith(fragment);
  });

  content.querySelector<HTMLElement>(".search-highlight")?.scrollIntoView({ block: "center" });
}

function audienceLabel(audience: MemoAudience): string {
  return audience === "agent" ? "Agent看" : "人类看";
}

function createNavLink(item: MemoItem, snippet?: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.href = `#${encodeURIComponent(item.name)}`;
  link.className = `nav-link${snippet ? " search-result" : ""}`;
  link.dataset.memoName = item.name;

  const head = document.createElement("span");
  head.className = "memo-link-head";

  const title = document.createElement("span");
  title.className = snippet ? "search-result-name" : "memo-link-title";
  title.textContent = item.name;
  head.appendChild(title);

  const badge = document.createElement("span");
  badge.className = `memo-audience-badge memo-audience-${item.audience}`;
  badge.textContent = audienceLabel(item.audience);
  head.appendChild(badge);
  link.appendChild(head);

  if (snippet) {
    const summary = document.createElement("span");
    summary.className = "search-result-snippet";
    summary.textContent = snippet;
    link.appendChild(summary);
  }
  return link;
}

function renderToolbar(item: MemoItem): HTMLElement {
  const toolbar = document.createElement("div");
  toolbar.className = "memo-toolbar";

  const downloadBtn = document.createElement("button");
  downloadBtn.type = "button";
  downloadBtn.className = "memo-download-button";
  downloadBtn.textContent = "下载 Markdown";
  downloadBtn.addEventListener("click", () => {
    triggerDownload(downloadFileName(item), activeMarkdown);
  });

  const badge = document.createElement("span");
  badge.className = `memo-audience-badge memo-audience-${item.audience}`;
  badge.textContent = audienceLabel(item.audience);

  toolbar.append(downloadBtn, badge);
  return toolbar;
}

function renderFullList(): void {
  const pool = visibleItems();
  if (!pool.length) {
    const empty = document.createElement("div");
    empty.className = "search-empty";
    empty.textContent = "当前分类下没有备忘录";
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...pool.map((item) => createNavLink(item)));
  markActive(hashName() || pool[0]?.name || "");
}

function renderSearchResults(results: MemoSearchResult[]): void {
  if (!results.length) {
    const empty = document.createElement("div");
    empty.className = "search-empty";
    empty.textContent = "没有找到相关内容";
    list.replaceChildren(empty);
    return;
  }
  const byName = new Map(visibleItems().map((item) => [item.name, item]));
  list.replaceChildren(
    ...results.flatMap((result) => {
      const item = byName.get(result.name);
      return item ? [createNavLink(item, result.snippet)] : [];
    })
  );
  markActive(hashName());
}

function markActive(name: string): void {
  list.querySelectorAll<HTMLElement>("[data-memo-name]").forEach((link) => {
    link.classList.toggle("active", link.dataset.memoName === name);
  });
}

function closeMobileMenu(): void {
  if (window.innerWidth >= 768 || typeof bootstrap === "undefined") return;
  bootstrap.Collapse.getOrCreateInstance(sidebarMenu, { toggle: false }).hide();
}

function syncAudienceButtons(): void {
  audienceFilter.querySelectorAll<HTMLButtonElement>("[data-audience]").forEach((button) => {
    const selected = button.dataset.audience === currentAudience;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", selected ? "true" : "false");
  });
}

async function loadMemo(name?: string, value = searchInput.value): Promise<void> {
  const pool = visibleItems();
  const item = findItem(name || hashName(), pool);
  if (!item) {
    activeMarkdown = "";
    content.textContent = currentAudience === "all" ? "没有备忘录。" : "当前分类下没有备忘录。";
    return;
  }

  const version = ++renderVersion;
  document.title = `${item.name} - 备忘录`;
  markActive(item.name);
  content.textContent = "正在加载...";

  try {
    const markdown = await fetchMarkdown(item);
    if (version !== renderVersion) return;
    activeMarkdown = markdown;
    const body = document.createElement("div");
    body.className = "memo-body";
    body.innerHTML = fixImages(marked.parse(searchEngine.stripFrontmatter(markdown)), basePath(item.path));
    content.replaceChildren(renderToolbar(item), body);
    wrapTables();
    highlightContent(value);
  } catch (error) {
    if (version !== renderVersion) return;
    activeMarkdown = "";
    content.textContent = error instanceof Error ? error.message : String(error);
  }
}

function selectMemo(name: string): void {
  const nextHash = `#${encodeURIComponent(name)}`;
  if (location.hash === nextHash) {
    void loadMemo(name);
  } else {
    location.hash = nextHash;
  }
  closeMobileMenu();
}

async function runSearch(value: string, version: number): Promise<void> {
  try {
    const pool = visibleItems();
    const sources = await Promise.all(
      pool.map(async (item) => ({
        name: item.name,
        path: item.path,
        markdown: await fetchMarkdown(item)
      }))
    );
    if (version !== searchVersion) return;

    const results = searchEngine.search(sources, value);
    renderSearchResults(results);
    searchStatus.textContent = results.length ? `${results.length} 个备忘录命中` : "没有命中";
    if (!results.length) return;

    const currentName = hashName();
    const selected = results.find((result) => result.name === currentName) || results[0];
    if (selected.name !== currentName) {
      history.replaceState(null, "", `#${encodeURIComponent(selected.name)}`);
    }
    await loadMemo(selected.name, value);
  } catch (error) {
    if (version !== searchVersion) return;
    searchStatus.textContent = error instanceof Error ? error.message : String(error);
  }
}

function handleSearchInput(): void {
  const value = searchInput.value;
  const query = searchEngine.normalizeQuery(value);
  const version = ++searchVersion;
  if (searchTimer !== undefined) window.clearTimeout(searchTimer);

  if (!query) {
    searchStatus.textContent = "";
    renderFullList();
    void loadMemo(hashName(), "");
    return;
  }

  searchStatus.textContent = "正在搜索...";
  searchTimer = window.setTimeout(() => void runSearch(value, version), 120);
}

function applyAudienceFilter(next: AudienceFilter): void {
  if (currentAudience === next) return;
  currentAudience = next;
  syncAudienceButtons();

  const pool = visibleItems();
  const currentName = hashName();
  const stillVisible = pool.some((item) => item.name === currentName);
  if (!stillVisible && pool[0]) {
    history.replaceState(null, "", `#${encodeURIComponent(pool[0].name)}`);
  } else if (!pool.length) {
    history.replaceState(null, "", location.pathname + location.search);
  }

  const query = searchEngine.normalizeQuery(searchInput.value);
  if (query) {
    handleSearchInput();
    return;
  }
  renderFullList();
  void loadMemo(hashName(), "");
}

list.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const link = target.closest<HTMLElement>("[data-memo-name]");
  const name = link?.dataset.memoName;
  if (!name) return;
  event.preventDefault();
  selectMemo(name);
});
searchInput.addEventListener("input", handleSearchInput);
audienceFilter.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLButtonElement>("[data-audience]");
  const value = button?.dataset.audience;
  if (value !== "all" && value !== "human" && value !== "agent") return;
  applyAudienceFilter(value);
});
window.addEventListener("hashchange", () => void loadMemo());

syncAudienceButtons();
renderFullList();
void loadMemo();
