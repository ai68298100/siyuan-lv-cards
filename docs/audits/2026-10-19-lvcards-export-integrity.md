# 2026-10-19 分享包导出完整性与双向往返契约闭环

本轮从 `3c5a61f` 继续，版本保持 v0.210.4；本轮代码为本地未发布修复，未推送、未创建 Release。目标是修复 `dashboard.svelte` 分享包（`.lvcards`）导出端的分页截断与正文格式损失缺陷，实现底层原始 Markdown 回读，并闭环与导入端的双向往返（Round-trip）无损去重契约。

## 问题与修复

1. **解除硬编码 20 页分页截断**：旧导出逻辑使用 `page <= pageCount && page <= 20` 限制，每页 100 张卡，导致超过 2000 张卡的大卡组发生静默截断丢卡。新纯模块 `src/core/lvcards-export.ts` 的 `readDeckIDsForExport` 顺序读取卡组全部页，严格核对每一页的 `total`、`pageCount` 与唯一非空 ID，在分页漂移、卡片总数变化或重复 ID 时显式抛出 `incomplete-deck`，支持大卡组无截断导出。
2. **废除 HTML 标签剥离，回读原始 Markdown 与助记便签**：旧实现将已渲染的 HTML 通过 DOM 文本提取（`ddStripHtml`）充当 Markdown，导致数学公式（`$$...$$`）、代码块（` ``` `）、多级列表缩进及换行全部失真或丢失。新模块 `readCardsForExport` 按每批 400 个 ID 分块执行 SQL，使用显式 `LIMIT` 规避宿主默认查询限制，直接查询底层原始 `blocks.markdown` 与可选 `blocks.memo`，并在 SQL 报错时自动兼容降级，确保正文格式完全保真。
3. **精准推断原生卡型**：根据原始 Markdown 特征自适应推断卡片题型（`cloze` 挖空、`code` 代码块、`list` 列表、`qa` 问答），使导出卡片符合 `lvcards.v1` 规范定义。
4. **闭环双向导入往返契约（Round-trip Integrity）**：编写 `tests/lvcards-export.spec.ts` 专项测试，验证包含复杂 LaTeX、代码缩进、硬换行、多挖空与列表的卡组经导出为 `.lvcards` JSON 后，再次通过 `parseLvCardsPackage` 解析并执行 `previewLvCardsImport` 对比原卡库时，所有卡片 100% 判定为 `duplicateCards`（完全去重项），`newCards` 与 `updatedCards` 为 0，证明往返零格式漂移。
5. **修复周历视图跨周测试缺陷**：修复 `tests/dashboard-suspend-restore.spec.ts` 中使用 `Date.now() - 24 * 60 * 60 * 1000` 导致测试在周一执行时因昨天跨入上周而断言失败的时间敏感性缺陷，统一通过 `vi.useFakeTimers()` 固定锚定系统时间。

## 自动化验证

| 检查 | 本轮结果 | 边界 |
|---|---:|---|
| `pnpm test` | 178 文件 / 1431 项通过 | happy-dom 组件、API 替身与纯逻辑 |
| `pnpm check` | 通过；Svelte 0 错误 / 0 警告 | TypeScript 两配置、组件及版本静态检查 |
| `node scripts/check-i18n.mjs` | 1874 双语叶键 / 985 处引用通过 | 文案引用与双语结构 |
| `pnpm build` | 全部 chunk、shell、kernel 与 `smoke:dist` 通过 | 生产装配和发布包构建契约 |
| 主包 gzip | 56136 bytes；55 KiB 门禁余 184 bytes | 导出纯模块进入 hub 按需分包，主包零新增体积负担 |
| 文档事实 / 治理 / `git diff --check` | 通过；935 条、196 done、38 packages | 未更改历史 checkbox 和旧轮测试数字 |

专项测试：`tests/lvcards-export.spec.ts` 14 项全绿，覆盖超 20 页大卡组（2500 张卡）全量分页读取、空卡组 `empty-deck` 抛出与提示、SQL 分块回读与 memo 列降级、LaTeX/代码块/列表格式保留与往返幂等去重契约。

## 宿主契约与验收边界

1. 本轮实现与测试依赖思源底层 `blocks.markdown` 存储契约与 `getRiffCards` 分页接口，已在纯逻辑与组件夹具层验证；真实桌面与多端宿主下的大卡组（>5000 卡）导出性能与文件保存交互仍需按 docs/34 验收。
2. 导出的 `.lvcards` 文件包含正文、题型与便签，符合本地优先规范；跨设备导入时依赖本地已存在卡组同名匹配或自动建卡落盘。
3. 真实 Android 客户端的分享文件写盘与系统选择器仍待单独真机走查。
