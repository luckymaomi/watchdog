import type * as XLSX from "xlsx-js-style";
import { compareLanguageValidity } from "./comparison";
import { buildLanguageExportWorkbook } from "./export";
import { parseCaacWorkbook, parsePersonnelWorkbook } from "./workbook";
import { renderLanguageView, type LanguageViewState, ALL_LANGUAGES_VALUE, ATTENTION_VALUE } from "./view";

function get<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`页面缺少元素 ${id}`);
  return node as T;
}

document.addEventListener("DOMContentLoaded", () => {
  const XLSXApi = window.XLSX as unknown as typeof XLSX;
  const state: LanguageViewState = { result: null, selectedLanguage: ALL_LANGUAGES_VALUE, filter: ATTENTION_VALUE, personnelFileName: "", caacFileName: "", statusMessage: "请选择两份 Excel 文件。", statusKind: "info" };
  let personnelWorkbook: XLSX.WorkBook | null = null;
  let caacWorkbook: XLSX.WorkBook | null = null;
  const update = (): void => renderLanguageView(state);
  const readFile = async (file: File): Promise<XLSX.WorkBook> => XLSXApi.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const bindFile = (id: string, source: "personnel" | "caac"): void => {
    get<HTMLInputElement>(id).addEventListener("change", async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      state.statusMessage = `正在读取 ${file.name}...`;
      state.statusKind = "info";
      state.result = null;
      update();
      try {
        const workbook = await readFile(file);
        if (source === "personnel") { parsePersonnelWorkbook(XLSXApi, workbook); personnelWorkbook = workbook; state.personnelFileName = file.name; }
        else { parseCaacWorkbook(XLSXApi, workbook); caacWorkbook = workbook; state.caacFileName = file.name; }
        state.statusMessage = `${source === "personnel" ? "人员信息" : "局方数据"}文件读取成功。`;
        state.statusKind = "success";
      } catch (error) {
        if (source === "personnel") { personnelWorkbook = null; state.personnelFileName = ""; } else { caacWorkbook = null; state.caacFileName = ""; }
        state.statusMessage = error instanceof Error ? error.message : String(error);
        state.statusKind = "danger";
      }
      update();
    });
  };
  bindFile("personnelFile", "personnel");
  bindFile("caacFile", "caac");
  get<HTMLButtonElement>("compareButton").addEventListener("click", () => {
    if (!personnelWorkbook || !caacWorkbook) return;
    try {
      state.result = compareLanguageValidity(parsePersonnelWorkbook(XLSXApi, personnelWorkbook), parseCaacWorkbook(XLSXApi, caacWorkbook));
      state.selectedLanguage = ALL_LANGUAGES_VALUE;
      state.filter = ATTENTION_VALUE;
      state.statusMessage = "比对完成，默认显示需关注记录。";
      state.statusKind = "success";
    } catch (error) { state.statusMessage = error instanceof Error ? error.message : String(error); state.statusKind = "danger"; }
    update();
  });
  get<HTMLSelectElement>("languageSelect").addEventListener("change", (event) => { state.selectedLanguage = (event.target as HTMLSelectElement).value; update(); });
  get<HTMLSelectElement>("statusFilter").addEventListener("change", (event) => { state.filter = (event.target as HTMLSelectElement).value as LanguageViewState["filter"]; update(); });
  get<HTMLButtonElement>("exportButton").addEventListener("click", () => { if (state.result) XLSXApi.writeFile(buildLanguageExportWorkbook(XLSXApi, state.result), "英语汉语有效期比对.xlsx"); });
  update();
});
