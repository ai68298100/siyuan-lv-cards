# 小驴闪卡 · 全方位审计报告（第九轮，2026-10-09）

- 基线：v0.208.1 + 前八轮修复 + 本轮修复（未发版）
- 宿主：思源内核 3.8.6 隔离工作区 + browser-desktop（headless Chrome/CDP）+ mock 端点 v2（即时/慢速 12s/拒答三形态）
- 主攻：AI 未完成作业断点恢复、AI 拒答策略、AI 安全阀（F-2 修复后 siyuan 模式复测）
- 结果：**发现并修复 1 个真 bug（F-6 拒答文本泄漏原始 JSON 异常）**；断点状态机验证通过；安全阀 siyuan 模式渲染复测通过；730 测试全绿

## 本轮修复

### F-6 · P2 · 模型拒答文本泄漏原始 JSON 异常
- 现象：mock 返回拒答文本（"抱歉，我无法根据这段材料…"，非 JSON）→ 向导显示原始 `Unexpected token '抱', "抱歉，我无法根据这…`——BU-11 拒答呈现被 parseCards 的 JSON.parse 异常绕过
- 根因：`index.ts:2249` `parseCards(raw)` 对非 JSON 输入直接抛 SyntaxError，只有"解析成功但为空"才走拒答呈现分支；"解析失败"（典型=模型拒答）泄漏原始异常
- 修复：parseCards 调用包 try/catch——解析失败视为 `format-failure` 拒答信号（detail=响应前 60 字符），与空响应同走可读拒答呈现（原因 + 重试一次 + 手工制卡建议）
- 回归实测：拒答端点 → 向导内红色友好提示 "AI response was empty or could not be parsed into cards (format failure): Retry once…; Quick-card entry is available for manual creation"，无原始异常泄漏 ✓

## 本轮验证通过

- **AI 断点状态机（ADR-7）**：慢端点（12s）生成中刷新页面 → ai-jobs.json 记录完整（generating → reviewing 两态同 ID 链）——作业状态机在中断-恢复场景的记录语义正确；总览未完成 tile 因作业已推进到 reviewing 不显示（口径符合）
- **安全阀 siyuan 模式复测（F-2 修复回归）**：全新 profile 下设置页「Emergency stop (AI kill switch)」+「Revoke」按钮渲染 ✓（本轮环境为英文默认，排除语言干扰）

## 本轮教训（审计方法）

- **语言陷阱**：R6 的「安全阀未渲染」复测中，fresh Chrome profile 未继承 zh-CN 设置——英文界面下用中文关键词检测全部落空，浪费两轮定位。此后所有环境初始化必须断言 `document.body` 语言状态后再检测
- CDP eval 中的 `const` 重复声明会导致 Assignment to constant variable——测试脚本变量命名需唯一

## 顺延

快速改期 UI、备份导出下载、周报开关生成、onboarding 完整三步、诊断输出——均为低风险小项；AI 审核步真模型对比（智谱 key 401×3）。

## 九轮累计

修复 **15 个缺陷**（A-1~A-4、C-2、C-3、D-1、E-1、F-1~F-6），门禁升级 1 项，730 测试全绿（104 spec）。本轮改动：`src/index.ts`（F-6）。
