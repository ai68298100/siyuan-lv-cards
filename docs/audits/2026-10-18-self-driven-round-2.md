# 2026-10-18 自驱开发第二轮：交互与异步收口

本轮在 `codex/r54-audit-fixes` 上完成 7 个源码提交，范围为 `3ba2270..789214d`。沿用 v0.210.4 版本号和 R54 视觉基线；本轮修复已在本地提交，尚未推送或发布。本记录只覆盖该范围，前轮材料、导入和学习页三分面等修复保留在此前提交中。

## 场景与修复

| 用户触发场景 | 本轮结果 | 回归证据 |
|---|---|---|
| 连续方向键切换分段控件 | 按实际焦点计算目标，立即移动焦点并保持单一 Tab 入口 | `tests/kit-interactive.spec.ts` |
| 用键盘或读屏操作 AI、管理、复习和设置表单 | 主要输入、选择、筛选、排序、候选编辑等控件获得可访问名称 | `tests/ai-wizard-audit.spec.ts`、生产模板审查 |
| 打开和关闭复习图片灯箱、考试计划编辑弹窗 | 初焦进入、Tab/Shift+Tab 循环、Escape 关闭并归还焦点；考试保存中拒绝关闭 | `tests/review-async-actions.spec.ts`、`tests/exam-plan-form.spec.ts` |
| 保存便签/移出卡组时尝试关闭、页面卸载或请求失败 | 写入中禁关闭、锁定原卡身份；卸载后忽略迟到结果；失败保留原卡、弹窗和草稿可重试 | `tests/review-async-actions.spec.ts` |
| 正式评分或同步替换学习日志，期间切换分面 | 两种事件共用刷新路径；隐藏时使预测失效，返回再读；旧结果丢弃并释放 loading，活动日历失效后补读 | `tests/learning-page.spec.ts` |
| 离开学习页后再有评分/同步事件 | 注销两种订阅，不再触发读取或分页 | `tests/learning-page.spec.ts` |
| 单日学习计数显示错误的“近 7 天”标签 | 回顾与日历单日计数统一为“正式评分 / Formal reviews” | 双语 i18n 检查、`tests/learning-page.spec.ts` |
| 右键菜单主题规则放大插件图标 | 通过官方 `iconClass` 只约束本插件图标为 16px，保留菜单动作和其他插件样式 | `tests/block-menu-style.spec.ts` 实际 Sass 编译和 happy-dom CSS 回归 |

## 源码提交

| 提交 | 内容 |
|---|---|
| `c17ec04` | 分段控件与灯箱焦点 |
| `b215a8e` | 创作和导航控件可访问名称 |
| `4330748` | 闪卡块菜单专属图标尺寸 |
| `7eb39df` | 复习写入互斥、原卡身份与灯箱焦点循环 |
| `656c758` | 复习写入卸载守卫与失败重试回归 |
| `b311e4c` | 考试计划编辑弹窗焦点与保存中关闭守卫 |
| `789214d` | 学习日志同步、过期预测与单日计数文案 |

## 最终验证

下列源码检查覆盖冻结的 `789214d`。文档同步后另行复跑文档事实、治理与差异检查。

| 检查 | 结果 |
|---|---|
| `pnpm test` | 170 个文件、1221 项全部通过；最终全量耗时 46.51s |
| `pnpm check` | 两套 TypeScript 配置通过；Svelte 0 错误/0 警告；版本一致 |
| `node scripts/check-i18n.mjs` | 中英文 1856 个叶键、955 处源码引用对齐 |
| `pnpm build` | hub/review/dialogs/shell/kernel 构建与 `smoke:dist` 全通过 |
| `pnpm check:docs-facts` | 通过，当前版本及文档事实一致 |
| `node scripts/check-governance.mjs` | 935 条、196 done、38 包，docs/17 与 docs/31 一致，主包预算通过 |
| `git diff --check` | 通过 |

主包 `dist/index.js` 按治理脚本同样的 Node `gzipSync` 默认选项测得 **56214 bytes = 54.896 KiB**，门禁为 55 KiB（56320 bytes），余 106 bytes。Vite 打印的十进制 kB 与该门禁统计方式不同，后续主包改动继续按治理脚本检查，不扩大预算。

未修改或纳入提交的原有未跟踪证据包括 `test-evidence/audit/`、`test-evidence/round-1/` 和已有 R53/R54 截图。

## GitHub 只读快照

2026-10-18 核验：最新公开发布为 [v0.210.4](https://github.com/ai68298100/siyuan-lv-cards/releases/tag/v0.210.4)（发布于 `2026-10-17T12:22:25Z`），最近主线 CI 与 tag 发布工作流成功；无开放 PR。该结果不表示本地分支已通过远端 CI，本轮未推送、未发版，也未重新下载发布资产验包。

开放事项为 [#12](https://github.com/ai68298100/siyuan-lv-cards/issues/12) 和 [#13](https://github.com/ai68298100/siyuan-lv-cards/issues/13)，均报告右键菜单插件图标过大。本轮已完成尺寸兜底和隔离回归，两项仍为 OPEN，未评论或关闭。现有 `icon: "iconLvCards"` 用法符合官方 API；原 QQ 截图地址返回 400，无法确认精确历史根因。隔离测试中的后置 96px 规则只用于验证尺寸防御，不代表已经复现原用户主题。

## 证据边界与下一轮

本轮新增的是生产组件、源码和隔离 CSS 测试。未新增 Chrome 走查、真实思源宿主、Android、读屏器或真实 AI 模型证据。历史隔离内核 18/18 未在本轮重跑；历史 Chrome review 内存夹具只覆盖组件，真实宿主曾被 `Cross-site requests are not allowed` 阻止。继续按 [真机验收清单](../34-真机验收清单.md) 分别验收，不将本轮自动化通过表述为全宿主可用。

下一轮处理已确认的 `src/ui/kit/LvPalette.svelte` 缺口：活动选项随键盘导航滚入视区，输入关联列表及活动选项；补长列表、筛选、空结果、首尾键盘导航、关闭焦点归还的回归，执行类型检查、相关测试及生产构建。延续 R54 视觉，不扩展命令功能范围。
