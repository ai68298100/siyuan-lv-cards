# 小驴闪卡 · 全方位审计报告（第六轮，2026-10-09）

- 基线：v0.208.1 + 前五轮修复 + 本轮修复（未发版）
- 宿主：思源内核 3.8.6 隔离工作区 + browser-desktop（headless Chrome/CDP，全新 profile 排除缓存）
- 主攻：R3/R4 遗留的「AI 安全阀区块未渲染」根因 + 撤销同意全链复测
- 结果：**根因定位并修复（F-2 坐实为真 bug）、siyuan 模式渲染确认、撤销同意→零请求阻断全链通过**；730 测试全绿

## 根因定位（R3/R4 遗留谜题破解）

### F-2 · P2 · 安全阀区块被错误嵌入「自定义模式」条件块（已修复）
- 现象：默认「思源内置 AI」模式下，设置页不渲染「紧急停用（AI 安全阀）」行——用户无法紧急停用或撤销同意
- 根因：`settings.svelte:783` 的 `{#if draft.aiMode === "custom"}` 一直未闭合到 870 行，**安全阀行（846）连同端点/密钥/模型/备选/提示词模板整段都在该条件内**。R1 环境测试时恰好配置了 custom 假端点所以"看得到"，R3/R4 环境 aiMode=siyuan（默认）→ 整段隐藏 → 误判为"渲染待查"
- 编译产物证实：修复前 killswitch 组件嵌在 `c.aiMode===custom && e(m)` 分支内；修复后为独立守卫 `n.ctx.killswitch && e(g)`
- 修复：把 `{/if}`（custom 块闭合）提前到安全阀行之前——**安全阀对思源内置 AI 同样有意义，不随模式隐藏**；endpoint/key/model/fallback/提示词模板仍留在 custom 条件内
- 回归验证：siyuan 模式（默认）下「Emergency stop (AI kill switch)」+「Revoke AI consent」按钮渲染 ✓；svelte-check 0/0

## 撤销同意全链复测（修复后）

1. 设置 → AI → 「Revoke」点击 → `killSwitch.revoked = true` ✓
2. 向导生成（含材料）→ **零网络请求**（performance 资源计数 before=after=0）✓ 阻断语义成立
3. 恢复（Grant）数据位翻转验证通过（环境销毁前未再走 UI 流程）

注：阻断**文案**（aiKill.consentRevoked，"AI consent has been revoked…"）英文键已入包并有 i18n 引用门禁背书；本轮因向导"载入当前文档"在 headless 下的活动文档焦点问题未走到结果渲染帧，文案视觉复核留真机。

## 方法论教训（第三轮复盘）

R3/R4 将本问题标记为「渲染待查、根因未明」排查了多轮 DOM——**正确的第一步是读源码的条件嵌套**（awk 提取 {#if}/{/if} 配对即可秒级定位）。已引以为戒：结构问题先看结构。

## 顺延（不变）

错误原因标注/完成屏按钮的 UI 驱动（CDP 键盘焦点）、遮挡选区、备份下载验证、AI 审核步（智谱 key 401×3）、原生评分→插件统计事件链（真机）。

## 六轮累计

修复 **11 个缺陷**（A-1~A-4、C-2、C-3、D-1、E-1、F-1 i18n 崩溃、**F-2 安全阀嵌套**），门禁升级 1 项，730 测试全绿（104 spec）。本轮改动：`src/ui/settings.svelte`（F-2 修复）。
