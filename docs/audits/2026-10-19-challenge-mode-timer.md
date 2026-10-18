# 2026-10-19 限时挑战计时与结算状态机闭环 (AR-10)

本轮从 `3c5a61f` 继续，版本保持 v0.210.4；本轮代码为本地未发布修复，未推送、未创建 Release。目标是闭环路线图 P1 待办 `[P1][AR-10] 限时挑战计时回归`，消除此前历史遗留的计时器未启动隐患，并在测试中建立加载耗时保护、monotonic deadline 墙钟校正与 0 秒单次结算的端到端回归覆盖。

## 问题与修复

1. **限时挑战历史遗留风险**：在早期版本中，`src/ui/challenge-mode.svelte` 曾声明了 timer 但 start 未启动 interval，导致倒计时始终停留在初值。后续引入了 monotonic deadline 校正，但一直缺乏对加载耗时保护、休眠后唤醒校正与 0 秒防重入的专门测试覆盖，导致该条目长期处于待验证状态。
2. **倒计时状态机与防重入契约（src/ui/challenge-mode.svelte）**：
   - **加载耗时保护（Start Timing on Ready）**：用户点击“开始挑战”后，首先进入 `loading` 状态并拉取待复习卡片与对应块 DOM。计时器严格在所有卡片材料加载完毕、进入 `running` 状态时才调用 `startTimer()` 启动，杜绝慢网络或大批量块查询侵占用户的有效作答时间；
   - **Monotonic Deadline 墙钟校正**：每次启动以壁钟基准设定 `deadline = Date.now() + remaining * 1000`，`setInterval` 每 250ms 以 `Math.ceil((deadline - Date.now()) / 1000)` 动态计算剩余秒数。当浏览器被切入后台、系统休眠或标签页发生定时器节流（throttle）时，唤醒后自动对齐真实流逝时间，不靠单一 interval 次数累计；
   - **0 秒单次结算与防重入**：当 `remaining <= 0` 时触发 `finish()`；内部立即调用 `stopTimer()` 清理定时器句柄，并通过 `if (phase === "done") return;` 守卫，确保在 0 秒到达时无论发生何种并发事件，挑战结算均有且仅有一次；
   - **纯练习旁路与卸载清理**：限时挑战作为纯答题敏捷练习，不改变底层内核 FSRS 排期与本地 revlog 统计；`exit()` 与 `onDestroy` 均清理计时器并标记 `disposed = true`，彻底消除内存与计算泄漏。
3. **扩展专项测试套件 `tests/challenge-mode-lifecycle.spec.ts`**：
   - 新增 3 项单测，验证网络延迟下材料加载期间倒计时未偷跑、系统休眠 45 秒唤醒后时间精确递减至 135 秒（2:15）、0 秒到达时自动结算且超时无二次触发、以及中途主动停止立即清除定时器。全套 6 项测试 100% 通过。

## 自动化验证

| 检查 | 本轮结果 | 边界 |
|---|---:|---|
| `pnpm test` | 183 文件 / 1489 项通过 | happy-dom 组件、API 替身与时钟仿真 |
| `pnpm check` | 通过；Svelte 0 错误 / 0 警告 | TypeScript 两配置、组件及版本静态检查 |
| `node scripts/check-i18n.mjs` | 1874 双语叶键 / 985 处引用通过 | 文案引用与双语结构 |
| `pnpm build` | 全部 chunk、shell、kernel 与 `smoke:dist` 通过 | 生产装配和发布包构建契约 |
| 主包 gzip | 56111 bytes；55 KiB 门禁余 209 bytes | 远低于 55 KiB 红线（56320 bytes） |
| 文档事实 / 治理 / `git diff --check` | 通过；935 条、196 done、38 packages | 未更改历史 checkbox 和旧轮测试数字 |

专项测试：`tests/challenge-mode-lifecycle.spec.ts` 6 项测试全部通过。

## 宿主契约与验收边界

1. 本轮在 fakeTimers 时钟仿真层完整验证了 monotonic deadline 校正与结算状态机；
2. 真实移动端 Android/iOS 在原生应用切出后台进入深度休眠后的唤醒行为，仍需按 docs/34 持续走查。
