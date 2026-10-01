# 小驴闪卡（Lv Cards）

[English](./README.md)

思源笔记的**闪卡驾驶舱与大杂烩**：统计仪表盘、闪卡管理器、自研复习面板、考试倒排、Anki 导入、AI 制卡——全部构建在内核**原生 FSRS 调度之上**（绝不替换调度）。

> 🚀 **5 分钟上手**：[用户上手指南](./docs/21-用户上手指南.md) ｜ ❓ [FAQ 与故障排查](./docs/20-FAQ与故障排查.md) ｜ 🔒 [隐私说明](./docs/PRIVACY.md)
>
> 📐 设计文档：[docs/](./docs/) —— 40+ 闪卡产品市场调研（00-01）、60 项功能全景矩阵（02）、内核 V2 重构应对（05），以及完整自上而下设计：**10 设计总纲 → 11 模块与功能规格 → 12 交互设计规范 → 13 UI 原型图 → 14 扩展架构与数据契约**。

## 为什么做

思源内置了 FSRS 闪卡，但用户点名缺失的两大模块至今空缺（[issue #10326](https://github.com/siyuan-note/siyuan/issues/10326)）：**闪卡管理**与**数据统计**。同时 Anki、Obsidian、RemNote、Quizlet、墨墨等产品验证过的大量优秀功能在思源侧均无对应实现。小驴闪卡就是来补齐这一切的。

## 当前状态：v0.2.0

- `src/api/riff.ts` —— 内核 17 个 `/api/riff/*` 端点的类型化封装
- `src/api/flashcardV2.ts` —— 内核闪卡 V2（feature/flashcard 分支 / 3.9.0）封装与迁移状态探测
- 模块注册表对齐设计稿（M1-M12，画像亲和/阶段标注），旧 ID 自动迁移
- **画像预设包**：备考冲刺 / 卡片笔记 / 语言学习，一键套用模块与参数组合
- **入口矩阵**：顶栏左键零层级开始复习、右键菜单、**今日到期角标**（60s 心跳刷新）
- **复习面板**：评分按钮下次间隔预览、四档/三档双风格、快捷键、回看上一张、「今天不学」（次日自动恢复）、超时模式（翻面/评遗忘 + 倒计时）、会话小结
- **闪卡中心**：总览（六指标/热力图/连击/复习集表/V2 徽章与官方统计摘要）+ 分页管理器
- 设置：画像预设、模块开关、评分风格、超时、每日目标、数据区（日志导出/清空、V2 重探）
- 精简内核插件（`kernel.js`），为后续多端共享状态留位

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
