# 印章生成器开源调研

两份 MIT 项目仅供实现参考，不作为工具运行依赖。目录内保存各项目 README、完整许可证和核心源码快照；本仓库的印章工具使用独立 SVG 实现，不引入上游框架、付费或水印功能。

| 项目 | 快照提交 | 已核对能力 | 本工具取舍 |
| --- | --- | --- | --- |
| [lin31523/electronic-seal-generator](https://github.com/lin31523/electronic-seal-generator) | `8517b4564a33e3555ffa17e8f350b638bde6da50` | React/Canvas；圆、椭圆、方形章；颜色、字体、编号、旧化；包含付费水印流程 | 保留圆章参数和即时预览思路，使用仓库现有静态工具结构 |
| [frankiez/seal-generator](https://github.com/frankiez/seal-generator) | `fa841f4f79fdac1e986922680411806705010916` | TypeScript/Canvas；圆圈、五角星、上弧文字、横排文字 | 参考几何组织；单字符圆弧独立处理，SVG 与 PNG 共用同一章面 |

圆圈、名称、五角星、章名和编号分别调整。参考图片在章面下方移动、缩放和旋转，只用于对齐，不进入导出；样式数字可直接输入并扩展滑块范围，不自动缩小文字。

内置朱雀仿宋、霞鹜文楷、Noto Serif SC、Noto Sans SC、站酷小薇，均按 OFL 授权分发。来源、版本、转换方法及 SHA256 见 [sources.json](../../public/tool/app/seal-generator/fonts/sources.json)，各完整授权随字库保存。字体按需加载，SVG 内嵌实际选用字库。用户参考图的准确字体未确认，工具提供手动对照和调整。

正式行为规格见 [印章生成器规格](../../spec/dev/seal-generator/spec.md)。
