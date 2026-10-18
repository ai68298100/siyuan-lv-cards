# 导入与迁移生产设置组件夹具 · 2026-10-18

此夹具直接挂载当前构建 `dist/chunks/dialogs.js` 导出的正式 `SettingsPanel`，使用正式 `dist/index.css`、`dist/chunks/dialogs.css` 和仓库中英文文案。传入 `initialSection: "imports"`，不加载插件 shell。

## 复现

从仓库根目录运行：

```powershell
pnpm build
node test-evidence/imports-2026-10-18/server.mjs
```

服务仅监听 `127.0.0.1:19068`，只允许白名单 GET 路由。启动时用已安装的 TypeScript 在内存中转译两个纯模块 `src/core/modules.ts`、`src/core/settings.ts`，执行源码 `defaultSettings()` 并通过 JSON 路由提供本次独立配置；不会读用户设置、加载 SDK、执行插件生命周期或生成临时文件。修改源码默认值后需重启服务；更新组件后需重新构建。

Chrome 推荐地址：

- 暗色中文，实际浏览器视口设为 320 × 568：<http://127.0.0.1:19068/?theme=dark&locale=zh-CN>。
- 亮色英文，实际浏览器视口设为 1280 × 800：<http://127.0.0.1:19068/?theme=light&locale=en>。
- 可选真正的 320 × 568 iframe：<http://127.0.0.1:19068/?theme=dark&locale=zh-CN&width=320&height=568>。
- 可选真正的 1280 × 800 iframe：<http://127.0.0.1:19068/?theme=light&locale=en&width=1280&height=800>。

iframe 模式的 CSS 媒体查询依据 iframe 内视口。主页面的浏览器视口需要容纳所选 iframe，超出时不应据父页面滚动认定组件横溢。页面顶栏的语言、主题和“重挂”均为夹具控制，不属于插件生产 UI。

## 受控上下文与边界

- `ctx` 为合成数据和回调。保存只更新 `window.__fixture.settings` 内存；导出只记录模拟反馈，不下载文件。日志合并、备份恢复、清空、V2 检测、AnkiConnect 请求等均抛出明确的受控失败，反馈显示在夹具顶栏。
- `fetchSyncPost` 固定返回非零内核响应；浏览器 `fetch` 对 `/api/` 或异源 URL 返回受控失败；服务器拒绝所有非 GET 请求。没有真实内核、模型、Anki、存储或网络写入。服务器 CSP 也限定同源连接与资源。
- Anki 采用纯浏览器真实能力探测：不提供 `require`，应显示不支持 SQLite 的说明；该降级不应隐藏 `.lvcards` 和 Obsidian 按钮。
- 为避免导入意外落盘，宿主确认弹窗故意不实现，任何调用均抛出“Fixture blocked real call”并反馈。测试取消文件选择、无卡片文件、格式错误文件和按钮可达性即可；此夹具不用于证明真实确认框、成功导入、幂等或持久化。
- 主题宿主变量和 `.b3-*` 基础控件样式为夹具的最小替身；组件自身布局与正式 CSS 直接来自生产构建。页面不挂载真实 `svelteDialog` 或共享 `trapFocus`，初始搜索焦点和关闭后回到“重挂”由夹具实现，不能当作真实宿主焦点证据。
- 浏览器组件证据不代表真实思源、Android、设备键盘、读屏器、Anki 宿主或文件系统验收。

## 后续 Chrome 走查步骤

1. 使用 Chrome 打开上述地址，等待顶部出现 `READY · production SettingsPanel · imports`。记录实际 `innerWidth/innerHeight` 与四个加载资源的 SHA-256；此文档不预先宣称测试通过。
2. 确认初始只出现卡片导入与数据分组，含迁移任务说明和“查看全部设置”；Anki 显示能力降级，`.lvcards`、Obsidian 按钮仍可见。
3. 分别搜索 `Obsidian`、`.lvcards`、`备份` / `backup`，验证命中；输入无匹配词验证空状态；清空恢复。
4. 按 Tab / Shift+Tab 检查可见文件按钮能获得焦点，隐藏文件 input 不接收焦点；激活 `.lvcards` 或 Obsidian 文件选择并取消，验证界面仍可继续。不要选择真实私人文件。
5. 点击“查看全部设置”，确认完整设置重新显示、搜索清空并聚焦。需要恢复 imports 初始场景时使用夹具“重挂”。
6. 触发连接测试、V2 重探或模拟日志导入，确认有明确失败反馈、忙碌状态结束且可重试；不将受控失败当真实 API 测试。
7. 在 320 暗色、1280 亮色下分别记录页面与组件的横溢、分组滚动、按钮换行及搜索/空状态截图。测试完成后 `Ctrl+C` 停止本地服务。

本轮已在 Chrome 完成 320px 暗色中文和 1280×800 亮色英文走查：任务范围、格式搜索、无结果与清空恢复、Anki 浏览器降级、按钮键盘可达、草稿保留和窄屏无横溢通过。截图为 `320-dark.jpg`、`320-dark-file-buttons.jpg`、`1280-light.jpg`；完整结果与边界见 [本轮审计记录](../../docs/audits/2026-10-18-import-workflow.md)。截图与夹具仍只代表受控 ctx/基础宿主 CSS 的生产组件证据，不代表真实思源、文件系统、共享焦点陷阱或导入成功。
