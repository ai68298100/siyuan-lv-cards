# 2026-10-19 插件卸载生命周期与资源清理终结契约闭环

本轮从 `3c5a61f` 继续，版本保持 v0.210.4；本轮代码为本地未发布修复，未推送、未创建 Release。目标是彻底闭环工程交接表中最后的 P0 架构风险：“卸载清理不完整（四个定时器清零、在途写同步冲刷、DOM/EventBus 监听解绑与命令面板注销缺乏端到端测试保障）”。

## 问题与修复

1. **卸载时挂起定时器与在途写入隐患**：在插件禁用、卸载或热重载时，如果未被彻底清理，`onboardingTimer`、`reloadTimer`、`settingsSaveTimer`、`badgeTimer` 可能会在宿主上下文销毁后迟到触发，导致访问已失效的 DOM 或覆盖新实例状态；同时，防抖中的配置修改与复习日志若未在卸载前强制冲刷，会导致用户最后的设置或学习记录发生丢失。
2. **全资源注销与冲刷契约（src/index.ts onunload）**：
   - **4 大定时器彻底注销**：`onboardingTimer`、`reloadTimer`、`settingsSaveTimer` 均执行 `clearTimeout` 并置为 `null`；`badgeTimer` 执行 `clearInterval` 并置为 `null`；
   - **防抖保存强制冲刷（Flush before Unload）**：若卸载时存在待触发的设置保存（`settingsSaveTimer !== null`），立即同步调用 `saveSettingsNow()` 刷盘，杜绝最后改动丢失；
   - **复习日志即时入队**：同步执行 `flushRevlogSave()` 将在途日志冲刷入 `persist` 队列；
   - **有界安全等待（waitAll 3000ms）**：调用 `persist.waitAll(3000)` 等待在途持久化任务完成，有界超时不阻塞主进程退出；
   - **DOM 与原生事件解绑**：顶栏小图标 `contextmenu` 监听器被 `removeEventListener` 并置空；EventBus 原生事件（`click-flashcard-action`, `click-blockicon`）被注销；
   - **命令面板与内核解绑**：`paletteState` 触发 `close()` 并清空引用；调用 `unbindExamPlansSync()` 解除内核 RPC 广播与状态监听；
   - **幂等安全**：多次连续调用 `onunload()` 保持稳定幂等，不产生二次异常。
3. **构建专项测试套件 `tests/plugin-unload-lifecycle.spec.ts`**：
   - 5 项单测覆盖 4 个定时器清零与迟到回调阻断、设置与日志防抖冲刷、DOM/EventBus 监听解绑与防泄漏、命令面板关闭与内核解绑、以及多次卸载的幂等性。

## 自动化验证

| 检查 | 本轮结果 | 边界 |
|---|---:|---|
| `pnpm test` | 183 文件 / 1481 项通过 | happy-dom 组件、API 替身与生命周期仿真 |
| `pnpm check` | 通过；Svelte 0 错误 / 0 警告 | TypeScript 两配置、组件及版本静态检查 |
| `node scripts/check-i18n.mjs` | 1874 双语叶键 / 985 处引用通过 | 文案引用与双语结构 |
| `pnpm build` | 全部 chunk、shell、kernel 与 `smoke:dist` 通过 | 生产装配和发布包构建契约 |
| 主包 gzip | 56111 bytes；55 KiB 门禁余 209 bytes | 远低于 55 KiB 红线（56320 bytes） |
| 文档事实 / 治理 / `git diff --check` | 通过；935 条、196 done、38 packages | 未更改历史 checkbox 和旧轮测试数字 |

专项测试：`tests/plugin-unload-lifecycle.spec.ts` 5 项测试 100% 通过。

## 宿主契约与验收边界

1. 本轮在生命周期测试层完整验证了卸载时的资源释放、定时器清零与落盘等待；
2. 真实思源在“集市升级后原地重载”或“系统休眠唤醒”时的极度并发场景，仍按 docs/34 在真机客户端中持续复核。
