# Diagramly 桌面功能审查清单

按用户最新要求：本轮只列清单和登记 issues，完成审查后再统一实施删减。刚才尝试的 UI 删减已全部还原；旧库导入、连接检测和长图裁切修复继续保留。未改变登录、模型服务或计费渠道。

2026-11-11 商业发布补充：用户已确定桌面支付使用 Apple App Store，采用 StoreKit / Apple In-App Purchase；Diagramly 后台验证交易并提供权益。此为已选方案，尚未接通支付。现有网站支付不变。商业发布总表为 [#26](https://github.com/ZenUml/doop/issues/26)，具体设计见 [Apple 支付方案](launch/apple-payments.md)。本清单的功能删减仍在整体审查后统一实施。

## 已确认的情况

- 真实旧库 392 份文档、414 页已导入本地 Peng Xiao 账户；其中 13 页原本没有源码。原文件未改动，也没有批量上传云端。
- 原生 DoopSpike 已验证旧图显示、源码编辑和重启后的保存。长图固定 900px 画框存在裁切，已增加自动扩展和回归测试。
- Doop 的 Connect a plan 是模型账户连接，不是 Diagramly 套餐查询。外部 MCP Agent 连接是独立路径。
- Diagramly 代码已有设备授权登录；这仅说明可复用代码存在，尚未验证 DoopSpike 与线上账号接通。
- Diagramly 的设备 token 分支不创建网站 session；现有套餐查询要求 session，需要范围明确的桌面只读接口，不能放宽所有登录校验。

仓库：[ZenUml/doop](https://github.com/ZenUml/doop) · [总清单 #14](https://github.com/ZenUml/doop/issues/14)

## 待审查 issues

| 编号   | 事项                                                    | 优先级 | 状态                                                            |
| ------ | ------------------------------------------------------- | ------ | --------------------------------------------------------------- |
| DSK-01 | 复用 Diagramly 登录并保留本地文档归属                   | P1     | [#1](https://github.com/ZenUml/doop/issues/1)，待审查、未实施   |
| DSK-02 | 为桌面端提供 Diagramly 套餐和额度查询                   | P1     | [#2](https://github.com/ZenUml/doop/issues/2)，待审查、未实施   |
| DSK-03 | 将内置 AI 和 Connect a plan 改为 Diagramly 后台流程     | P1     | [#3](https://github.com/ZenUml/doop/issues/3)，待审查、未实施   |
| DSK-04 | 用 Diagramly 权益替换 Doop workspace 升级与计费入口     | P1     | [#4](https://github.com/ZenUml/doop/issues/4)，待审查、未实施   |
| DSK-05 | 审核并统一移除图编辑中的 HTML 元素设计控件              | P1     | [#5](https://github.com/ZenUml/doop/issues/5)，待审查、未实施   |
| DSK-06 | 审核开发交付审批和原型交互功能是否应移除                | P2     | [#6](https://github.com/ZenUml/doop/issues/6)，待审查、未实施   |
| DSK-07 | 精简导入来源，优先图文件和旧 ZenUML 数据                | P2     | [#7](https://github.com/ZenUml/doop/issues/7)，待审查、未实施   |
| DSK-08 | 审核设计 tokens、字体库和图片生成设置                   | P2     | [#8](https://github.com/ZenUml/doop/issues/8)，待审查、未实施   |
| DSK-09 | 明确本地分享与 Diagramly 云端发布的区别                 | P1     | [#9](https://github.com/ZenUml/doop/issues/9)，待审查、未实施   |
| DSK-10 | 核验各导出格式，未支持的导出最后统一处理                | P1     | [#10](https://github.com/ZenUml/doop/issues/10)，待审查、未实施 |
| DSK-11 | 审核 Automations、Webhooks、Integrations 和设计记忆入口 | P2     | [#11](https://github.com/ZenUml/doop/issues/11)，待审查、未实施 |
| DSK-12 | 审核首页与设置，移除网页设计和 Doop 模型账户导向        | P2     | [#12](https://github.com/ZenUml/doop/issues/12)，待审查、未实施 |
| DSK-13 | 明确画布工具保留范围并以产品模式统一执行删减            | P2     | [#13](https://github.com/ZenUml/doop/issues/13)，待审查、未实施 |
| DSK-14 | 统一图编辑术语，审查 Layer / Frame / Canvas 等用词      | P1     | [#15](https://github.com/ZenUml/doop/issues/15)，待审查、未实施 |

每项的现状、候选方案、验收和代码参考见同目录 `desktop-feature-issues.json`；本表已对应实际 GitHub issue。

## 执行顺序

先核对清单与保留范围，再接通已确认需要的后台能力，最后统一删除已确认不需要的入口与实现，并验证菜单、快捷键、移动端和旧数据。不要按单个控件逐次删改，也不要删除用户的持久化数据。

本地导入和已有外部 MCP 不应因为接入 Diagramly 登录/套餐而失效。登录成功也不等于授权上传所有本地文档或启用另一条计费渠道。

术语的当前含义、候选替换与审查范围见 [术语清单](desktop-terminology-audit.md)。本轮只记录，没有修改产品文案或内部协议。
