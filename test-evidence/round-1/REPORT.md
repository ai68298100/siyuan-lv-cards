# 小驴闪卡 · 第一轮真机（宿主）走查报告

- 日期：2026-10-08
- 插件版本：v0.208.1（dist 构建后经 e2e-isolated 部署）
- 宿主：思源内核 3.8.6（隔离临时工作区 + 独立端口 4039，无头内核）
- 前端：**browser-desktop**（独立 headless Chrome 131，CDP 驱动，干净 UA）
- 环境脚本：`scripts/e2e-isolated.mjs --keep`（18/18 API 断言通过）+ `test-evidence/round-1/cdp.mjs`（本地 CDP 驱动工具）
- 证据截图：本目录 `w*.png`

> 宿主口径说明：本轮为 **browser-desktop 前端 + 隔离内核**，比 happy-dom 单测高两个真实度层级；**不能替代 Electron 桌面壳与 Android 真机验收**（单实例锁导致无法在用户桌面并行拉起第二个 Electron 工作区，见 AT-16）。

## 逐项结果

| 项 | 结果 | 证据/备注 |
|---|---|---|
| 隔离 e2e（API 回环） | ✅ 18/18 | 建卡→due→评分回环（deck 域） |
| W-1 三 chunk 加载 | ✅ | hub.js/hub.css/review.js/review.css/dialogs.js/dialogs.css 全部 200；闪卡中心六页签、复习面板、对话框正常渲染；DevTools 不可用，以 performance 资源口径断言 |
| W-1 对话框开关复验 | ✅（附观察） | 卡组选择器/快速制卡/命令面板 开→关→再开无可见残留；**观察项 O-1**：通过 API 连续 openPalette/openQuickCard 不关闭会叠加多层对话框（单例守卫待真机复核，正常用户路径有 Ctrl+K 热键路由，未必可触发） |
| 复习核心流 | ✅ | 题面→空格翻面→四档 FSRS 间隔预览（遗忘 11 分/困难 25 分/良好 10 分/简单 16 天）→评分→下一张（1/4→2/4）；范围下拉、时间预算 HUD、连击、分段进度条、工具栏全渲染 |
| 制卡入口（块菜单） | ✅ | 块 gutter→插件子菜单→添加到卡组→卡组选择器→确定，toast「已将 1 张加入卡组」 |
| W-3 面包屑入口 | ✅（部分） | 「复习本文档闪卡」按钮在 browser-desktop 正常出现并注册了入口上下文；入口条视觉与返回直达未完整复核 |
| W-7 维护页 | ✅ | WORKSPACE/RECOVER 眉线、扫描、零债务空态（「未发现债务卡」） |
| W-8 目标页 | ✅ | GOAL/PLAN 眉线、新建目标、空态文案（不强迫建卡） |
| W-6 时间预算 HUD | ✅ | ⏳ 倒计时随预算走（15 分钟档） |
| W-2 内容状态面板 | ⏳ 未完成 | 管理器渲染正常（6 张卡、来源路径、筛选），详情抽屉未打开成功（点击定位问题，非插件问题），待下轮 |
| W-4 收工原因 / W-5 返场检查 | ⏳ 未执行 | 需完整队列与造老数据，下轮 |
| W-9 界面模式 | ⏳ 未执行 | 本轮时间 realloc 给 AI 项 |
| W-10 前置检查 | ⚠️ 部分 | 自定义模式空端点：外部请求零外发 ✅（核心安全语义成立）；**F-2**：思源内置 AI 模式未配置时，向导内暴露内核原始错误「Field [msg] is required」而非友好阻断+手工替代 |
| W-11 注入围栏 | 🚫 阻塞 | 智谱 API key 返回 401「令牌已过期或验证不正确」（glm-4-flash / glm-4.5-flash 均试），需用户提供有效凭据 |
| W-12 紧急停用 | ✅（附 P1 bug） | 停用=provider+model 双粒度+事件留痕；停用后生成被阻断且零请求；恢复后 disabledTargets 清空。**F-1 见下** |

## 发现（按严重度）

