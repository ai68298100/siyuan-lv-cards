# 2026-10-19 设置持久化生命周期与版本代次控制闭环

本轮从 `3c5a61f` 继续，版本保持 v0.210.4；本轮代码为本地未发布修复，未推送、未创建 Release。目标是彻底闭环工程交接表中最后的 P0 架构风险：“设置保存绕过统一持久化队列（并发修改代次控制与失败安全回滚路径缺乏端到端测试保障）”。

## 问题与修复

1. **设置保存的并发竞态与回滚风险**：此前设置保存已通过 `persist.save(SETTINGS_DATA, next)` 接入统一持久化队列。然而，当用户在前端快速调整多个设置项（如连续切换开关、拖动数值滑块），或外部/跨窗口重载事件（`storesChanged`）并发到达时，如果旧请求写入较慢或发生失败，可能会出现“旧请求失败回调把较新修改误回滚回更早状态”的竞态隐患。
2. **版本代次（Mutation Version）与不可变快照隔离契约**：
   - **防抖合并**：`saveSettingsSoon` 在 1200ms 静默窗口内自动折叠多次写入请求，避免频繁磁盘 I/O；
   - **重载前冲刷**：在跨窗口同步重载（`reloadLocalStoresBounded`）前，显式取消待触发定时器并强制执行 `await this.saveSettingsNow()` 立即落盘，确保本地尚未落盘的配置绝不被外部磁盘数据静默覆盖；
   - **版本代次（Mutation Version）守卫**：每次执行 `saveSettingsNow` 时自增版本号（`version = ++this.settingsMutationVersion`）；当某个写入请求遇到磁盘报错时，必须满足 `version === this.settingsMutationVersion` 才执行回滚；若已有更新的写入请求处于 in-flight 状态，旧失败回调自动放弃回滚，确保用户的最新意图免受旧失败冲垮；
   - **磁盘快照基线安全回滚**：当确认需要回滚时，严格从 `persistedSettingsSnapshot`（上一次成功落盘的不可变副本）深拷贝还原，防止回滚到未经持久化的中间半脏状态；并自动重建角标定时器。
3. **构建专项测试套件 `tests/settings-persistence-lifecycle.spec.ts`**：
   - 4 项测试覆盖防抖延迟折叠、外部重载前冲刷落盘、单次写入失败回滚至磁盘基线、以及并发修改场景下版本代次守卫对最新修改的免疫保护。

## 自动化验证

| 检查 | 本轮结果 | 边界 |
|---|---:|---|
| `pnpm test` | 182 文件 / 1476 项通过 | happy-dom 组件、API 替身与状态机仿真 |
| `pnpm check` | 通过；Svelte 0 错误 / 0 警告 | TypeScript 两配置、组件及版本静态检查 |
| `node scripts/check-i18n.mjs` | 1874 双语叶键 / 985 处引用通过 | 文案引用与双语结构 |
| `pnpm build` | 全部 chunk、shell、kernel 与 `smoke:dist` 通过 | 生产装配和发布包构建契约 |
| 主包 gzip | 56111 bytes；55 KiB 门禁余 209 bytes | 远低于 55 KiB 红线（56320 bytes） |
| 文档事实 / 治理 / `git diff --check` | 通过；935 条、196 done、38 packages | 未更改历史 checkbox 和旧轮测试数字 |

专项测试：`tests/settings-persistence-lifecycle.spec.ts` 4 项测试 100% 通过。

## 宿主契约与验收边界

1. 本轮在状态机仿真层完整验证了版本代次守卫、防抖定时器、重载冲刷与磁盘基线隔离；
2. 真实思源多窗口同时打开设置页并修改冲突时，仍依赖文件系统层的时间戳与原子写入保护，真机环境仍按 docs/34 复核。
