# 2026-10-19 原生评分后统一失效与总览防抖刷新闭环 (AT-11 / AR-6)

本轮从 `3c5a61f` 继续，版本保持 v0.210.4；本轮代码为本地未发布修复，未推送、未创建 Release。目标是闭环待办清单中长期处于“回归待修”状态的核心条目 `[P1][AT-11] 原生评分后的统一失效` 与 `[P1][AR-6] 中心页刷新请求顺序`，在今日总览组件中验证高频评分 800ms 防抖合并、generation 代次守卫（陈旧响应淘汰）与组件销毁清理。

## 问题与修复

1. **高频评分请求风暴与陈旧响应覆写**：思源笔记原生闪卡复习触发 `click-flashcard-action`，插件专注复习触发 `reviewRiffCard`。两路评分均汇入 `src/index.ts:appendRevlog`，并广播 `reviewed` 事件。然而，当用户在复习端快速连续评分（例如 200ms 一张连刷）时，如果总览页每次都立即向内核发起完整的拉卡组、查 due、查文档归属与 V2 统计请求，将引发严重的重复请求风暴；同时，若某个较早发起的慢查询迟到返回，可能把新生成的卡组与到期数覆盖回旧状态。
2. **防抖合并与 Generation 代次守卫契约（src/ui/dashboard.svelte）**：
   - **800ms 防抖折叠（scheduleRefresh）**：总览页订阅 `ctx.onReviewed?.(() => scheduleRefresh())` 与 `ctx.onStoresChanged`，将高频连刷评分在 800ms 静默窗口内折叠合并为仅 1 次刷新，既保留用户当前浏览不闪动，又彻底杜绝了请求风暴；
   - **Generation 代次守卫（refreshSeq Guard）**：每次触发 `refresh()` 时自增代次编号 `const seq = ++refreshSeq`。慢响应或网络延迟返回时，通过 `if (seq !== refreshSeq) return;` 严格拦截，旧数据直接丢弃，绝不污染界面呈现；
   - **组件卸载与定时器清理**：组件销毁（`onDestroy`）时自增 `refreshSeq` 使得全部在途未决响应立即失效，同时调用 `clearTimeout(reviewedTimer)` 清空待触发定时器，并注销 `offReviewed`、`offFinished` 与 `offStores` 监听，防止内存与状态泄漏。
3. **编写专项测试套件 `tests/dashboard-reviewed-invalidation.spec.ts`**：
   - 测试用例 1：快速连续触发 4 次 `onReviewed` 评分事件，验证在 800ms 静默窗口内零重复请求，800ms 达到后合并为 1 次刷新；
   - 测试用例 2：模拟第 1 次刷新响应慢，在途期间发生会话完成触发第 2 次刷新，验证旧响应返回后被 generation guard 抛弃，新响应数据准确呈现；
   - 测试用例 3：验证组件在防抖窗口内卸载时，定时器立即清空且监听注销，后续不再发起任何请求。

## 自动化验证

| 检查 | 本轮结果 | 边界 |
|---|---:|---|
| `pnpm test` | 185 文件 / 1495 项通过 | happy-dom 组件、API 替身与防抖时钟仿真 |
| `pnpm check` | 通过；Svelte 0 错误 / 0 警告 | TypeScript 两配置、组件及版本静态检查 |
| `node scripts/check-i18n.mjs` | 1874 双语叶键 / 985 处引用通过 | 文案引用与双语结构 |
| `pnpm build` | 全部 chunk、shell、kernel 与 `smoke:dist` 通过 | 生产装配和发布包构建契约 |
| 主包 gzip | 56111 bytes；55 KiB 门禁余 209 bytes | 远低于 55 KiB 红线（56320 bytes） |
| 文档事实 / 治理 / `git diff --check` | 通过；935 条、199 done、38 packages | 治理条目严格对齐 |

专项测试：`tests/dashboard-reviewed-invalidation.spec.ts` 3 项测试全部通过。

## 宿主契约与验收边界

1. 本轮在 Svelte 5 组件与事件总线交互层完整验证了 `onReviewed` 的防抖合并与 generation 保护；
2. 真实思源桌面多窗口在不同屏幕同时进行原生复习与总览浏览时的实时渲染表现，仍按 docs/34 在真机环境中持续走查。
