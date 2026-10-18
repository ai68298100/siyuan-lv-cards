# 小驴闪卡 · 全方位审计报告（第一轮，2026-10-09）

- 基线：v0.208.1 + 本轮修复（未发版）
- 宿主：思源内核 3.8.6 隔离临时工作区（无头）+ browser-desktop 前端（headless Chrome/CDP）
- 方法：静态扫描（i18n 引用树 / 回调绑定 / 设置字段）→ 逐界面实走查（每步抓 console 异常 + 截图）→ 修复 → 全门禁回归
- 结果：**发现 5 个真缺陷（含 3 个 P0 级功能阻断），全部修复并有测试/门禁背书**；最终 104 spec / 730 测试全绿，check 0/0

## 修复的缺陷

### A-1 · P0 · i18n 引用完整性：26 处代码引用键树缺失（空白文案/崩溃）
- 现象举例：AI 向导审核步 16 个按钮/标签渲染为空白；紧急停用后生成抛 `Cannot read properties of undefined`（F-1）；考试里程碑/复盘、收件箱空源、总览 AI 进行中、保持率未知、能力分布标题等 toast/文案均为 undefined 或英文回退
- 根因类：check-i18n 只校验 zh/en 键数对齐，不校验「代码引用的键真实存在」
- 修复：补齐 29 键 ×2 语言（aiKill 命名空间、aiWizard 审核 16 键、examMilestone、examReportWritten、inboxEmptySource、dashboard.unfinishedAI/unknown、capability、review.choiceFallback、settings.personaNoChange）；**check-i18n 升级为引用完整性门禁**（高精度解析 703 处代码引用，全部命中才放行）
- zh 文案修正：完成屏提示 "recall 成功率" → "回忆成功率"

### A-2 · P0 · appendBlock 在内核 3.8.6 全线失效（快速制卡/引导示例卡/标记制卡「制卡失败」）
- 根因：`/api/block/insertBlock` 3.8.6 返回事务数组 `[{doOperations:[{id,action}]}]`，插件解析旧形态 `{operations:[{id}]}` → 永远取不到块 ID → `appendBlock` 返回空 → 调用方抛「制卡失败，请重试」
- 实测复现：引导第 2/3 步「创建示例卡」稳定失败（文档建出但块为空）；快速制卡同源
- 修复：`src/api/siyuan.ts` appendBlock 双形态兼容（数组事务/旧对象均支持，过滤 delete 操作）；UI 实测快速制卡真实建卡成功（deck due 0→1）；引导三步全通
- 注：e2e 之前没抓到是因为它走 riff API 造卡，不经 insertBlock

### A-3 · P0 · 挖空卡问题态答案明文泄露
- 根因：内核 getBlockDOM 把 `==text==` 渲染为 `<span data-type="mark">`，插件的遮罩 CSS（`.lv-masked mark`）与三处文本提取（打字判分/干扰项采样/配对游戏）只认 `<mark>` → 遮罩失效 + 三条功能链退化
- 修复：`card-face.ts` 新增 `MARK_SELECTOR` / `extractMarkTexts` 共享契约，review.svelte ×2、pairing-game.svelte ×2、index.scss 全部切换
- 实测：问题态 mark 文字 `color: rgba(0,0,0,0)`（透明）✓；配对游戏 6 对正常成局、挖空显示 `____` ✓

### A-4 · P0 · 「全部范围」到期队列恒为空（F-3 定性升级并插件侧修复）
- 定性：内核 3.8.6 的 `getRiffDueCards(deckID:"")` 不返回任何到期卡（API/UI 建卡、新卡/已排期卡均不可见；宿主自带闪卡面板同样为 0；重启内核、以笔记本 ID 命名内置卡组、设定过去到期时间均无效）→ 内核侧缺陷，普通工作区对照仍待做
- 影响：角标/总览统计/全部范围复习全部为 0——**新用户引导建完示例卡点「开始复习」直接看到「该范围没有到期的卡」**，首跑断裂
- 修复：`getRiffDueCards("")` 改为遍历全部卡组（跳过 size=0）逐组查询 + `mergeDeckDueResults` 合并去重（同卡多组保首个；新/旧计数从合并卡面 state 重算；单组失败按 null 降级）；并发 6 路
- 实测：总览「今日到期 7 · 新卡 6」恢复；全部范围复习队列正常加载与评分；新测试 deck-due-merge.spec ×4 + riff 契约测试适配（730 全绿）
- 遗留观察：复习面板空态提示「换个范围」但空态下不渲染范围选择控件（控件仅在队列非空时出现）——建议后续把选择器提升到空态也可见

### A-5 · P3 · 完成屏中文文案混入英文（"recall 成功率"）→ 已改「回忆成功率」

## 走查通过清单（本轮实测，browser-desktop）

引导三步（画像/示例卡/完成进复习，修复后全通）；复习面板（提示阶梯、翻面、四档 FSRS 间隔预览、评分推进、回看、撤销、跳过、暂停今天不学+存储持久化+设置恢复全部、源上下文内嵌面板、本场偏好浮层、时间预算 HUD、完成屏+五个收工原因 chips）；快速制卡（真实建卡）；配对挑战（6 对成局）；修卡演练（五步+双样例）；限时挑战；帮助文档；闪卡中心六页签（总览统计恢复/管理/制台/目标/收件箱/维护）；管理器行+详情抽屉（四分面/内容状态/知识对象/关系图）；顶栏左键+右键菜单 6 项；⌘K 命令面板（开/过滤/Esc 关）；设置面板（画像/评分/紧急停用/恢复/测试连接等控件历轮已验）；AI 前置检查零外发。

## 顺延（下轮建议顺序）

1. AI 向导审核步 UI 实测（A-1 已补文案，需真实模型走到第 2 步验证渲染；智谱 key 401 待换）
2. 普通工作区对照 A-4（区分隔离环境 vs 3.8.6 通用行为；如通用，可向思源官方反馈内核缺陷）
3. W-5 返场检查（需造 8 天前 revlog 数据）
4. Electron 桌面壳差异、Android 真机矩阵、亮暗主题+320/390px 快照回归
5. 观察项：浮层叠加时半透明穿透（回看层×偏好层同开，单层正常）；对话框防重入（API 连续打开可叠加）

## 复跑

```bash
pnpm build
SIYUAN_KERNEL="D:/RJ/SiYuan/resources/kernel/SiYuan-Kernel.exe" \
SIYUAN_RESOURCES="D:/RJ/SiYuan/resources" node scripts/e2e-isolated.mjs --keep
# Chrome + cdp.mjs 见 test-evidence/round-1/REPORT.md；i18n 门禁：node scripts/check-i18n.mjs
```
