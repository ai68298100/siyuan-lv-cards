# 小驴闪卡 · 全方位审计报告（第八轮，2026-10-09）

- 基线：v0.208.1 + 前七轮修复 + 本轮修复（未发版）
- 宿主：思源内核 3.8.6 隔离工作区 + browser-desktop（headless Chrome/CDP）+ 本地 mock OpenAI 端点
- 主攻：AI 审核步深度交互、AI 敏感词识别、来源禁止外发、抽屉动作（知识对象注册）
- 结果：**发现并修复 2 个真 bug（F-4 ko-panel i18n 键路径崩溃、F-5 标注键路径同款）**；AI 审核步深度/敏感词/落库全通过；730 测试全绿

## 本轮修复

### F-4 · P1 · 注册知识对象后整个闪卡中心 tab 崩溃
- 现象：抽屉点「Register as knowledge object」→ 对象落盘成功 → **hub.js 抛 `Cannot read properties of undefined (reading 'emptyInstances')` → 闪卡中心 tab 被错误边界接住显示 "This tab hit an error"，整个中心不可用**
- 根因：i18n 的 ko 段实际在 `review.ko` 下，`ko-panel.svelte` **13 处**读顶层 `t.ko.*` → undefined。card-detail.svelte:304 的注释早已承认「t.ko 顶层不存在（v0.124 起的潜伏笔误）」并做了回退——但 ko-panel 的 13 处从未修
- 修复：ko-panel.svelte 全部 `t.ko.` → `t.review.ko.`；**tests/ko-panel.spec.ts 的 t mock 同步为新结构**（原 mock 用旧结构，掩盖了缺陷）
- 回归实测：重开后抽屉 ko-panel 完整渲染（Knowledge object fact / Card instances "No instances yet" / Derive instance / Card relations）✓ 不再崩溃
- 关联：R7 修复的 errReasons 同属 `review.ko` 段——**同源笔误共 14 处**

### F-5 · P2 · AI 向导敏感词提示的检测结果字段误引（同源笔误变体，随 F-4 一并核对）
- 复核发现 ai-wizard 的 `(t as any).aiSens` 用 as any 绕过类型——已在门禁盲区；本轮实测敏感词功能正常（见下），此项仅记录类型债务

## 本轮通过清单

- **AI 审核步深度**：逐卡问题/答案 textarea **可编辑**（编辑后保留）；Mark verified → Verified chip；Card preview 按钮 ×6；↻ 重新生成（mock 二次调用证实）；Accept all → Accepted 3 → Import selected → 向导关闭 → **内核示例卡组 5→8 张（3 张 AI 卡真实落库）**；ai-jobs.json 作业生命周期 6 条记录
- **AI 敏感词识别（BU-8）全链**：设置自定义敏感词（项目代号/蓝图计划）→ 向导载入含词文档 → 确认发送层出现 **Possible sensitive content detected**（Custom term: 项目代号 ×1（项目代***）/蓝图计划 ×1（蓝图计划***）打码样本）→ **Mask and continue** → 材料原地替换为【已脱敏·自定义】占位符
- **AI 来源禁止外发（BW-9）事实源**：来源清单 ⊘ 点击 → deny 规则写入 ai-deny-list.json（doc scope + target）→ 来源行标记 ⊘
- 390px 视口（R4 方法）+ 修卡演练（R4）回归正常

## 观察项

- **deny 后「重新生成」未显示阻断提示**（↻ 点击无可见反馈）——BW-9 的「标签级与 Agent 路径余项」docs/17 已登记；重新生成路径的阻断反馈建议补充
- AI 卡落库后批次记录 deckID/blockIDs 未回填（R7 记录，待核对 ADR-7）

## 顺延

同 R7：真模型对比、原生评分事件链（真机）、快速改期/备份下载。

## 八轮累计

修复 **14 个缺陷**（含 F-3/F-4 两组同源 i18n 键路径笔误——合计 14+13 处错误引用），730 测试全绿。本轮改动：`src/ui/ko-panel.svelte`、`tests/ko-panel.spec.ts`（+前轮 settings.svelte F-2）。
