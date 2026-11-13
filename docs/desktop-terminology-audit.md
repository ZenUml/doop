# 统一图编辑术语，审查 Layer / Frame / Canvas 等网页设计用词

状态：待审查；只建立术语清单和候选命名，本轮不改界面或协议。
优先级：P1

## 问题

用户指出 Layer 等术语不适合 Diagramly 桌面图编辑。当前文案沿用通用网页设计工具的对象名称，容易让用户把整张图、图里的节点/消息、HTML 派生结构混为一谈。

已从代码核实：左侧标题为 Layers、按钮为 New frame、搜索为 Search layers，右侧存在 Frame inspector、Design / HTML / Prototype，另有 Tokens、Memory、Workspace 和含义不同的 plan。

## 术语审查清单（以下均为候选）

| 现有术语                      | 需要澄清的含义                                             | 候选处理                                                                                                                               |
| ----------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Layer / Layers                | 左侧列的是整张图，还是图中的组成部分，或自由画布上的标注？ | 仅列整张图时考虑 Diagrams / 图表列表；混合内容时考虑 Contents / 内容。图内按实际对象叫参与者、消息、片段、节点、连线，不统称 HTML 图层 |
| Frame                         | 存放图源码和渲染结果的区域                                 | 图编辑流程考虑 Diagram / 图表；New frame → New diagram。整张图的排布边界与图内容分别命名                                               |
| Canvas                        | 一个可含多页、多张图的文档/画板                            | 候选 Document / 文档 或 Board / 画板，先确认产品结构；不直接把每个 canvas 都改叫一张图                                                 |
| Page / Pages                  | 文档中的页                                                 | 如保留多页，统一 Page / 页面，与文档和图明确区分                                                                                       |
| Inspector                     | 图属性、图源码、或 HTML 元素属性                           | 按实际内容叫 Properties / 属性、Diagram source / 图源码                                                                                |
| Tokens                        | 当前既有设计变量概念，也有认证 token                       | 保留主题能力时考虑 Style variables / 样式变量；认证 token 保持为凭据概念，两者不可混用                                                 |
| Memory / References / Rules   | Agent 读取的设计偏好和参考材料                             | 若功能保留，考虑 Diagram context / 图表上下文、参考资料、绘图规则，并验证实际内容是否相符                                              |
| Prototype / Present prototype | 网页交互原型还是图预览/展示                                | 若仅展示图，可用 Preview / Present；若仍是网页交互原型，归入功能取舍，不用改名掩盖功能差异                                             |
| Workspace                     | 带成员/套餐的团队空间，还是本地文件整理？                  | 团队能力保留时考虑 Team space / 团队空间；本地文档整理另行定义，不擅自叫文件夹                                                         |
| Connect a plan                | 连接模型使用账户，或查询 Diagramly 套餐？                  | 分成 Model connection / 模型连接 与 Diagramly plan / Diagramly 套餐；两种状态分别说明                                                  |
| Design / Designing            | 网页设计任务还是图表绘制/编辑？                            | 图流程考虑 Diagram / Create diagram / Edit diagram；依据具体动作命名                                                                   |
| Multiplayer / Agent           | 协作者和外部 AI 工具的状态                                 | 普通入口使用 Collaborators / 协作者、AI agent / AI 助手等易懂用词；MCP 在连接配置处可保留并解释                                        |

## 先确定对象关系

候选结构：文档 → 页面 → 图表；图表内部再按语言区分参与者/消息/片段或节点/连线。自由画布标注与派生 HTML 结构不自动成为图的领域对象。该结构仍需整体审查，并非本 issue 已定稿。

## 范围与验收

- 为每个词记录当前文案、位置、真实对象、候选新词、保留/删除决定及中英文对应；同一概念同名，不同概念不共用模糊词。
- 覆盖导航、按钮、空状态、导入/导出、帮助、快捷键、原生菜单、错误提示、无障碍名称和面向 Agent 的说明。
- 先审查功能清单；已经决定删除的功能不再做无用改名。
- 最后一轮统一改文案并验证真实用户流程，不逐个发现后立即修改。
- 用户可见术语与内部类型/存储字段/MCP 工具名分开处理。不能为改文案直接改 `Frame`、`canvasId`、`create_frame` 等协议，导致旧数据和现有 Agent 连接失效。

## 代码参考与关联

- Doop `src/lib/i18n/en/panels.ts`：Layers、New frame、Search layers、Tokens、Memory、Pages。
- `src/lib/i18n/en/inspector.ts`：Frame name、Design/HTML/Prototype、布局/设计变量/记忆文案。
- `src/lib/i18n/en/canvas.ts`、`home.ts`、`settings.ts`：canvas、frame、workspace、plan 及首页引导。
- `src/components/LayersPanel.tsx`、`Inspector.tsx`、`ElementPanel.tsx` 与 `shared/types.ts`：核对文案指向的实际对象。
- 与 #5（HTML 元素控件）、#12（首页/设置）、#13（产品能力范围）协同，纳入 #14 总清单。
