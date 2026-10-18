# 2026-10-18 导入与迁移快捷工作流

本轮从 `660ac02` 继续，版本保持 v0.210.4；代码和文档是本地未发布候选，未推送、未创建 Release。目标是把已有导入/恢复能力变成可发现、可键盘操作的任务入口，不复制或绕过已有解析、预览、确认和写入流程。

## 实现

- 命令面板新增稳定 ID `imports`，简易和高级模式都显示。关键词覆盖 Anki、Obsidian、`.apkg`、`.colpkg`、`.lvcards`、Markdown、日志、备份、迁移和恢复。
- `openSettingsDialog(onSaved?, initialSection?)` 保留原首参兼容性；导入命令传入第二参 `"imports"`。设置组件的任务范围只影响当前视图，包含 `ankiSection` 与 `dataSection`；“查看全部设置”清除范围和查询、保留 draft、归还搜索框焦点。
- 设置搜索补齐实际导入、日志、备份和画像标签，并显示无匹配状态。画像、Anki、`.lvcards`、Obsidian 四个文件入口使用可聚焦原生按钮触发隐藏 input，取消、重复选择和 busy 状态沿用原 handler 的重置/锁定契约。
- 日志、备份、连接、V2、恢复和清理操作补显式可访问名称。共享焦点陷阱过滤 hidden、CSS 隐藏、inert、禁用和负 tabindex 候选，保留 `display:contents`、显式 `visibility:visible` 后代和禁用 fieldset 首 legend 例外。

## 自动化验证

| 范围 | 结果 | 证据边界 |
|---|---:|---|
| `pnpm test` | 175 文件 / 1310 项通过 | happy-dom 组件与纯逻辑；不代表真实思源宿主 |
| `pnpm check` | 通过；TypeScript、Svelte 0 错误/0 警告、版本一致 | 源码静态门禁 |
| `node scripts/check-i18n.mjs` | 1861 双语叶键 / 969 处引用通过 | 文案结构和引用完整性 |
| `pnpm build` | hub/review/dialogs/shell/kernel 与 `smoke:dist` 通过 | 生产 IIFE/分包契约，不代表安装包已发布 |
| 主包体积 | `dist/index.js` gzip 56136 bytes = 54.820 KiB | 55 KiB 门禁 56320 bytes，余 184 bytes |
| `node scripts/check-docs-facts.mjs` | 通过 | 当前版本事实校验 |
| `node scripts/check-governance.mjs` | 935 条、196 done、38 packages 通过 | 未改历史 checkbox 统计 |
| `git diff --check` | 通过 | 工作树空白检查 |

专项回归包括 `tests/settings-import-workflow.spec.ts` 14 项、`tests/settings-entry.spec.ts` 3 项、`tests/focus-trap.spec.ts` 28 项，以及命令面板导航/生命周期回归。导入测试覆盖中英文任务范围、格式和备份搜索、无结果清空、draft 保留、四个文件按钮、取消/同文件重选、忙碌重入、Anki 无 SQLite 降级和控件 accessible name。

最终生产产物 SHA-256：`dist/index.js` 为 `6f854f30d4e359914fe47beff7a3469eed390574676965c8ae65cd96d0e3213d`；`dist/chunks/dialogs.js` 为 `da52a9d6716a21b42a9cd132c63ff177fe6fc406d62867c794cf41162ff2238d`。截图与结果只对应本次产物，重建后需重新核对。

## Chrome 生产组件走查

夹具：[test-evidence/imports-2026-10-18/README.md](../../test-evidence/imports-2026-10-18/README.md)。服务加载当前 `dist/chunks/dialogs.js` 的正式 `SettingsPanel`、正式 CSS 和双语 JSON；ctx、API、文件写入和确认均为受控替身，服务器只允许 GET，非 GET 返回 405。

- 320 CSS px 暗色中文场景：任务说明、卡片导入与数据两分组、Anki 浏览器降级、`.lvcards`/Obsidian 按钮可见；搜索 `Obsidian`、`.lvcards`、备份和无匹配词均正确过滤，清空后恢复；“查看全部设置”保留编辑过的 Anki URL、清空搜索并聚焦搜索框。
- 首次走查发现日志文件 input 的原生默认控件在窄屏撑宽设置面板；生产 CSS 增加根宽度收缩、控件 `max-width` 和行内换行约束后，320 场景 `body.scrollWidth` 与可视宽度一致，设置根 `scrollWidth` 与自身宽度一致。
- Tab 从 `.lvcards` 按钮继续到 Markdown 按钮；隐藏 input 不进入焦点序列。截图保存在 `test-evidence/imports-2026-10-18/320-dark.jpg` 与 `320-dark-file-buttons.jpg`。
- 1280×800 亮色英文场景加载同一生产组件；英文任务、搜索、无结果反馈和恢复全部设置通过，根 `scrollWidth` 与宽度均为 610px，页面无横溢。截图保存在 `test-evidence/imports-2026-10-18/1280-light.jpg`。

这些是生产组件加受控上下文的浏览器证据，不是完整思源、真实文件系统、真实导入成功、共享宿主焦点捕获链、Android 或读屏验收。Chrome 日志中出现的扩展消息通道关闭错误来自浏览器扩展环境，夹具页面未观察到应用脚本异常；真实宿主仍按 docs/34 单独验收。

## GitHub 与下一步

本轮只读核验公开仓库仍有 [#12](https://github.com/ai68298100/siyuan-lv-cards/issues/12) 与 [#13](https://github.com/ai68298100/siyuan-lv-cards/issues/13) OPEN，均为右键菜单图标尺寸问题；未发现导入快捷入口的新 Issue，未修改远端事项。

下一轮先针对 `.lvcards` 导入复现并修复：同名卡组读取目前仅取前 500 张、确认 HTML 动态文本需统一转义、写入后块数量/身份对位需要更严格的保护。修复完成前不宣称分享包大库去重和部分成功语义已闭环。
