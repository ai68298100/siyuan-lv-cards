# 2026-10-19 存储启动坏槽位容错与不可变快照隔离闭环

本轮从 `3c5a61f` 继续，版本保持 v0.210.4；本轮代码为本地未发布修复，未推送、未创建 Release。目标是彻底闭环工程交接表中唯一的 P0 架构风险：“启动单键失败会阻塞整个加载（坏槽位单键损坏容错与恢复路径缺乏端到端测试保障）”，并验证不可变磁盘快照隔离。

## 问题与修复

1. **启动多存储并发读取的单键脆弱性**：插件共有 22 个持久化文件（设置、日志、暂缓、考试、AI作业、知识对象、收件箱等）。在启动与跨窗口重载（`readAllStores`）时，若其中某个 JSON 文件因异常断电损坏、文件锁竞争或磁盘 I/O 报错，原生 `Promise.all` 会立刻抛出异常，导致整个插件加载被中途掐断，界面陷入白屏。
2. **位置配对与坏槽位隔离契约**：
   - `zipLoaded` 键值严格按索引映射，并在数组长度不一致时立即报错（宁可报错也绝不允许位置漂移将一个文件的内容赋给另一个 store，历史上曾导致会话状态错位读到 AI 批次数据）；
   - `readAllStores` 针对 22 个 store 的每个 `loadData(key)` 独立捕获异常，坏槽位返回 `undefined` 并输出可观测的错误日志，健康槽位正常解析，使得单键损坏绝不扩散为整体崩溃；
   - `applyLoadedStores` 全量接入各领域的 `normalize*` 纯函数。对于损坏或缺失槽位（`undefined`），自适应回退到纯净默认值（`defaultSettings`、`emptyRevlog`、`emptySessionState`、`createEmptyRepairJournal` 等），实现零白屏与防御性自愈。
3. **不可变磁盘快照（Persisted Snapshots）隔离**：
   - 加载完成后，系统针对 `settings`、`revlog`、`sessionState` 等乐观更新状态创建独立的深拷贝磁盘快照基线（如 `persistedSettingsSnapshot`、`persistedSessionStateSnapshot`）；
   - 验证了前端运行态在复习答题或配置调整中的修改，绝不会直接污染底层磁盘快照；当连续保存失败触发回滚时，总是回滚到最后一次成功落盘的真实基线，防止回滚至未经持久化的半脏状态。
4. **构建专项测试套件 `tests/store-startup-fault.spec.ts`**：
   - 8 项单测覆盖 `zipLoaded` 配对与错位防御、坏槽位模拟故障注入、16 个关键 store 的 `normalize` 纯默认值兜底、`loadStore` TypedStore 异常回退、以及运行态修改对磁盘快照的零渗透测试。

## 自动化验证

| 检查 | 本轮结果 | 边界 |
|---|---:|---|
| `pnpm test` | 181 文件 / 1472 项通过 | happy-dom 组件、API 替身与故障注入 |
| `pnpm check` | 通过；Svelte 0 错误 / 0 警告 | TypeScript 两配置、组件及版本静态检查 |
| `node scripts/check-i18n.mjs` | 1874 双语叶键 / 985 处引用通过 | 文案引用与双语结构 |
| `pnpm build` | 全部 chunk、shell、kernel 与 `smoke:dist` 通过 | 生产装配和发布包构建契约 |
| 主包 gzip | 56111 bytes；55 KiB 门禁余 209 bytes | 远低于 55 KiB 红线（56320 bytes） |
| 文档事实 / 治理 / `git diff --check` | 通过；935 条、196 done、38 packages | 未更改历史 checkbox 和旧轮测试数字 |

专项测试：`tests/store-startup-fault.spec.ts` 8 项测试 100% 通过。

## 宿主契约与验收边界

1. 本轮在 Node 模拟环境验证了 22 个持久化键的坏槽位隔离与回退自愈契约；
2. 真实思源文件系统在遇到损坏文件后的重写、覆盖提示及外部同步冲突，仍需按 docs/34 持续复核。