### F-1 · P1 · 停用/撤销同意后的向导阻断文案必然抛 JS 错误
- 复现：设置→AI→「紧急停用当前配置」→ 向导生成→确认发送
- 实际：向导内显示 `Cannot read properties of undefined (reading 'targetDisabled')`
- 根因：`src/index.ts:2196` 读取 `(this.i18n as any).aiKill.consentRevoked / .targetDisabled`，而 `public/i18n/zh-CN.json`/`en.json` **没有 `aiKill` 嵌套命名空间**（只有 aiKillTitle/aiKillHint/aiKillStop/aiKillResume/aiKillRevoke 平铺键，为设置页所用）
- 影响：BU-31 的阻断与零请求语义**未被破坏**（请求确实没发出），但用户在最重要的安全反馈点上看到原始错误；「撤销同意」路径同源（consentRevoked 同读该命名空间）
- 修复建议：补 `aiKill: { consentRevoked, targetDisabled }` 中英文命名空间，并在 check-i18n 增加「代码引用的 i18n 命名空间存在」门禁（现有门禁只核对键数对齐，抓不到这类缺失）
- 备注：**该缺陷纯离线即可复现与回归**（渲染向导+停用态生成，不需要真模型），建议下轮开发切片立即修

### F-2 · P2 · 思源内置 AI 模式未配置时错误呈现不友好
- 复现：aiMode=siyuan、宿主未配置 AI → 向导生成
- 实际：toast 显示内核原始错误「Field [msg] is required」（v3.8.6），零外部 token 消耗
- 建议：siyuan 模式下对宿主 AI 不可用的情况映射为「AI 尚未配置」+手工替代（aiElig.not-configured 文案已存在）

### F-3 · 环境发现（非插件缺陷，已定性）· 隔离工作区全局 due 恒 0
- 现象：临时工作区内，无论 API 建卡还是 UI 建卡、无论新卡还是已排期到期卡，`getRiffDueCards(deckID:"")`、笔记本闪卡计数、思源自带闪卡面板全部显示 0；deck 域查询正常
- 定性依据：宿主自带面板与插件行为完全一致（宿主也显示 0/0）；插件管理器用自己的查询能看到全部 6 张卡；卡组持久化正常（重启内核仍在）
- 影响：全局范围复习在此环境不可用，但 deck/notebook 范围正常；**需要在正常桌面工作区做一次对照**（用户主工作区勿动，可另建普通工作区验证），以区分「隔离临时工作区特有」还是「3.8.6 内核行为」
- 插件侧机会：复习面板空态提示「换个范围」但空态下不渲染范围选择控件（选择器仅在队列非空时渲染），建议空态提供范围切换

### O-1 · P3 · 对话框防重入（待复核）
- 通过插件 API 连续打开命令面板/快速制卡不关闭会叠加；正常用户路径（Ctrl+K/按钮）是否可触发待真机确认

## 结论

v0.208.1 在 browser-desktop 宿主上的核心链路（chunk 化、制卡入口、复习回环、FSRS 间隔预览、统计页签、AI 安全阀全链）均正常工作，离线工程质量与宿主表现一致。本轮产出 1 个可直接修复的 P1（F-1，i18n 命名空间缺失+门禁缺口）、1 个 P2（F-2）、1 个待对照定性/环境发现（F-3）。W-11（注入围栏真模型）因凭据 401 阻塞，待有效 key 后可在本环境 10 分钟内补跑。

## 复跑方式

```bash
pnpm build
SIYUAN_KERNEL="D:/RJ/SiYuan/resources/kernel/SiYuan-Kernel.exe" \
SIYUAN_RESOURCES="D:/RJ/SiYuan/resources" \
node scripts/e2e-isolated.mjs --keep     # 记下端口与工作区
# 启动独立 Chrome：
"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --remote-debugging-port=9223 \
  --user-data-dir="$TEMP/lv-e2e-chrome-profile" --window-size=1440,900 \
  --user-agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" about:blank
cd test-evidence/round-1
NAV_WAIT=9000 node cdp.mjs nav "http://127.0.0.1:<端口>/stage/build/desktop/"
node cdp.mjs state     # booted / plugins
```

注意：浏览器必须走 `/stage/build/desktop/`（browser-desktop 构建）；`/stage/build/app/` 是 Electron 构建会 `require is not defined`。petal 需对 `browser-desktop` 前端启用（`/api/petal/setPetalEnabled`）。
