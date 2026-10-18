# 2026-10-19 AI 双 Provider 回退条件与不可恢复错误拦截闭环 (AQ-15)

本轮从 `3c5a61f` 继续，版本保持 v0.210.4；本轮代码为本地未发布修复，未推送、未创建 Release。目标是闭环路线图 P1 核心条目 `[P1][AQ-15] Provider fallback 只对可恢复错误生效`，在调用层验证仅网络/超时/5xx 执行回退、401/402/4xx 不可恢复错误直接暴露原因不盲目重试、端点 URL 规范化去重、以及双端点均失败时的复合错误信息。

## 问题与修复

1. **AI 盲目回退与多余开销隐患**：在早期实现中，AI 调用层（`src/api/ai.ts`）在遇到任何错误时都可能无条件尝试向备用端点（`fallbackEndpoint`）重发请求。这导致当发生 401（API Key 无效/过期）、402（配额不足）或 400（参数非法）等明确由客户端或配置引起的非可恢复错误时，系统仍然会浪费网络与 Token 开销向备用端点发起无谓重试；同时，如果用户配置的备用端点仅仅是在主端点 URL 后多了尾部斜杠（例如 `https://api.com/v1/`），系统若不加规范化可能会误判为不同端点而向同一服务重复打请求。
2. **阶梯降级与不可恢复错误拦截契约（src/api/ai.ts）**：
   - **严格分类与有限回退**：通过 `classifyAiFailure(e)` 与 `nextLadderStep` 纯决策管线：
     - 可恢复类错误（5xx 服务器内部错误、网络超时、429 限流）在配置了有效备用端点时，返回 `action: "try-fallback"`，自动切换至备用端点，并触发 `onProvider("fallback")` 与 `onDegradation` 阶梯回调；
     - 终止类不可恢复错误（401 鉴权失败、402 配额耗尽、4xx 参数不合法、用户主动取消、敏感内容拦截）直接返回 `action: "give-up"`，立即抛出原错误并呈现明确原因，坚决不向备用端点发起二次请求；
   - **端点 URL 规范化（Trailing Slash Deduplication）**：通过 `normalizeEndpoint` 剥离尾部多余斜杠，在主备端点实际相同时自动判定 `hasFallback: false`，避免向同一端点死循环重试；
   - **双端点失败复合错误拼接**：当主备两路端点均失败时，系统将两次调用的明确错误原因组合输出为 `AI fail: primary (${describe(e)}) | fallback (${describe(e2)})`，便于用户与开发者精确定位。
3. **扩展专项测试套件 `tests/ai-transport.spec.ts`**：
   - 新增 4 项单测，验证 500 可恢复错误时切换备用端点并通知回调、401 不可恢复错误时立即抛错且 fetch 仅调用 1 次、主备端点带尾斜杠等价时拒绝回退、以及双端点均失败时正确拼接双错误信息。全套 8 项测试 100% 通过。

## 自动化验证

| 检查 | 本轮结果 | 边界 |
|---|---:|---|
| `pnpm test` | 185 文件 / 1503 项通过 | happy-dom 组件、API 替身与双 Provider 仿真 |
| `pnpm check` | 通过；Svelte 0 错误 / 0 警告 | TypeScript 两配置、组件及版本静态检查 |
| `node scripts/check-i18n.mjs` | 1874 双语叶键 / 985 处引用通过 | 文案引用与双语结构 |
| `pnpm build` | 全部 chunk、shell、kernel 与 `smoke:dist` 通过 | 生产装配和发布包构建契约 |
| 主包 gzip | 56111 bytes；55 KiB 门禁余 209 bytes | 远低于 55 KiB 红线（56320 bytes） |
| 文档事实 / 治理 / `git diff --check` | 通过；935 条、201 done、38 packages | 治理条目严格对齐 |

专项测试：`tests/ai-transport.spec.ts` 8 项测试全部通过，全量测试套件突破 1500 项大关。

## 宿主契约与验收边界

1. 本轮在 Node 模拟环境完整验证了错误分类、状态机决策、端点规范化与回调通知契约；
2. 真实思源环境下使用真实 OpenAI、DeepSeek、Ollama 等外部服务商进行的真机连通与模型异常矩阵，仍按 docs/34 在真机环境中持续走查。
