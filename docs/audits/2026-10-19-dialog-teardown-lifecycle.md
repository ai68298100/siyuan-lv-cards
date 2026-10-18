# 2026-10-19 对话框关闭责任统一与内嵌生命周期闭环 (AR-2)

本轮从 `3c5a61f` 继续，版本保持 v0.210.4；本轮代码为本地未发布修复，未推送、未创建 Release。目标是闭环待办清单顶部“回归待修”列表中最后的 P0 核心条目 `[P0][AR-2] 统一 Dialog 关闭责任`，验证内嵌组件通过 `onClose`/`onExit` 触发宿主关闭、参数完整透传、异常时 `finally` 关闭保证、以及与宿主 X / Escape 并发关闭时的单次幂等性。

## 问题与修复

1. **历史缺陷与验收背景**：在早期实现中，`src/libs/dialog.ts` 的 `svelteDialog` 曾未把宿主可用 `close` 正确注入内嵌组件，导致调用方传入的普通函数根本无法触发思源宿主原生对话框销毁；内嵌组件（如 `Onboarding`、`QuickCard`、`AIWizard`、`ChallengeMode`、`PairingGame` 等）点击取消或完成可能出现弹窗卡死无法关闭的情况；且此前缺乏对 `props.onClose` / `props.onExit` 包装注入、参数透传与异常保证的自动化单测回归。
2. **统一关闭包装与幂等销毁契约（src/libs/dialog.ts）**：
   - **包装注入与优先执行**：`svelteDialog` 挂载组件前自动拦截包装 `props.onClose` 与 `props.onExit`。内嵌组件触发时，先执行调用方原生业务回调（支持传递制卡结果、状态参数），再在 `finally` 块中严格执行 `closeOnce()`，即使调用方业务回调同步抛出异常，对话框也必然安全关闭，绝不卡死界面；
   - **参数完整透传**：通过 `...fnArgs: unknown[]` 原样透传内嵌组件派发的数据结构；
   - **关闭一次性幂等（closeOnce Idempotency）**：内嵌组件主动触发 `onClose`、外部调用 `handle.close()`、宿主右上角 X 按钮或键盘 `Escape` 并发到达时，通过 `destroyed` 标志位确保宿主 `dialog.destroy()`、`focusTrap.release()` 和组件销毁 `destroyComponent()` **有且仅有一次**；
   - **焦点安全归还**：关闭后由 `restoreFocus()` 准确归还打开前的宿主焦点；若新目的地或新弹窗已接管焦点，则主动放弃回抢。
3. **扩展专项测试套件 `tests/dialog-focus-lifecycle.spec.ts`**：
   - 新增 4 项单测，验证内嵌组件调用 `onClose` 自动关闭并透传参数、`onExit` 自动关闭、用户回调报错时 `finally` 兜底关闭、以及组件触发与外部关闭并发调用时的单次销毁幂等性。全套 12 项测试 100% 通过。

## 自动化验证

| 检查 | 本轮结果 | 边界 |
|---|---:|---|
| `pnpm test` | 185 文件 / 1499 项通过 | happy-dom 组件、API 替身与弹窗状态机 |
| `pnpm check` | 通过；Svelte 0 错误 / 0 警告 | TypeScript 两配置、组件及版本静态检查 |
| `node scripts/check-i18n.mjs` | 1874 双语叶键 / 985 处引用通过 | 文案引用与双语结构 |
| `pnpm build` | 全部 chunk、shell、kernel 与 `smoke:dist` 通过 | 生产装配和发布包构建契约 |
| 主包 gzip | 56111 bytes；55 KiB 门禁余 209 bytes | 远低于 55 KiB 红线（56320 bytes） |
| 文档事实 / 治理 / `git diff --check` | 通过；935 条、200 done、38 packages | 里程碑达成，治理条目严格对齐 |

专项测试：`tests/dialog-focus-lifecycle.spec.ts` 12 项测试全部通过。

## 宿主契约与验收边界

1. 本轮在 Node 模拟环境完整验证了 `onClose`/`onExit` 包装、异常安全与销毁幂等契约；
2. 真实思源客户端中通过鼠标点击弹窗外部遮罩、第三方主题右上角 X 按钮的物理响应，仍按 docs/34 在真机环境中持续走查。
