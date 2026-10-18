# 2026-10-19 通用内核请求策略与取消守卫闭环

本轮从 `3c5a61f` 继续，版本保持 v0.210.4；本轮代码为本地未发布修复，未推送、未创建 Release。目标是闭环工程交接表中的 P1 架构风险：“通用思源 API 仍不能真正 Abort（底层 `fetchSyncPost` 无法中止下的调用方取消等待、晚到淘汰与非写重试保护缺乏专项测试契约）”。

## 问题与修复

1. **思源内核请求不可中断下的消费端防御**：思源官方 SDK 的 `fetchSyncPost` 是基于同步 POST 机制实现的，底层无法原生响应标准的 `AbortSignal` 进行硬件连接打断。如果在网络波动或慢请求时调用方组件已经销毁（如快速切页、取消向导），若不建立策略层防御，迟到的响应可能会覆盖新状态，或者使得调用方挂起无法及时返回。
2. **`requestKernelData` 核心策略层契约验证**：
   - **调用方主动取消（Caller Abort Wait）**：调用方传入 `signal: controller.signal`，当 `controller.abort()` 触发时，`requestKernelData` 立即抛出 `RequestError("request aborted", "abort")`，不阻断调用方的退出与清理；
   - **逻辑代次淘汰（`latestKey`）**：针对分页、搜索等按视口展示的请求，连续针对同一 `latestKey` 发起多次请求时，一旦新请求开始，旧请求在返回时立即被标记为 `stale` 错误并丢弃，杜绝晚到数据覆写当前最新视图；
   - **只读单飞并发合并（`dedupeKey`）**：在 `readOnly: true` 时，针对同一资源 ID 的并发查询（如相同块元数据查询）自动合并底层执行，只调用一次内核 `request`，多个消费者共享同一数据；
   - **写入操作零重试硬绝缘**：默认或 `readOnly: false` 时，即使调用方传入了 `retries: 2`，遇到异常时也严格执行 0 次重试，确保绝不在网络抖动时对思源内核发起重复的写块/建卡调用。
3. **扩展专项测试套件 `tests/kernel-request.spec.ts`**：
   - 新增 4 项单测，将该测试套件扩展至 8 项测试全部通过，完整覆盖了 `requestKernelData` 的生命周期、校验解包、超时拦截、主动取消、代次淘汰、并发合并与写零重试。

## 自动化验证

| 检查 | 本轮结果 | 边界 |
|---|---:|---|
| `pnpm test` | 183 文件 / 1485 项通过 | happy-dom 组件、API 替身与策略层仿真 |
| `pnpm check` | 通过；Svelte 0 错误 / 0 警告 | TypeScript 两配置、组件及版本静态检查 |
| `node scripts/check-i18n.mjs` | 1874 双语叶键 / 985 处引用通过 | 文案引用与双语结构 |
| `pnpm build` | 全部 chunk、shell、kernel 与 `smoke:dist` 通过 | 生产装配和发布包构建契约 |
| 主包 gzip | 56111 bytes；55 KiB 门禁余 209 bytes | 远低于 55 KiB 红线（56320 bytes） |
| 文档事实 / 治理 / `git diff --check` | 通过；935 条、196 done、38 packages | 未更改历史 checkbox 和旧轮测试数字 |

专项测试：`tests/kernel-request.spec.ts` 8 项测试 100% 通过。

## 宿主契约与验收边界

1. 本轮在 Node 模拟环境完整验证了策略层对底层不可中断请求的拦截、超时兜底与调用方立即解脱契约；
2. 真实思源内核在底层执行耗时操作（如极其庞大的全文搜索或长时间慢 SQL）时，`fetchSyncPost` 底层进程仍会等待内核返回，虽然插件消费端已安全提前退出并不受影响，真实宿主高负荷下的表现仍需按 docs/34 持续复核。
