import type { LanguageComparisonResult, LanguageDetail, LanguageStatus } from "./models";

export const ALL_LANGUAGES_VALUE = "全部";
export const ATTENTION_VALUE = "需关注";

export interface LanguageViewState {
  result: LanguageComparisonResult | null;
  selectedLanguage: string;
  filter: "all" | typeof ATTENTION_VALUE | LanguageStatus;
  personnelFileName: string;
  caacFileName: string;
  statusMessage: string;
  statusKind: "info" | "success" | "danger";
}

const attentionStatuses = new Set<LanguageStatus>(["日期不一致", "仅人员信息", "仅局方数据", "人员未匹配", "局方未匹配"]);

export function filterLanguageDetails(details: LanguageDetail[], selectedLanguage: string, filter: LanguageViewState["filter"]): LanguageDetail[] {
  return details.filter((detail) => {
    if (selectedLanguage !== ALL_LANGUAGES_VALUE && detail.language !== selectedLanguage) return false;
    if (filter === "all") return true;
    if (filter === ATTENTION_VALUE) return attentionStatuses.has(detail.status);
    return detail.status === filter;
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character));
}

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`页面缺少元素 ${id}`);
  return node as T;
}

export function renderLanguageView(state: LanguageViewState): void {
  element<HTMLButtonElement>("compareButton").disabled = !(state.personnelFileName && state.caacFileName);
  element<HTMLButtonElement>("exportButton").disabled = !state.result;
  element<HTMLElement>("personnelFileName").textContent = state.personnelFileName || "尚未选择";
  element<HTMLElement>("caacFileName").textContent = state.caacFileName || "尚未选择";
  const status = element<HTMLElement>("statusLine");
  status.textContent = state.statusMessage;
  status.className = `status-line status-${state.statusKind}`;
  const resultSection = element<HTMLElement>("resultSection");
  resultSection.hidden = !state.result;
  if (!state.result) return;
  const result = state.result;
  const totals = result.totals;
  element<HTMLElement>("summaryGrid").innerHTML = [
    ["人员信息人数", totals.personnelPeople], ["局方人数", totals.caacPeople], ["姓名匹配", totals.matchedPeople], ["需关注项", totals.attentionCount], ["数据问题", totals.issueCount]
  ].map(([label, value]) => `<div class="summary-item"><span>${label}</span><strong>${value}</strong></div>`).join("");
  const languageSelect = element<HTMLSelectElement>("languageSelect");
  languageSelect.innerHTML = `<option value="${ALL_LANGUAGES_VALUE}">全部语言</option><option value="英语">英语</option><option value="汉语">汉语</option>`;
  languageSelect.value = state.selectedLanguage;
  const filterSelect = element<HTMLSelectElement>("statusFilter");
  filterSelect.value = state.filter;
  const filtered = filterLanguageDetails(result.details, state.selectedLanguage, state.filter);
  const selectedSummaries = result.summaries.filter((summary) => state.selectedLanguage === ALL_LANGUAGES_VALUE || summary.language === state.selectedLanguage);
  element<HTMLElement>("selectedSummary").textContent = selectedSummaries.map((summary) => `${summary.language}：匹配 ${summary.matchedPeople} 人，日期不一致 ${summary.dateDifferenceCount}，需关注 ${summary.attentionCount}`).join("；");
  element<HTMLElement>("detailCount").textContent = String(filtered.length);
  element<HTMLElement>("detailBody").innerHTML = filtered.length ? filtered.map(renderDetailRow).join("") : `<tr><td colspan="11" class="empty-cell">没有符合条件的记录</td></tr>`;
  element<HTMLElement>("issueCount").textContent = String(result.issues.length);
  element<HTMLElement>("issueBody").innerHTML = result.issues.length ? result.issues.map((item) => `<tr><td>${item.source === "personnel" ? "人员信息" : "局方数据"}</td><td>${escapeHtml(item.kind)}</td><td>${escapeHtml(item.language || "")}</td><td>${escapeHtml(item.name || "")}</td><td>${escapeHtml(item.message)}</td><td>${escapeHtml(item.sheetName)} 第${item.rowNumber || ""}行</td></tr>`).join("") : `<tr><td colspan="6" class="empty-cell">没有数据问题</td></tr>`;
}

function renderDetailRow(detail: LanguageDetail): string {
  const statusClass = detail.status === "双方一致" || detail.status === "均无有效期" ? "status-ok" : detail.status === "日期不一致" ? "status-diff" : "status-warning";
  return `<tr><td>${escapeHtml(detail.name)}</td><td>${detail.language}</td><td><span class="status-tag ${statusClass}">${detail.status}</span></td><td>${escapeHtml(detail.employeeId || "-")}</td><td>${escapeHtml(detail.pilotId || "-")}</td><td>${escapeHtml(detail.personnelValue || "-")}</td><td>${escapeHtml(detail.caacValue || "-")}</td><td>${escapeHtml(detail.personnelDate || "-")}</td><td>${escapeHtml(detail.caacDate || "-")}</td><td>${escapeHtml(detail.personnelSource || "-")}</td><td>${escapeHtml(detail.caacSource || "-")}</td></tr>`;
}
