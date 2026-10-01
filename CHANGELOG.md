# Changelog

## v0.3.1 2026-10-01 · 代码审计修复（AJ 组 P0 批次）

* 修复 revlog 新卡统计永远为 0：首次有效评分计 `day.new`，新增 recalcDays 幂等重算并接入加载流程
* 修复回看状态机：评分后只存 `lastAnswered` 不再自动打开浮层；无历史时提示
* 修复问题态整卡隐藏：改为 mark 遮罩（题面可见、答案留空；规则移至全局样式）
* 内核响应统一校验：riff/v2 封装 code≠0 一律抛错；删除模板遗留 api.ts（SQL 注入面）
* Tab 销毁时 unmount Svelte 实例；复习倒计时 onDestroy 清理
* 评分/跳过提交锁（防连击重复写入）；跳过卡本场排除（不再被下一批拉回）
* 卡面异步加载请求序号（旧 DOM 竞态防护）；评分失败保留现场
* 设置热更新：复习面板经 settings() 实时读取评分风格/超时/随机顺序
* a11y：复习容器与回看浮层补 svelte-ignore；t 改 $derived，警告 8→2（余 2 为刻意初始化读取）
* GitHub：公开仓库 ai68298100/siyuan-lv-cards、Release v0.3.0（package.zip）、程序化 icon（scripts/gen-icon.mjs）
* 决策固化 docs/18（D1-D8），真机测试清单 docs/18 §二（🧪 等反馈）

## v0.3.0 2026-10-01 · UI Kit 成套化

* 新增 `src/ui/kit/` 十个组件：LvPage / LvSection / LvStat / LvProgress / LvTabs / LvEmpty / LvRow / LvHeatmap / LvChip / LvKbd（零业务依赖，仅令牌与 b3 类）
* index.scss 补全共享类：.lv-tabs 胶囊页签、.lv-chip2 语义章、.lv-kbd2、.lv-table 共享表格、.lv-skeleton 骨架屏
* 四屏完成 Kit 装配改造：总览（LvPage/LvStat/LvSection/LvHeatmap/LvChip + 骨架屏加载态）、管理器（LvPage/LvEmpty + 骨架屏）、设置（LvSection/LvRow/LvChip）、复习（LvKbd）
* docs/16 UI 组件库规范：分层规则（令牌→Kit→屏幕）、组件目录与 Props、可达性基线、六类未来屏幕装配配方（中心子导航/AI 向导/考试/数据/引导/移动端）、新组件准入流程
* docs/10/11/14 挂接：L3 层明示 UI Kit；FR 实现约定与 ModuleCtx.ui 均以 Kit 为唯一装配来源
* 验收标准：待开发屏幕（v0.9-v1.0）预计零新增组件即可完成装配

## v0.2.2 2026-10-01 · 质感与灵动细节轮

* 质感：卡片顶部发丝高光（inset 1px white 5%）、主按钮 hover 光泽扫过（32% white 斜向高光）、细滚动条、统计卡内渐变迷你目标进度条
* 灵动：统计数字 count-up（420ms，reduced-motion 直落）、评分条四键错峰入场（0/40/80/120ms）、翻面辉光脉冲 + 边框点亮、完成态渐变圆徽章 pop + 三段错峰 rise、热力图今日环、复习集表/管理器行 hover 箭头滑入
* 管理器新增当前页实时筛选（派生态即时过滤）
* 新动画全部置于 prefers-reduced-motion: no-preference 守卫内

## v0.2.1 2026-10-01 · 星轨 Starline 视觉系统

* 新增视觉设计系统 docs/15：理念（Linear/Geist/Things/HIG 谱系）、令牌表、组件解剖、动效规范、可达性与合规自检表
* `src/index.scss` 实装令牌：圆角/间距 8pt 网格、缓动三档、语义派生面（primary/danger/warn soft）、表面微渐变、双层软阴影、毛玻璃、焦点环（全部从 b3 变量 color-mix 派生，亮暗自适应）
* 仪表盘：页面容器化、统计卡（语义色点 + 渐变展示数字 + 悬浮抬升）、热力图五档透明度与 hover 外扩、复习集表 tabular-nums 行悬浮
* 复习面板：880px 单焦点舞台、评分条语义色 soft 底 + kbd 数字徽章 + 按压反馈、进度胶囊、回看浮层毛玻璃化（fade 过渡）、卡面悬浮微升
* 管理器：行卡片化（悬浮左缘主色竖条 + 海拔抬升）、容器对齐 1080px
* 设置：分区卡片化、画像卡悬浮/激活焦点环
* 动效全部尊重 prefers-reduced-motion

## v0.2.0 2026-10-01

完整设计定稿（docs/10-14）后，三轮完整优化：

**R1 · 架构对齐**
* 模块注册表升级为设计稿 M1-M12 体系（persona 亲和/阶段/网关锁定），旧 ID 自动迁移
* 画像预设包：备考/笔记/语言三预设一键套用（应用前确认，微调即转自定义）
* 入口矩阵落地：顶栏左键零层级开始复习、右键菜单、**今日到期角标**（60s 心跳 + 评分后即时刷新）

**R2 · 复习体验补全**
* 回看上一张（`[` 键/按钮，只读快照浮层，Esc 关闭）
* 「今天不学」（`s` 键/按钮）：本地屏蔽到次日，不动内核调度
* 超时模式：关闭/超时自动翻面/超时自动评遗忘，头部倒计时（≤10s 变红）
* 评分按钮显示快捷键数字；会话计数改为按 revlog 判定新卡（修复误计）
* 点击翻面热区防护：输入控件/链接/按钮不触发翻面（打字题预留）
* 随机顺序开关生效于插件队列；完成页新增「查看统计」

**R3 · 数据健康与收尾**
* 设置新增数据区：复习日志导出 JSON/清空（双重确认）、V2 状态展示与重新探测
* 新增 suspend-today 存储与 settings 版本化字段；i18n 键位全量补齐
* 版本 0.2.0

## v0.1.0 2026-10-01

* 项目骨架落地：基于官方 vite-svelte 模板重命名与重构
* `api/riff.ts`：内核 17 个 `/api/riff/*` 闪卡端点类型化封装
* `api/flashcardV2.ts`：内核闪卡 V2（feature/flashcard 分支 / 3.9.0）端点封装——迁移状态探测、复习会话、AST 查询、官方统计、AnkiConnect 兼容
* 启动时 V2 能力探测：仪表盘显示 V2 徽章与官方统计摘要，顶栏菜单显示迁移状态（Legacy/Preparing/Active/LegacyDiverged）
* 模块注册中心 + 设置对话框（模块开关/每日目标/评分风格/leech 阈值/考试模式预留）
* 统计仪表盘 MVP：今日概览、卡组表、复习热力图（本地 revlog 驱动）、连击
* 复习面板 MVP：块渲染、评分按钮下次间隔预览（nextDues）、四档/三档评分、快捷键、跳过、会话小结
* 闪卡管理器 MVP：跨卡包分页浏览、打开原文档
* 精简 kernel.js（echo RPC 占位）
* docs/：市场调研报告（40+ 产品）、功能全景矩阵（60 项）、技术方案、路线图、内核闪卡 V2 重构调研与应对
