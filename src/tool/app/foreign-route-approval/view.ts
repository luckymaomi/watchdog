import type { Analysis, Leg } from "./models";

const byId = (id: string): HTMLElement => document.getElementById(id)!;
export function message(text: string, error = false): void {
  const node = byId("status");
  node.className = `alert ${error ? "alert-danger" : "alert-info"} mb-0`;
  node.textContent = text;
}
export function clearResult(): void {
  byId("results").hidden = true;
  byId("summary").replaceChildren();
  byId("issues").replaceChildren();
  byId("previewBody").replaceChildren();
}
export function showResult(result: Analysis): void {
  byId("results").hidden = false;
  byId("summary").textContent = `开放 ${result.openCount} 条 + 临开 ${result.temporaryCount} 条 = 合并 ${result.merged.length} 条；去程 ${result.go.length} 行，回程 ${result.back.length} 行；源去程空跳过 ${result.skippedGo} 条，源回程空跳过 ${result.skippedBack} 条，多机场命中 ${result.multiCount} 条。`;
  const issues = byId("issues");
  issues.replaceChildren();
  for (const issue of result.issues) {
    const li = document.createElement("li");
    li.textContent = `${issue.severity === "error" ? "错误" : "提示"} · ${issue.source}${issue.sourceRow ? ` 第 ${issue.sourceRow} 行` : ""}：${issue.message}`;
    issues.append(li);
  }
  if (!result.issues.length) issues.textContent = "未发现输入问题或未知机场。";
  showPreview(result, "merged");
}
export function showPreview(result: Analysis, kind: string): void {
  const merged = kind === "merged";
  const headers = merged ? ["序号", "公司", "航站A", "航站B", "去程", "回程", "台湾飞行员", "来源位置"] : ["序号", "公司", "起飞航站", "落地航站", "航路码", "台湾飞行员", "多机场展开", "来源位置"];
  const head = byId("previewHead");
  const tr = document.createElement("tr");
  for (const name of headers) { const th = document.createElement("th"); th.textContent = name; tr.append(th); }
  head.replaceChildren(tr);
  const body = byId("previewBody");
  const fragment = document.createDocumentFragment();
  const rows = kind === "go" ? result.go : kind === "back" ? result.back : result.merged;
  rows.forEach((item, i) => {
    const row = document.createElement("tr");
    const values = "stationA" in item
      ? [i + 1, item.company, item.stationA, item.stationB, item.go, item.back, item.tw, `${item.source} 第 ${item.sourceRow} 行`]
      : [i + 1, item.company, item.left, item.right, item.code, item.tw, item.multi ? "是" : "否", `${item.source} 第 ${item.sourceRow} 行`];
    for (const value of values) { const td = document.createElement("td"); td.textContent = String(value); row.append(td); }
    if (!merged && (item as Leg).multi) row.cells[4].className = "text-primary";
    fragment.append(row);
  });
  body.replaceChildren(fragment);
}
