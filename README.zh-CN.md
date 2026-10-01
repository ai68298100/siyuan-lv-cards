# 小驴闪卡（Lv Cards）

[English](./README.md)

思源笔记的**闪卡驾驶舱与大杂烩**：统计仪表盘、闪卡管理器、自研复习面板、考试倒排、Anki 导入、AI 制卡——全部构建在内核**原生 FSRS 调度之上**（绝不替换调度）。

> 🚀 **5 分钟上手**：[用户上手指南](./docs/21-用户上手指南.md) ｜ ❓ [FAQ 与故障排查](./docs/20-FAQ与故障排查.md) ｜ 🔒 [隐私说明](./docs/PRIVACY.md)
>
> 📐 设计文档：[docs/](./docs/) —— 40+ 闪卡产品市场调研（00-01）、60 项功能全景矩阵（02）、内核 V2 重构应对（05），以及完整自上而下设计：**10 设计总纲 → 11 模块与功能规格 → 12 交互设计规范 → 13 UI 原型图 → 14 扩展架构与数据契约**。

## 为什么做

思源内置了 FSRS 闪卡，但用户点名缺失的两大模块至今空缺（[issue #10326](https://github.com/siyuan-note/siyuan/issues/10326)）：**闪卡管理**与**数据统计**。同时 Anki、Obsidian、RemNote、Quizlet、墨墨等产品验证过的大量优秀功能在思源侧均无对应实现。小驴闪卡就是来补齐这一切的。

## 当前状态：v0.55.0

**复习**：评分间隔预览 · 四档/三档风格 · 快捷键（含 ? 速查浮层）· 回看 · 今天不学 · 超时模式 · 忘记卡本批重现 · 撤销评分 · 快速改期 · 打字判分（LCS 差异）· 听写模式（TTS）· 选择题 · 图片遮挡 · 触屏滑动 · 源上下文预览 · 安全区适配 · 会话中断恢复 · 会话时长与目标进度

**制卡**：块制卡（含批量）· 挖空快捷制卡 · 快速问答 · 标记符扫描（`::` 与 `？`）· AI 批量制卡（四种输入源 + 预览编辑 + 批次质量追踪）· 图片遮挡编辑器 · 重复添加提醒

**统计与中心**：六指标计数动画 · 热力图 · 连击 · True Retention · 实测保持曲线（可导出 PNG）· 周期对比 · 里程碑与 XP/等级（可选）· AI 批次质量 · 烂卡清单 · 分页管理器（文本/路径/排序/状态/烂卡筛选、批量重置移除、卡片详情抽屉）

**考试**：计划倒排 + 每日目标 + pacing 进度 + cram 模式 + 30/7/1 天系统通知 + 考后复盘报告

**数据**：复习日志 JSON/CSV 导出导入（含多设备分叉检测与合并预览）· 2 万条性能预算单测 · 设置/画像 JSON 导入导出 · 存储体检 · 诊断复制（含内核版本）

**工程**：双轨 Gateway（riff 3.8.x + V2 3.9.0 feature 分支，探测落库 + gateway-changed 事件）· UI Kit 14 组件 + Starline 设计令牌 · hub 错误边界 · 主包 gzip 29KB（预算 32KB，CI 门禁强制）· 26 单测 · i18n 中英 448 键对齐

精简内核插件（`kernel.js`）保留 echo 桩，为多端共享状态留位。

## 路线图

- **v1.0**：仪表盘完整版（未来负荷、真实保持率）、管理器批量操作与烂卡识别、FSRS 参数面板与预设组
- **v1.x**：FSRS 优化器闭环（revlog 导出 → 优化 → 权重写回）、考试 deadline 倒排、Anki `.apkg` 导入、AI 制卡（必过预览）、打字题、标签与高级搜索
- **v2.x**：图片遮挡、选择题/配对/限时挑战、TTS 与白板、对话式复习、知识图谱、卡组分享

完整计划见 [docs/04-路线图.md](./docs/04-路线图.md)。

## 开发

```bash
pnpm install
pnpm dev          # watch + livereload
pnpm make-link    # 软链 dist 到工作空间 data/plugins/
pnpm build        # 生产构建（app + kernel）
```

依赖 Node ≥ 24、思源 ≥ 3.8.0。插件 ID / 仓库名：`siyuan-lv-cards`。

## 致谢

- 基座：[siyuan-note/plugin-sample-vite-svelte](https://github.com/siyuan-note/plugin-sample-vite-svelte)
- 调度 100% 来自思源内核的 [go-fsrs](https://github.com/open-spaced-repetition/go-fsrs)，本插件是驾驶舱而非替代品
- 功能调研来源：Anki 及其插件生态、Obsidian Spaced Repetition、RemNote、Logseq、Mochi、Quizlet、Brainscape、Memrise、墨墨背单词、滑记、MarginNote、Knowt，以及思源社区插件（sy-tomato、flash-enhance、闪卡小助手 ZY、ankiLinker、AI Flashcards Native）
