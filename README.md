<div align="center">

# 小驴闪卡 · Lv Cards

**思源笔记的全能闪卡驾驶舱 —— 统计 · 管理 · 复习 · 考试 · AI 制卡，构建在内核原生 FSRS 调度之上**

[English](./README.en.md) ｜ 中文

[![Release](https://img.shields.io/github/v/release/ai68298100/siyuan-lv-cards)](./releases)
[![CI](https://github.com/ai68298100/siyuan-lv-cards/actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![SiYuan >= 3.8.0](https://img.shields.io/badge/%E6%80%9D%E6%BA%90-%3E%3D%203.8.0-blue)](https://b3log.org/siyuan/)

![小驴闪卡预览](preview.png)

</div>

思源笔记内置了 FSRS 闪卡，但用户点名缺失的两大模块至今空缺（[issue #10326](https://github.com/siyuan-note/siyuan/issues/10326)）：**闪卡管理**与**数据统计**。同时 Anki、Obsidian、RemNote、Quizlet、墨墨等产品验证过的大量优秀功能在思源侧均无对应实现。

小驴闪卡就是来补齐这一切的：调度**永远调用内核**（go-fsrs），插件只做增值驾驶舱——卸载插件零残留，与官方复习界面完全互通。

## ✨ 功能总览

| 模块 | 亮点 |
|---|---|
| 🃏 **复习** | 评分按钮间隔预览 · 四档/三档风格 · 忘记卡本批重现（不动调度）· 撤销评分 · 快速改期 · 打字判分 · 听写模式（TTS）· 选择题 · 图片遮挡 · 触屏滑动 · 源上下文预览 · 超时模式 · 会话中断恢复 |
| ✍️ **制卡** | 块制卡（支持多选批量）· 选中文本一键挖空 · 快速问答 · 标记符扫描（`术语:: 定义` 与 `？`结尾块）· AI 批量制卡（5 种输入源 + 单卡重生成 + 难度标注 + 模板库 + 回退链）· 图片遮挡编辑器 |
| 📊 **统计** | 热力图（17/26/52 周）· True Retention · 实测保持曲线（一键导出 PNG）· 周期对比 · 里程碑 · XP/等级（可选）· AI 批次质量与 token 消耗 |
| 🗂 **管理** | 分页浏览 · 文本/状态/烂卡筛选 · 按遗忘次数排序 · 批量重置/移除 · 选中卡导出 CSV · 卡片详情抽屉 · 已存筛选 |
| 🎓 **考试** | 计划倒排 + 每日目标 + pacing 进度 · cram 冲刺模式 · 30/7/1 天系统通知 · 考后复盘报告（可写入文档） |
| 🩺 **数据健康** | 复习日志 JSON/CSV 导出导入 · 多设备分叉检测与合并预览 · 存储体检 · 诊断复制（含 200 条环形日志） |
| 🔌 **工程** | 双轨 Gateway（3.8.x riff + 3.9.0 V2 自动探测）· 19 组件 UI Kit · 错误边界 · 主包 gzip ≤32KB（CI 门禁强制）· 27 单测 · 中英双语 |

## 🚀 安装

**普通用户**（思源 ≥ 3.8.0，全平台支持）：

1. 到 [Releases](https://github.com/ai68298100/siyuan-lv-cards/releases/latest) 下载最新的 `package.zip`（**不要解压**）
2. 思源 → 设置 → 集市 → 下载 → 左上角「导入安装包」→ 选择该 zip
3. 在 设置 → 集市 → 已下载 中启用「小驴闪卡」

**开发者**：

```bash
pnpm install
pnpm dev          # watch 构建 + 热重载（需思源运行中）
pnpm make-link    # 把 dist 软链到工作区 data/plugins/
```

## ⌨️ 30 秒上手

1. 选中任意块 → 点击块左侧图标 → **添加到卡组**；或在编辑器里选中文本 → **挖空并制卡**
2. 点击**顶栏驴头图标**：有到期直达复习，无到期打开闪卡中心（空工作区可用命令面板「生成示例工作区」先体验）
3. 复习面板：**空格**翻面，**1-4** 评分，`?` 查看全部快捷键

<details>
<summary><b>入口速查（点开）</b></summary>

| 入口 | 用法 |
|---|---|
| 顶栏驴头图标 | 左键 = 智能跳转（有到期→复习 / 无到期→中心）；右键 = 功能菜单 |
| 块图标菜单 | 添加到卡组 / 挖空并制卡 / 制作遮挡卡 / 从卡组移除（支持多选） |
| 面包屑按钮 | 「复习本文档」直达当前文档的闪卡 |
| 命令面板搜「小驴」 | 开始复习 / 快速制卡 / 标记符扫描 / 配对挑战 / 限时挑战 / 睡前巩固 / 生成示例工作区 / 打开使用帮助 / 复制诊断 等 |

</details>

## 📚 文档

| 你是 | 看这里 |
|---|---|
| 新用户 | [5 分钟上手指南](./docs/21-用户上手指南.md) · [FAQ 与故障排查](./docs/20-FAQ与故障排查.md) |
| 想了解定位与设计 | [docs 导览](./docs/README.md)（调研 → 总纲 → 模块规格 → 交互 → UI 规范） |
| 想参与开发 | [CONTRIBUTING](./CONTRIBUTING.md) · [组件库规范](./docs/16-UI组件库规范.md) · [待办清单](./docs/17-待办清单.md) |
| 关心数据与隐私 | [隐私说明](./docs/PRIVACY.md)（本地优先；AI 仅调用你配置的端点） · [SECURITY](./SECURITY.md) |

## 🛠 开发

```bash
pnpm check        # tsc + svelte-check + 版本门禁
pnpm test         # vitest 单测（27 个）
pnpm build        # 生产构建（app + kernel）
pnpm release      # 交互式发版（同步三处版本号并复跑门禁）
```

技术栈：TypeScript + Svelte 5 (runes) + Vite。架构决策见 [ADR](./docs/24-架构决策记录.md)，双轨 Gateway 与事件契约见 [docs/14](./docs/14-扩展架构与数据契约.md)。

## 🗺 路线图

- **v1.x**：FSRS 参数面板与优化器闭环 · Anki `.apkg` 导入 · 流式 AI 生成 · 知识图谱 · 卡组分享
- **V2 跟随**（思源 ≥ 3.9.0 自动激活）：官方统计深度可视化 · 第三方卡型桥接 · AST 查询构建器

## 🙏 致谢

- 构建于官方模板 [plugin-sample-vite-svelte](https://github.com/siyuan-note/plugin-sample-vite-svelte) 之上
- 调度 100% 来自思源内核的 [go-fsrs](https://github.com/open-spaced-repetition/go-fsrs)
- 功能调研参照：Anki 及其插件、Obsidian Spaced Repetition、RemNote、Logseq、Mochi、Quizlet、Brainscape、墨墨背单词、滑记、MarginNote、Knowt，以及思源社区插件（sy-tomato、flash-enhance、闪卡小助手 ZY、ankiLinker、AI Flashcards Native）

## License

[MIT](./LICENSE) © ai68298100
