# 看门狗系统文档

本目录同时面向使用工具的业务人员和重新实现系统的开发者。业务事实、输入输出和限制写在开发规格，操作步骤写在用户手册；系统架构、资源与验收由公共文档补齐。目录以 `src/tool/tools-data.ts` 的工具标识为关联键，不能用显示名称推断关联。

## 阅读顺序

1. [系统架构](system/architecture.md)：系统组成、运行边界、模块职责和数据流。
2. [重建与验收](system/reconstruction.md)：源码恢复与独立重建的区别、资源依赖和通过标准。
3. [规格核对](system/alignment.md)：27 个工具的文档、实现和测试证据，以及核查边界。
4. 按下表选择开发规格与用户手册。培训皇帝另读[培训规则](dev/training-workbench/training-rule-spec.md)，主题另读[主题规格](dev/ui-theme/spec.md)。
5. [文档维护与合并下载](system/documentation.md)：修改文档的要求和合并文件的生成契约。

## 工具目录

| 工具 | 标识 | 开发规格 | 用户手册 |
| --- | --- | --- | --- |
| 外籍航线批复录入 | foreign-route-approval | [开发](dev/foreign-route-approval/spec.md) | [操作](user/foreign-route-approval/manual.md) |
| 培训签到表 | training-attendance | [开发](dev/training-attendance/spec.md) | [操作](user/training-attendance/manual.md) |
| 菜鸟教程 | beginner-tutorial | [开发](dev/beginner-tutorial/spec.md) | [操作](user/beginner-tutorial/manual.md) |
| 培训皇帝 | training-workbench | [开发](dev/training-workbench/spec.md) | [操作](user/training-workbench/manual.md) |
| 换季学习 | seasonal-learning | [开发](dev/seasonal-learning/spec.md) | [操作](user/seasonal-learning/manual.md) |
| 审计之王 | audit-king | [开发](dev/audit-king/spec.md) | [操作](user/audit-king/manual.md) |
| 校对之王 | proof-king | [开发](dev/proof-king/spec.md) | [操作](user/proof-king/manual.md) |
| 姓名匹配员工号 | crew-match-name-id | [开发](dev/crew-match-name-id/spec.md) | [操作](user/crew-match-name-id/manual.md) |
| 酒店皇帝 | hotel-bill-check | [开发](dev/hotel-bill-check/spec.md) | [操作](user/hotel-bill-check/manual.md) |
| 重点人员标注 | focus-crew | [开发](dev/focus-crew/spec.md) | [操作](user/focus-crew/manual.md) |
| 航线班次统计 | crew-flight-stats | [开发](dev/crew-flight-stats/spec.md) | [操作](user/crew-flight-stats/manual.md) |
| 实力周报 | crew-strength-report | [开发](dev/crew-strength-report/spec.md) | [操作](user/crew-strength-report/manual.md) |
| Word 模板填充器 | word-template-filler | [开发](dev/word-template-filler/spec.md) | [操作](user/word-template-filler/manual.md) |
| PDF 工具 | pdf-tool | [开发](dev/pdf-tool/spec.md) | [操作](user/pdf-tool/manual.md) |
| PDF 加水印 | pdf-stamp | [开发](dev/pdf-stamp/spec.md) | [操作](user/pdf-stamp/manual.md) |
| 图片工具 | image-tool | [开发](dev/image-tool/spec.md) | [操作](user/image-tool/manual.md) |
| 印章生成器 | seal-generator | [开发](dev/seal-generator/spec.md) | [操作](user/seal-generator/manual.md) |
| 文本拼接助手 | text-joiner | [开发](dev/text-joiner/spec.md) | [操作](user/text-joiner/manual.md) |
| 人员结构统计 | personnel-structure-stats | [开发](dev/personnel-structure-stats/spec.md) | [操作](user/personnel-structure-stats/manual.md) |
| 运行资质比对 | qualification-roster-compare | [开发](dev/qualification-roster-compare/spec.md) | [操作](user/qualification-roster-compare/manual.md) |
| 英语汉语有效期比对 | language-validity-compare | [开发](dev/language-validity-compare/spec.md) | [操作](user/language-validity-compare/manual.md) |
| 国际航班资质反推 | international-flight-reverse | [开发](dev/international-flight-reverse/spec.md) | [操作](user/international-flight-reverse/manual.md) |
| 体检排班 | medical-exam-scheduler | [开发](dev/medical-exam-scheduler/spec.md) | [操作](user/medical-exam-scheduler/manual.md) |
| 锁班乞丐 | lock-entry-helper | [开发](dev/lock-entry-helper/spec.md) | [操作](user/lock-entry-helper/manual.md) |
| 飞行经历查询（乞丐版） | flight-stats-helper | [开发](dev/flight-stats-helper/spec.md) | [操作](user/flight-stats-helper/manual.md) |
| 珠海皇帝 | session-bill-check | [开发](dev/session-bill-check/spec.md) | [操作](user/session-bill-check/manual.md) |
| 自动点 OA 助手 | oa-read-helper | [开发](dev/oa-read-helper/spec.md) | [操作](user/oa-read-helper/manual.md) |

备忘录和开发者页属于系统公共能力，不计作这 27 个工具；其工程边界见系统架构。备忘录业务正文在 `public/memo/memos/`，不复制进开发规格。项目级 Agent Skill 是维护方法，不代替业务规格；独立 `piyanzi` 仓库也不是看门狗的运行时依赖。

## 文档能保证什么

文档记录当前实现契约，测试提供可执行的输入输出证据。文档合并下载不包含源码、字库、Excel/Word 模板、原始手册或生产数据。只保存合并文档不能保证逐字节复原系统；完整恢复必须同时保存重建说明中的资源。现有核对是入口、关键规则、输出和测试覆盖核查，没有完成一次脱离原源码的独立实现验收。
