---
name: memo-dev
description: 维护 watchdog 内的备忘录业务子站。用户要求新增、删除、重命名或调整飞行部日常备忘录或 Agent 操作说明，修改备忘录页面、导航、分类、下载、Markdown 正文、图片附件、维护说明或索引时使用。
---

# 备忘录维护

备忘录是 watchdog 下的独立静态子应用，用于查询飞行部日常工作记录，以及供 Agent 执行的操作说明。业务正文与项目级 Agent Skill（`.agents/skills/`）是两类内容，不能混放；页面上的“屁眼子”条目仍存放在 `public/memo/memos/`。

## 当前入口

- 页面：`public/memo/index.html`
- 样式：`public/memo/site.css`
- 页面逻辑：`src/memo/site.ts`
- 搜索规则：`src/memo/search.ts`
- 页面索引：`src/memo/memos-data.ts`
- 业务正文：`public/memo/memos/<数字>/MEMO.md`
- 模块规范：`public/memo/SPEC.md`
- 人工索引：`public/memo/MEMO_INDEX.md`
- 自动验证：`tests/smoke/memo.test.ts`

## 事实纪律

- 只写当前有效做法，不把旧入口、旧数据或历史处理方式写入正文。
- owner 提供原文且未要求整理时，按原文字句写入，不自行扩写或换口径。
- 不确定内容先确认，不把推测写成业务事实。
- 附件放在所属备忘录的 `assets/` 内，正文使用相对路径引用。

## 分类与下载

- 每条索引必须带 `audience`：`human`（人类看）或 `agent`（屁眼子）。变量名仍用 `agent`，界面显示为「屁眼子」。
- 页面提供「全部 / 人类看 / 屁眼子」筛选；搜索只在当前分类内进行。
- 每篇正文上方提供「下载 Markdown」；默认文件名为 `{name}.md`。
- Agent Skill 建议设置 `downloadName`（例如 `skill-副驾驶流转更新.md`），方便下载后直接给 Agent 使用。

## 维护流程

1. 先读取目标 `MEMO.md` 全文和关联图片，不只修改用户摘出的片段。
2. 修改正文时保持标准 frontmatter：`name`、`description`。
3. 新增、删除、重命名或调整顺序时，同步 `src/memo/memos-data.ts`、`public/memo/SPEC.md` 和 `public/memo/MEMO_INDEX.md`，并填写 `audience`；Agent Skill 按需填写 `downloadName`。
4. 页面布局、搜索、分类或 Markdown 渲染变化时，同步检查 `index.html`、`site.css`、`search.ts` 和 `site.ts`。
5. 备忘录用户事实写入模块 `SPEC.md`，通用贡献说明使用仓库根 `CONTRIBUTING.md`，Agent 执行流程写入本 Skill。
6. 不复制 Bootstrap、marked、许可证或第二套 Git；统一复用 watchdog 主仓库能力。
7. Markdown、HTML、CSS 和 JavaScript 文本统一使用 UTF-8 无 BOM。

## 验证

先运行：

```powershell
npm.cmd run build
npx.cmd vitest run tests/smoke/memo.test.ts tests/smoke/html-assets-all.test.ts tests/smoke/javascript-syntax.test.ts
```

收尾运行 `npm.cmd run verify`。真实页面的导航、分类筛选、下载、Markdown、表格和图片观感由 owner 人工确认。
