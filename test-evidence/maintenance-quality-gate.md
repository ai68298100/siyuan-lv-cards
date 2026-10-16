# 维护扫描的纯答案旧卡识别

日期：2026-10-16；版本：v0.209.5 工作树。

## 问题与改动

旧维护扫描只调用 `validateFlashcardMarkdown`，有合法 `==答案==` 就可能通过结构检查，遗漏答案标记之外没有题面的旧卡。

`detectDebts` 现复用 `validateCardEntry`，与入组、复习呈现及批量修复使用同一结构规则。宿主已验证的遮挡状态映射为 `occlusionValid`，门禁仍核对题面图片和标记。缺块与来源暂时无法解析继续分别报告。

缺题面的卡片以 `invalidCard / missing-question` 进入维护页，显示现有双语原因，可打开对应编辑入口。补齐题面后重新扫描消除结构债务；扫描不改源内容或 due/rating/revlog。

## 回归覆盖

- 纯答案、多个答案、仅排版/HTML/实体/零宽占位、答案内藏图片均识别为缺题面。
- 合法普通卡、可见图片题面与已验证图片遮挡不误报。
- 伪遮挡、未验证遮挡、遮挡伴随坏标记不能旁路门禁。
- 来源缺失优先于来源暂时无法解析；未提供归属信息不误报未知来源。
- 维护页显示本地化原因、打开正确卡片；编辑回调之后，重新扫描读取修正内容并移出结构债务。
- 合法遮挡的待审核状态仍显示在待审核分组。

## 验证

- 4 个相关测试文件、41 项测试通过：maintenance-queue、maintenance-page-persistence、card-entry-gate、card-detail-preview。
- `pnpm check` 通过：类型、版本一致，Svelte 0 错误/0 警告。
- `pnpm build:app`、`pnpm build:kernel`、`pnpm smoke:dist` 通过。
- `node scripts/check-governance.mjs` 通过，主包仍低于 55 KiB；`pnpm check:docs-facts`、`git diff --check` 通过。

## 验证边界

组件测试验证编辑回调及重扫合同，没有执行真实 Hub 编辑返回路由。2026-10-16 重新读取浏览器连接清单，只有应用内浏览器与 MCP Apps，没有 Chrome 连接；真实思源五路径验收继续未完成。

本次统一结构检测规则，不判断知识事实准确性。共享门禁对部分标点占位和无效图片标记仍较宽松，需要另行明确误报边界后收紧。
