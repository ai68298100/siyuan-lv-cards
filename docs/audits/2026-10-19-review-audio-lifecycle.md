# 2026-10-19 复习语音与音频生命周期及暂停销毁清理闭环

本轮从 `3c5a61f` 继续，版本保持 v0.210.4；本轮代码为本地未发布修复，未推送、未创建 Release。目标是对齐并闭环 R54 验收台账中关于“语音事件与音频服务在复习组件卸载与主动暂停时的全生命周期复核”，消除切页或暂停后后台继续发声、音频上下文未及时释放的隐患。

## 问题与修复

1. **音频句柄与语音朗读在交互中断下的潜在泄漏**：在专注复习（`src/ui/review.svelte`）中，用户点击评分会触发 Web Audio API 音效合成（`playReviewSfx`），揭晓答案或主动点击朗读会触发 Web Speech API（`speakAnswerText`）。如果在语音朗读期间或音效播放后，用户快速切出页签、关闭复习 Tab、或点击工具栏的“暂停并安全返回今日（`tbPause`）”，若缺乏严格的资源终结保护，后台可能会发生音频上下文无法释放、或者语音合成在页面销毁后继续播报卡面内容的幽灵发声问题。
2. **销毁与暂停双重清理契约（src/ui/review.svelte）**：
   - **组件卸载（onDestroy）**：
     - 若 `activeUtterance` 存在，立即执行 `speechSynthesis.cancel()` 掐断一切在途语音合成，并重置 `activeUtterance = null`；
     - 调用 `closeReviewAudio(audioCtx)` 关闭 Web Audio API 上下文（仅在非 `closed` 状态下执行 `ctx.close()`），并重置 `audioCtx = null`；
     - `stopTimeout()` 停止页面复习倒计时，`stopRequeueTimers()` 停止遗忘卡短期循环计时器；
     - 移除 `visualViewport` 的 resize 与 scroll 事件监听器；
   - **主动暂停（pauseAndReturnToday）**：
     - 用户在工具栏点击暂停并确认后，同样同步执行 `closeReviewAudio(audioCtx)`，并重置 `audioCtx = null`；
     - 同步执行 `stopTimeout()` 与 `stopRequeueTimers()`，保存不可变会话现场快照后平稳退出至今日总览页。
3. **扩展组件级端到端测试套件 `tests/review-async-actions.spec.ts`**：
   - 验证组件在播放音效并评分后，用户点击暂停弹窗并确认暂停时，`closeReviewAudio` 准确被调用，`AudioContext.close()` 触发一次，会话现场安全保存并退出；
   - 结合原有用例 `cancels active speech and closes its audio context when the review is destroyed`，形成卸载与暂停双闭环。

## 自动化验证

| 检查 | 本轮结果 | 边界 |
|---|---:|---|
| `pnpm test` | 183 文件 / 1486 项通过 | happy-dom 组件、API 替身与音频仿真 |
| `pnpm check` | 通过；Svelte 0 错误 / 0 警告 | TypeScript 两配置、组件及版本静态检查 |
| `node scripts/check-i18n.mjs` | 1874 双语叶键 / 985 处引用通过 | 文案引用与双语结构 |
| `pnpm build` | 全部 chunk、shell、kernel 与 `smoke:dist` 通过 | 生产装配和发布包构建契约 |
| 主包 gzip | 56111 bytes；55 KiB 门禁余 209 bytes | 远低于 55 KiB 红线（56320 bytes） |
| 文档事实 / 治理 / `git diff --check` | 通过；935 条、196 done、38 packages | 未更改历史 checkbox 和旧轮测试数字 |

专项测试：`tests/review-async-actions.spec.ts` 32 项测试全部通过。

## 宿主契约与验收边界

1. 本轮在 Svelte 组件渲染层完整验证了卸载与暂停时对 Web Audio API 和 Web Speech API 的释放契约；
2. 真实 Android 客户端在处于后台运行、被锁屏唤醒或被系统低内存强杀时的多媒体生命周期，仍需按 docs/34 在真机环境中复核。
