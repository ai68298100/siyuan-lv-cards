# 集市 PR 材料（提交前核对单与文案模板）

> 状态：GitHub Release 待更新（当前为 v0.209.2）；**bazaar PR 前置条件仍未全部满足**。本文件的提交步骤已按 2026-10-10 的官方说明更新。

## 一、官方提交流程

官方说明：[中文提交指南](https://github.com/siyuan-note/bazaar/blob/master/README.zh-CN.md#提交集市包) · [English](https://github.com/siyuan-note/bazaar#submitting-a-bazaar-package) · [插件样例与 `plugin.json` 字段](https://github.com/siyuan-note/plugin-sample/blob/main/README.zh-CN.md#pluginjson)。

1. Fork `siyuan-note/bazaar`，同步最新 `main`。
2. 只在 bazaar 根目录的 [`plugins.txt`](https://github.com/siyuan-note/bazaar/blob/master/plugins.txt) 新增一行：`ai68298100/siyuan-lv-cards`。每行一个 `owner/repo`；一个新增 PR 只添加一个包，不要同时混入无关下架。
3. 向 bazaar 的 `main` 创建 PR。PR Check 会核验包仓库的 Release、`package.zip`、必要文件和 metadata；失败后修复同一个 PR，仓库 Release 有变化后会定期复查，也可由维护者手动触发。
4. 合并后 bazaar 索引通常在数分钟内更新；无需为后续版本再开 bazaar PR，发布新的 GitHub Release 后索引会自动更新，通常每 1–3 小时部署。

插件仓库名必须与 `plugin.json` 的 `name` 相同；清单中的 `version` 遵循 semver，Latest Release 需提供 `package.zip`。本仓库 tag 发布工作流会生成 `package.zip` 和 SHA256 文件。`plugin.json` 中的 `icon`、`preview`、中英 `displayName`/`description`/`readme`、平台声明等 metadata 应与实际包内容一致。当前 `icon.png` 为 62,255 字节；官方样例建议图标 160×160 且不超过 64 KiB，预览图建议 1024×768 且不超过 512 KiB。GIF 是额外演示素材，不是官方列表文件要求。

## 二、PR 标题与说明（模板）

**标题**：`Add siyuan-lv-cards (小驴闪卡)`

**说明**（可直接粘贴，截图占位待补）：

> 小驴闪卡（Lv Cards）——本地优先的全生命周期闪卡学习平台。
>
> - **双轨数据通道**：正式调度由思源内核原生 FSRS 负责（riff），插件不重建调度；插件侧提供自研全功能复习界面与本地学习账本
> - **AI 制卡工作台**：来源清单分条管理（文档/选区/剪贴板/回源）、生成前请求预览确认（实际片段/端点/预算）、候选审核状态机（已选≠已审、实际卡面实时预览、编辑即失效需重新接受）
> - **Anki .apkg 本地导入**：零外部依赖解析、保守清洗带损失报告、指纹查重、幂等重导
> - **复习体验**：FSRS 四档评分（含间隔预期）、限时/打字/听写/选择模式、手势与快捷键、会话中断恢复
> - **统计与维护**：热力图/保持率/遗忘曲线、烂卡工作台、收件箱、内容版本追踪（保存留快照可对比）、修卡演练（独立样例教学）
> - **隐私**：AI 只有在用户选择 AI 制卡并确认请求后才发送所选材料；核心复习、统计和导出可独立于 AI，插件数据默认保存在本地，AI 请求的实际端点和数据范围见 [隐私说明](./PRIVACY.md)
>
> 截图：（占位——复习界面 / 闪卡中心 / AI 制卡 / 设置，4 张，真实脱敏）
> 开源许可：MIT · 仓库：https://github.com/ai68298100/siyuan-lv-cards

## 三、提交前核对单

- [ ] **Anki .apkg 真机导入验证**（当前桌面版同时验证 node:sqlite 与 node:zlib；成功/失败都记录到 docs/34）
- [ ] **真实脱敏截图 4 张**（P0-C3：复习 / 闪卡中心 / AI 制卡 / 设置；15~30s GIF 可后补）
- [ ] **version 与 GitHub Release 一致**（候选 v0.209.2；待 Release workflow 产包并确认 `package.zip` 和 `package.zip.sha256`）
- [ ] **中英 README**：能力矩阵与五种状态标签口径一致（P0-C1 已做，提交前复核一遍）
- [ ] **preview.png 实际展示验收**：现已按官方推荐尺寸调整为 1024×768、474,932 字节；仍待确认内容适合作为集市预览图。
- [ ] **Gate L 其余上线条件**：核心闭环真机稳定两周、双语/无硬编码校验、性能预算、亮暗主题及移动设备验收、反馈渠道与差异化说明、平台 metadata 复核、发布后 48 小时响应安排。
- [ ] 帖子预告（ld246.com 发布帖，社区宣传项，非 bazaar CI 硬性要求）

## 四、发布后动作

1. ld246 发布帖 + 用户反馈通道监控（GitHub Issues）
2. docs/40 账本转入维护态（新需求走 docs/30 排期）
3. 下一版本主题候选：T02 完整工作面 / 应用证据追踪 / 移动端专项（V-8 📱）
