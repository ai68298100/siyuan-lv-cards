# 2026-10-19 内核闪卡 API 响应校验全链路统一闭环

本轮从 `3c5a61f` 继续，版本保持 v0.210.4；本轮代码为本地未发布修复，未推送、未创建 Release。目标是彻底解决工程风险表中的 P1 项：“API 响应校验入口不一致（riff 与 flashcardV2 专用路径尚未统一收口到 unwrapKernelData）”，消除分散手写校验带来的语义漂移与维护负担。

## 问题与修复

1. **响应校验入口分散与潜在漂移**：此前通用思源端点已收口于 `src/libs/kernel-request.ts` 与 `src/libs/kernel-response.ts`（通过 `unwrapKernelData` 校验 `code === 0` 与封套结构，并保留错误码供友好映射器使用）。然而，`src/api/riff.ts` 与 `src/api/flashcardV2.ts` 内部仍各自维护私有的 `if (!resp || resp.code !== 0)` 分支与内联抛错逻辑，当内核返回异常数据结构或缺少 code 字段时，可能产生不一致的错误表现。
2. **全链路统一接入 `unwrapKernelData`**：
   - 在 `src/api/riff.ts` 中引入 `unwrapKernelData`，简化 `riff<T>` 基础请求封装，将内核响应的结构合法性校验与错误信息解析委托给统一函数；
   - 在 `src/api/flashcardV2.ts` 中引入 `unwrapKernelData`，简化 `v2<T>` 基础请求封装；
   - 保证了当内核返回非 0 响应时，格式均统一为标准 `kernel error (code=${code}): ${msg}`，无缝衔接 `friendlyError` 统一翻译映射器，同时对缺少 code 的畸变响应统一输出 `kernel error (code=unknown)`。
3. **测试契约与错误映射保持稳定**：
   - 校验 `tests/riff.spec.ts` 与 `tests/flashcard-v2.spec.ts`，原有用例（包括 `code≠0` 抛错、msg 提取、错误码正则匹配等）100% 保持完全兼容；
   - 彻底关闭了工程交接单中关于“API 响应校验入口不一致”的历史风险记录。

## 自动化验证

| 检查 | 本轮结果 | 边界 |
|---|---:|---|
| `pnpm test` | 179 文件 / 1451 项通过 | happy-dom 组件、API 替身与内核仿真 |
| `pnpm check` | 通过；Svelte 0 错误 / 0 警告 | TypeScript 两配置、组件及版本静态检查 |
| `node scripts/check-i18n.mjs` | 1874 双语叶键 / 985 处引用通过 | 文案引用与双语结构 |
| `pnpm build` | 全部 chunk、shell、kernel 与 `smoke:dist` 通过 | 生产装配和发布包构建契约 |
| 主包 gzip | 56111 bytes；55 KiB 门禁余 209 bytes | 代码精简带来 34 bytes 的体积回收 |
| 文档事实 / 治理 / `git diff --check` | 通过；935 条、196 done、38 packages | 未更改历史 checkbox 和旧轮测试数字 |

## 宿主契约与验收边界

1. 本轮纯粹统一了客户端对内核 JSON 封套的解包与校验逻辑，不改动思源底层请求路径；
2. 真实思源网络异常、离线或鉴权过期（401/403）时的友好弹窗呈现已在离线测试中保持契约覆盖，多宿主环境仍按 docs/34 持续复核。
