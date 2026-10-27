# 开发规格与用户手册核对

核对基准：2026-10-27 工作区的工具清单、应用入口、关键规则模块、静态资源与测试。27 个工具均存在开发规格和用户手册，文件齐备不等于所有业务分支已被证明。

本次核对覆盖文档全文、入口与资源定位，并对关键解析、匹配、分类、导出和恢复逻辑作代码/测试交叉检查。没有逐行证明全部实现与全部自然语言等价，没有运行真实内网，也没有重新读取两本原始航空手册确认教程全部条文。

表中的实现路径均相对于 `src/tool/app/<标识>/`，测试路径均相对于 `tests/tool/`；Python APP 路径另行注明。结果“关键契约对应”只表示下列检查点与现有证据相符。

| 标识 | 关键契约与实现证据 | 自动证据 | 核对结果与重建注意事项 |
| --- | --- | --- | --- |
| foreign-route-approval | `logic.ts`、`export.ts`：完整航司代码筛选、双向独立空值判断、机场展开与原模板输出 | `foreign-route-approval/` | 关键契约对应；机场映射与模板字节是独立必需资源，不能只保留列名 |
| training-attendance | `programs/`、`template-export.ts`：三个独立项目、按姓名文本顺序、模板填充和全部模板下载 | `training-attendance/` | 关键契约对应；CRM、危险品、开课通知的参数和模板不能合成同一规则 |
| beginner-tutorial | `content/`、`markdown-export.ts`、构建内容加载器：唯一恢复记录、来源关联与单篇导出 | `beginner-tutorial-*.test.ts` | 页面/内容装配契约对应；业务条文正确性须另对原始手册核验，spec 不含全部知识正文 |
| training-workbench | `scripts/`：规则、记录策略、六态分类、漏项、压力、负载、年度 CRM、更新各自模型 | `training-workbench/` | 关键契约对应；不能把测试通过等同于真实总表全量回放；规则数字以专门规范为准 |
| seasonal-learning | `logic.ts`、`balance-*.ts`、`health.ts`、`export.ts`：动态均衡组、恢复、移动和导出 | `seasonal-learning/` | 关键契约对应；文档中的真实样本人数是样本事实，不是程序常量，也不是本次回放结果 |
| audit-king | `state.ts`、`search-engine.ts`、`pdf-locator-*.ts`、`project-package.ts` | `audit-king/`、`project-archive.test.ts` | 检索、候选/依据分离和项目恢复契约对应；没有自动合规认定 |
| proof-king | `text-engine.ts`、`alignment-*.ts`、`navigation.ts`、`word-report.ts`、项目包 | `proof-king/` | 事件方向、顺序、人工决定及报告契约对应；算法阈值未在自然语言中完整枚举，独立实现需用分支样例验收 |
| crew-match-name-id | `logic.ts`、`table-editor.ts`、`export.ts`：必需表头、文本出现顺序、自定义列和选中范围 | `crew-match-name-id/logic.test.ts` | 关键契约对应；同名候选不自动消歧，导出技术等级为显式选项 |
| hotel-bill-check | `logic.ts`、`export-actions.ts`：同名最近日、同距保留首条、重复使用、证明超链接 | `hotel-bill-check/export.test.ts` | 已补明非法账单行跳过和短日期旧解析行为；短日期业务解释仍须 owner 确认，未改变程序 |
| focus-crew | `logic.ts`：第二行为重点表表头，第三行起读人，只识别配置类别 | `focus-crew/logic.test.ts` | 已修正文档“第二行起读数据”和未知类别仍保留的描述；姓名为实际匹配键 |
| crew-flight-stats | `logic.ts`、`main.ts`：固定 A/B 列、姓名单元格计数、导出矩阵 | `crew-flight-stats/logic.test.ts` | 已补明导出首列表头实际为“加分项”、零班为空白；部分命中的未知文字不进入未匹配列表 |
| crew-strength-report | `workbook.ts`、`logic.ts`、`export.ts`：表头扫描、仅运行人员、快照顺序与三个结果表 | `crew-strength-report/` | 关键契约对应；人员范围不同于人员结构统计，不能共用过滤条件 |
| word-template-filler | 配置解析、`generated-app-*.ts`、`app-packager.ts`：单份/批量和日期归一 | `word-template-filler/generated-batch.test.ts` | 关键契约对应；列表/循环禁用批量，生成应用另有自身分发契约 |
| pdf-tool | `shared.ts`、四模式模块：页码去重升序、排序、复制/渲染 | `pdf-tool/shared.test.ts` | 已修正“无独立测试”和指定输入顺序描述；现有独立测试只保护页码，未覆盖全部 PDF 转换 |
| pdf-stamp | `logic.ts`、canvas/上传/导出模块：毫米坐标、页范围与多规则叠加 | `pdf-stamp/logic.test.ts` | 核心规则对应；不同页面尺寸的最终视觉需人工抽查 |
| image-tool | 五模式模块、`shared.ts`：转换、压缩、缩放、裁剪、Base64 与 URL 释放 | `image-tool/shared.test.ts` | 页面能力与文档对应；测试主要保护资源生命周期，不能宣称五模式结果全面覆盖 |
| seal-generator | `logic.ts`、`fonts.ts`、`png.ts`、`reference.ts`：几何、字体嵌入、密度和底图排除 | `seal-generator/` | 关键契约对应；保留字库及授权，图形不构成电子签名 |
| text-joiner | `logic.ts`：Unicode 空白/标点/符号拆分，保序且不去重 | `text-joiner/logic.test.ts` | 关键契约对应；输出分隔符原样使用 |
| personnel-structure-stats | `logic.ts`、`report.ts`、`docx-report.ts`：母数、八表、百分比闭合和目标 XML 写入 | `personnel-structure-stats/` | 关键契约对应；只改 Word 指定表与标题，其他内容沿用模板不代表已被统计验证 |
| qualification-roster-compare | `workbook.ts`、`comparison.ts`、`export.ts`：员工号与资质关系集合 | `qualification-roster-compare/` | 关键契约对应；姓名不一致是问题，仍可归关系双方一致，不比较两侧角色等价 |
| language-validity-compare | 同名模块：姓名、原值/日期分离、逐语言状态、重复姓名首条 | `language-validity-compare/` | 关键契约对应；均无有效期列入一致汇总，非日期文字不等于有效期已确认 |
| international-flight-reverse | `logic.ts`、`workbook.ts`、`export.ts`：截止、阶段去重、地区机场和目标月末 | `international-flight-reverse/` | 关键契约对应；美国/北美配置互认，建议有效期不是自动资格判定 |
| medical-exam-scheduler | `logic.ts`、工作簿与导出：非北美自动、每天两名保留、容量和人工移动 | `medical-exam-scheduler/` | 关键契约对应；随机分配不能要求每次人员顺序相同，测试应固定随机源或验不变量 |
| lock-entry-helper | `public/tool/app/lock-entry-helper/lock_entry/`：分步 API、智能路由、回退与实时结果 | `lock-entry-helper/`、`tests/python/lock_entry_tests/` | 本地逻辑/接口有证据；生产提交和 DOM 仍依赖真实门户，未在本次执行 |
| flight-stats-helper | `public/tool/app/flight-stats-helper/flight_stats/`：动态表头、单 worker 复用和双结果 | `tests/python/` 的飞行经历测试 | 本地接口/解析/导出有证据；内网查询未实测，APP 不在 src，不能按目录惯例找错事实源 |
| session-bill-check | `logic.ts`：首个场次 sheet、固定账单 sheet、人次和四张证据表 | `session-bill-check/logic.test.ts` | 已补明场次只读第一个 sheet；金额、课程和日期不参与判断 |
| oa-read-helper | `public/tool/app/oa-read-helper/app.py`、`shell.ts`：下载壳与 OA 终端流程 | 静态资产与 Python 语法检查 | 已修正不存在的 src APP 路径；无专门业务自动测试，内网成功计数不能在本次确认 |

## 公共契约核对

- 首页当前按工具清单顺序，外籍航线批复录入第一；Beta 工具有菜鸟教程、校对之王和体检排班；四个弃用工具仍显示且可点。文档与清单对应。
- 根 `tsconfig.json` 当前开启 `noImplicitAny`；“保留 false”的文字与当前配置不符，按配置更新。
- 生产页面 ESM 与独立工具 IIFE 是两种交付，不是相互冲突的模块规范。独立包有 runtime 适配 file 协议资源。
- `spec/dev/esm-delivery/legacy-build-baseline.json` 是原有构建基线资料，不是当前测试总数、现行产物哈希或可独立重放的业务样本。
- 合并文档验证属于新增交付契约：扫描所有 spec 文本、保留正文、转换内部链接、记录路径/哈希，下载文件名为英文。标准测试的构建前置重新生成文件。

## 仍不明确

酒店账单旧解析器对短日期及宽松字符串的解释是否符合当前业务输入；缺少 owner 的新口径与原始样本，本文只如实描述现有行为。全部工具的真实输入结果、内网当前 DOM、教程对现行手册逐条一致性和独立重建完备性也不在本次证据范围内。这些边界不能用“27 对文档齐全”或“全量测试通过”抹去。
