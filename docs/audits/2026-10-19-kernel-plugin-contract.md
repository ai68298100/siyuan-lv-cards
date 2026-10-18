# 2026-10-19 内核插件生命周期与考试计划 RPC 广播契约闭环

本轮从 `3c5a61f` 继续，版本保持 v0.210.4；本轮代码为本地未发布修复，未推送、未创建 Release。目标是将 `src/kernel.ts` 内核插件在 Goja 宿主运行时的生命周期与考试计划跨前端广播 RPC 纳入自动化测试，消除此前审计中记录的“考试计划跨窗口通知契约缺乏端到端离线验证”的 P1 工程风险。

## 问题与修复

1. **内核插件离线契约测试短板**：此前内核插件（`src/kernel.ts`）在独立 target 构建为 `kernel.js`（IIFE 格式），依赖全局注入的 `siyuan` 内核 API 对象。虽然纯模块 `exam-plan-sync.ts` 已有基础校验测试，但 `kernel.ts` 自身的生命周期绑定（`onload`）、卸载清理（`onunload`）、RPC 方法注册（`echo`、`EXAM_PLANS_PUBLISH_RPC`）以及脏数据拦截尚未建立自动化回归。
2. **构建仿真内核运行环境测试套件 `tests/kernel.spec.ts`**：
   - **生命周期注册验证**：验证 `onload` 成功记录启动日志，并原子绑定 `echo` 与 `EXAM_PLANS_PUBLISH_RPC` 两个 RPC 处理器；
   - **基础回显契约**：验证 `echo` 桩能正确透传插件元数据（`name`、`platform`）与动态入参；
   - **合法通知广播转发**：验证接收到符合 `ExamPlansChangedNotice` 规范的通知时，内核插件准确调用 `api.rpc.broadcast(EXAM_PLANS_CHANGED_EVENT, notice)` 将失效信号广播给同内核下的所有连接前端，并返回 `{ accepted: true }`；
   - **严格脏数据防御拦截**：对 `null`、非对象、`schema` 漂移、空 `sourceID`、非正整数 `sequence` 或无效时间戳的恶意/畸变入参，严格拦截并抛出 `"Invalid exam plans change notice"` 异常，绝不向网络或其他前端扩散脏通知；
   - **卸载解绑防泄漏**：验证 `onunload` 彻底解绑全部 RPC 处理器，防止热重载或停用后在内核端留下悬挂监听。

## 自动化验证

| 检查 | 本轮结果 | 边界 |
|---|---:|---|
| `pnpm test` | 179 文件 / 1451 项通过 | happy-dom 组件、API 替身与内核仿真 |
| `pnpm check` | 通过；Svelte 0 错误 / 0 警告 | TypeScript 两配置、组件及版本静态检查 |
| `node scripts/check-i18n.mjs` | 1874 双语叶键 / 985 处引用通过 | 文案引用与双语结构 |
| `pnpm build` | 全部 chunk、shell、kernel 与 `smoke:dist` 通过 | 生产装配和发布包构建契约 |
| 主包 gzip | 56145 bytes；55 KiB 门禁余 175 bytes | 严格守住 55 KiB 红线（56320 bytes） |
| 文档事实 / 治理 / `git diff --check` | 通过；935 条、196 done、38 packages | 未更改历史 checkbox 和旧轮测试数字 |

专项测试：`tests/kernel.spec.ts` 14 项全绿，覆盖 `onload` 注册、`echo`、合法通知广播、10 组畸变数据拦截及 `onunload` 解绑防泄漏。

## 宿主契约与验收边界

1. 本轮在 Node 仿真环境下 100% 验证了 Goja 注入对象契约与 RPC 派发逻辑；
2. 真实同一内核下的多前台窗口（例如多显示器打开思源桌面端、同时打开移动端与桌面端）在保存/删除计划后的实时跨窗口刷新，仍需按 docs/34 在真机多窗口环境下最终复核。
