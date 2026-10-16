# 编辑保存后返回维护页闭环

已实现：
- `src/ui/card-detail.svelte` 增加可选 `onSaved(blockID)` 钩子；只有保存返回 `true` 且预览回读完成后调用。
- `src/ui/manager.svelte` 的 `ManagerCtx` 增加 `onCardContentSaved`，传给 CardDetail 的 `onSaved`。
- `src/ui/hub.svelte` 增加一次性 `managerReturnToMaintenance` 标记：维护页点击“查看并编辑”时打开管理器并带 block ID；保存后清除标记、切换回 maintenance。维护页由于 `#key active` 重挂载，自动触发 onMount 扫描。
- 离开管理器时清除未完成返回标记，避免普通卡库编辑误返回维护页。
- 新增 `tests/card-detail-preview.spec.ts` 集成测试，验证保存后回读预览并通知宿主。

验证：
- `pnpm exec vitest run tests/card-detail-preview.spec.ts tests/maintenance-page-persistence.spec.ts tests/manager-view-state.spec.ts`：3 files / 14 tests passed
- `pnpm check:types` passed
- `pnpm check:svelte` passed (0 errors, 0 warnings)
