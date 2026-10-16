# v0.210.1 UI 审计与本地候选验收

日期：2026-10-16。范围为当前工作区近期 UI 优化及其交互、异步状态、数据写入和打包边界。保留工作区已有未提交修改；本轮没有提交、推送、打标签或发布 GitHub Release。

本文记录发版前候选阶段的检查快照。用户随后已授权 GitHub 发版；安装包与实际发布状态以 [v0.210.1 Release](https://github.com/ai68298100/siyuan-lv-cards/releases/tag/v0.210.1) 为准。下文“未提交/未发布”描述候选检查结束时的状态，不代表 Release 的实时状态。包内 README 在发版时更新了版本入口，文末摘要对应最终本地发布包。

结论：本地源码与生产包门禁通过，可作为 v0.210.1 发布候选。没有发现仍未修复的自动化门禁阻断项。真实宿主 UI、Android 和真实模型矩阵仍缺少验收证据，不能将本报告理解为这些环境全部通过。

## 范围与修复

检查覆盖首页、卡片库与详情、手工/AI 制卡工作台、维护、复习、独立弹窗与分包挂载。按入口、前置条件、点击反馈、空态/失败重试、文案、导航恢复及窄屏可达性检查；视觉规范沿用仓库当前 R54 基线。

| 区域 | 发现并修复的缺陷 | 主要回归证据 |
| --- | --- | --- |
| 复习 | 弹窗/菜单快捷键及点击穿透；隐藏或暂停页面仍响应；切卡旧计时器与来源响应迟到；撤销恢复不完整；编辑后选择题缓存；疑问标记幂等性 | `review-async-actions.spec.ts` 等定向回归，真实生产组件键盘与评分交互 |
| 复习布局 | 窄屏卡面 padding 导致横向溢出；短视口底部评分按钮无法滚入 | 375×568、320×568 深色、568×375 横屏与 1280×800 桌面生产组件检查 |
| 卡面与结构门禁 | 图片 URL/alt 双重转义；代码字面量及占位符处理；单个等号的公式挖空；空代码/空公式/无效图片冒充可见题面 | `card-face.spec.ts`、`flashcard-quality.spec.ts`、`card-entry-gate.spec.ts` |
| 手工/AI 制卡 | 材料重复、空态不能粘贴、历史恢复错卡、删除后索引错位、重复 keyed-each；生成/入库中编辑并发；失败重试重复建组；迟到卡组列表覆盖新组；隐藏工作台快捷键仍写卡；加载期间导航恢复丢失 | `ai-wizard-audit.spec.ts`、`ai-wizard-interactions.spec.ts`、`quick-card-studio.spec.ts` |
| AI 文案与评分 | 零散重叠被标为完整支持，来源置信度被凭空抬高，摘录不一定来自材料；材料变化后仍沿用旧同意与预算 | `ai-card-gate.spec.ts`、`ai-quality-scorecard.spec.ts`；双语改为原文字词匹配含义 |
| 首页 | 统计失败触发无限重试；文档覆盖率迟到覆盖；刷新失败仍可按旧到期数开始；统计动画晚到覆盖未知态；导出失败无明确反馈 | `dashboard-suspend-restore.spec.ts`、`kit-stat.spec.ts` |
| 卡片库/详情/导航 | 保存、编辑、版本比较与知识对象注册迟到串卡；定点打开竞态/重复打开失效；确认目标跟随后续选择变化；简洁模式维护路由不可达；维护后保存另一卡错误跳转；重新进入卡库未清 scope | `card-detail-preview.spec.ts`、`manager-row.spec.ts`、`manager-view-state.spec.ts`、`hub-navigation.spec.ts` |
| 维护与持久化 | 应用/撤销并发、旧预览复用、撤销后反馈消失；坏日志加载；日志写盘前报告成功；日志保存失败未补偿；维护债务重复计数 | `maintenance-repair-controller.spec.ts`、`maintenance-repair.spec.ts`、`maintenance-page-persistence.spec.ts`、生产包 smoke |

维护控制器跨页面串行执行应用与撤销，预览单次消费；等待日志落盘后才返回成功。覆盖日志实际写入后抛错、卡片补偿失败、旧日志恢复失败、撤销保存失败及用户后续编辑冲突。补偿/日志恢复再次失败会报错并记录诊断；这不是文件系统原子事务，也不能代替外部备份。

隐私说明已披露 `maintenance-repair-journal.json` 保留最近 5 批修复记录及其中的卡片文本。结构门禁和 AI 原文字词对照不证明知识事实准确。

## 自动化与生产包门禁

以下结果来自本轮最终源码，不沿用旧版本数字。

| 检查 | 结果 |
| --- | --- |
| `pnpm test` | 163 个测试文件、1148 项测试全部通过 |
| `pnpm check` | TypeScript 两份配置通过；Svelte 0 错误、0 警告；版本一致为 0.210.1 |
| `node scripts/check-i18n.mjs` | 1769 个中英文叶键对齐，899 处代码引用命中 |
| `pnpm check:docs-facts` | 通过 |
| `pnpm build` | 清理生成目录，构建 hub/review/dialogs、shell、kernel 和 package.zip；自动执行生产包 smoke，通过 |
| 生产包 smoke | 实际执行 IIFE，检查三分包注册共存、生产服务边界、批修与坏卡补偿、帮助/报告/诊断 |
| `node scripts/check-governance.mjs` | 935 条记录、196 项完成、38 个工作包；门禁通过 |
| 主入口 gzip | Node zlib 实测 56034 bytes（54.72 KiB），55 KiB 预算内，余 286 bytes；未放宽预算 |
| `pnpm check:tokens` | 审计退出 0，覆盖率 90.6%；不代表所有历史样式已完成 token 化 |
| `git diff --check` | 通过 |

## Chrome 生产组件检查

在 Chrome 加载最终 `dist/chunks/review.js`、review/index CSS 与本机思源 daylight/midnight/base 样式。夹具的卡片、评分与保存回调仅在内存中，禁止外连，不操作用户笔记。它验证真实生产组件及布局，不是静态原型，也不等于真实宿主验收。

| 尺寸/场景 | 结果 |
| --- | --- |
| 375×568 浅色 | 修复前横向滚动宽度 387px，大于容器 365px；修复后同为 365px。滚到底四个评分按钮均可达 |
| 320×568 深色 | 容器/滚动宽度均为 310px；滚动高度 767px，滚到底评分区域底边 551.7px，小于 568px 视口 |
| 568×375 横屏 | 容器/滚动宽度均为 558px；滚动后评分区域底边 359px，小于 375px 视口 |
| 1280×800 桌面 | 复习内容宽度与滚动宽度均为 880px；整体高度 800px，无多余纵向溢出，评分区域底边 784px |
| 真实操作路径 | 显示答案 → 良好 → 下一卡成功；偏好弹窗中按 x 未跳过卡片，焦点保留在弹窗 |

截图：

- [375px 修复前](ui-release-v0.210.1/review-375-before.png) / [修复后](ui-release-v0.210.1/review-375-after.png) / [滚到底的评分区域](ui-release-v0.210.1/review-375-rating.png)
- [偏好弹窗](ui-release-v0.210.1/review-375-options.png)
- [320px 深色](ui-release-v0.210.1/review-320-dark.png)
- [横屏评分](ui-release-v0.210.1/review-landscape.png) / [桌面评分](ui-release-v0.210.1/review-desktop.png)

## 隔离思源内核检查

使用本机官方安装目录 `D:/RJ/SiYuan/resources/kernel/SiYuan-Kernel.exe` 与 `D:/RJ/SiYuan/resources`，运行 `node scripts/e2e-isolated.mjs`。脚本创建临时工作区和独立端口，最终 18/18 通过，覆盖生产包资源、建文档/卡组/卡、读取到期、评分、队列消费及测试数据清扫。

最终运行工作区：`C:/Users/Admin/AppData/Local/Temp/siyuan-lvcards-e2e-1792163612349`；端口 9409；内核 PID 61280，脚本已自动停止。该证据验证真实内核 I/O，不验证界面、Android 触控或真实 AI 服务。

## 尚待真实环境验收

- Chrome 打开独立思源宿主时返回 `Cross-site requests are not allowed`。未降低宿主保护；本轮没有完成真实思源中普通/挖空/图片遮挡/导入/旧坏卡的五路径 UI 验收。
- Android 宿主的触控、软键盘和视口恢复，以及真实模型的超时、失败、预算和输出质量矩阵，仍无本轮实测证据。
- 卡面统一预览中的公式是 LaTeX 文本包装，并不表示已经执行 KaTeX 渲染；真实复习依赖宿主内核 DOM，公式实际渲染仍需宿主复测。
- 本轮没有重新验证 GitHub 标签、CI、远端 Release 资产或集市索引；本地候选包不代表已经对外发布。

## 候选包

发布产物由 GitHub CI 重新构建：[package.zip](https://github.com/ai68298100/siyuan-lv-cards/releases/download/v0.210.1/package.zip)，[package.zip.sha256](https://github.com/ai68298100/siyuan-lv-cards/releases/download/v0.210.1/package.zip.sha256)。下表记录最终本地构建的对照包；CI 的 ZIP 元数据可能不同，发布资产摘要以下载的校验文件为准，内容验证采用解压后的文件对照。

| 项目 | 结果 |
| --- | --- |
| 清单版本 | `0.210.1`，与源码 package/plugin 清单一致 |
| ZIP 大小 | 916595 bytes |
| ZIP 条目 | 24 项（21 个文件、3 个目录）；逐文件 SHA-256 与最终 dist 一致 |
| 结构 | shell、kernel、三个 JS/CSS 分包、双语 i18n、README、图标/预览图及用户向文档齐全；无 assets 子目录、source map、源码或测试文件 |
| SHA-256 | `7a9754e801950d711844f83e7a3522c22fa93438865a2f67ecc941ddb138896d` |

收尾时重新运行了文档事实、治理与差异检查，全部通过。审计标签页、临时 launcher/生产组件夹具服务和本轮保留的临时思源内核已停止，证据文件保留，未停止其他思源实例。所有源码与文档仍处于本地未提交状态；发布时仍需由正常 GitHub 发布链验证远端标签、CI 和 Release 资产。
