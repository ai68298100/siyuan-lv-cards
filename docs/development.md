# 开发交付指南

本文面向第一次接手小驴闪卡的开发者。当前代码基线为 **v0.209.3**，最低支持思源 **3.8.0**，推荐使用 Node.js **24 或更高版本**与 pnpm **12.5.1**。发布包由 GitHub Actions 按 `v*` 标签构建；本地构建不会自动发布。

## 从零运行

在仓库根目录执行：

```bash
pnpm install
pnpm check
pnpm test
pnpm build
```

`pnpm build` 会生成 `dist/`、仓库根目录的 `package.zip`（内核构建阶段）以及 app 的 `hub`、`review`、`dialogs` 分块。若要在桌面思源中开发：

```bash
pnpm make-link
pnpm dev
```

`make-link` 会把 `dev/` 链接到思源工作区的 `data/plugins/siyuan-lv-cards`。脚本会先尝试从运行中的思源读取工作区；自动发现失败时必须设置 `SIYUAN_PLUGIN_DIR`。`pnpm dev` 需要思源保持运行，且同时启动 app 与 kernel 的 watch 构建。开发模式会内嵌 sourcemap，生产包不要使用 `dev/`。

没有思源窗口时，可运行隔离内核冒烟：

```bash
pnpm build
node scripts/e2e-isolated.mjs
```

该脚本默认创建临时 workspace 和无头内核。它只覆盖资源服务、插件启用和 riff 制卡/到期/评分回环，不覆盖 UI 渲染；UI、Android、真实模型仍按[真机验收清单](./34-真机验收清单.md)人工执行。

## 目录结构

| 路径 | 责任 |
|---|---|
| `src/index.ts` | 插件入口、思源入口注册、Tab/Dialog 装配、存储和跨页面事件连接；不是领域算法的事实源 |
| `src/ui/*.svelte` | 总览、管理、制卡、复习、目标、考试、设置等页面；页面负责状态、表单校验和用户反馈 |
| `src/ui/kit/` | `Lv*` 通用 UI 组件和确认/计数工具；组件不直接请求数据。装配配方见 [UI 组件库规范](./16-UI组件库规范.md)，完整 Props/状态目录见 [组件目录与状态契约](./46-组件目录与状态契约.md) |
| `src/api/` | 思源内核、riff/V2、AI、Anki 等外部边界适配；正式调度始终由思源内核 FSRS 负责 |
| `src/core/` | 卡片、复习会话、目标、考试、AI 安全、迁移、统计等纯领域逻辑 |
| `src/libs/` | 统一请求策略（去重/代次/超时/取消/读重试）、持久化快照队列、缓存、事件、焦点、分块加载等基础设施 |
| `src/types/` | 思源和插件数据类型声明 |
| `public/i18n/` | 中英文 YAML/JSON 文案源；中英文键必须同步 |
| `docs/` | 用户文档、设计规范、原型、验收和治理记录；计划文档不能替代代码证据 |
| `tests/` | Vitest 纯逻辑、Svelte 组件和 UI 语义回归测试 |
| `scripts/` | 版本、检查、构建、冒烟、部署和开发辅助脚本 |

## 环境变量

环境变量均为脚本或构建开关，不写入插件运行时设置。

| 变量 | 用途 | 默认/注意 |
|---|---|---|
| `SIYUAN_PLUGIN_DIR` | `make-link` 自动发现失败时指定 `data/plugins` 目录 | 必须是已有目录 |
| `LV_DEVICE_PLUGIN_DIR` | `deploy:device` 的目标插件目录 | 必须设置为已存在的插件目录；若目标构建含 i18n，还需预先有 `i18n/` 子目录；不会猜测本机路径 |
| `VITE_BUILD_TARGET` | Vite 构建 `app` 或 `kernel` | package scripts 已设置，通常不手动指定 |
| `VITE_CHUNK` | 单独构建 `hub`、`review` 或 `dialogs` 分块 | 仅构建脚本内部使用 |
| `VITE_SOURCEMAP` | 设为 `inline` 生成内嵌 sourcemap | 开发脚本已设置；生产默认关闭 |
| `NODE_ENV` | Vite 开发/生产模式 | package scripts 已设置 |
| `SIYUAN_BASE_URL` | e2e 附着既有内核的地址 | 与 `SIYUAN_TOKEN` 同时使用；不传则自起隔离靶场 |
| `SIYUAN_TOKEN` | e2e/冒烟内核 API token | 缺失时附着模式拒绝运行，不使用默认 token |
| `SIYUAN_E2E_ALLOW_SHARED` | 显式允许在含用户笔记本的共享内核运行写型冒烟 | 仅设为 `1` 时生效，有污染风险 |
| `SIYUAN_KERNEL` | 隔离 e2e 使用的 `SiYuan-Kernel.exe` 路径 | 默认是开发机参考路径，跨机器应显式设置 |
| `SIYUAN_RESOURCES` | 隔离 e2e 的思源 resources 目录 | 默认是开发机参考路径，跨机器应显式设置 |

`SIYUAN_E2E_AI=1` 目前只写在 e2e 源码注释中，作为未来增加真实 AI 检查时的约定；现有脚本不读取它，也没有 AI e2e 步骤，因此它不是当前生效的配置项。

不要把 AI key、思源 token 或真实用户目录提交到仓库、`.env`、测试夹具或 issue。AI 服务由用户在思源设置或插件配置中提供，核心制卡和复习不依赖 AI。

## 脚本清单

以下是 `package.json` 当前全部脚本：

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 并行运行 app 与 kernel 的 watch 构建 |
| `pnpm dev:app` | 开发模式构建 app，输出到 `dev/` |
| `pnpm dev:kernel` | 开发模式构建 kernel，输出到 `dev/` |
| `pnpm check` | 依次运行类型、Svelte 和版本检查 |
| `pnpm check:types` | 两个 tsconfig 的 TypeScript 无输出检查 |
| `pnpm check:svelte` | `svelte-check` 模板、类型和可访问性检查 |
| `pnpm check:versions` | 校验 `plugin.json`、`package.json` 和 CHANGELOG 版本一致 |
| `pnpm check:docs-facts` | 校验 README、用户文档和治理文档中的当前版本事实 |
| `pnpm test` | 运行 Vitest 全部测试 |
| `pnpm release` | 交互式更新版本后运行 `check`；不会创建 Git 标签或发布 |
| `pnpm release:version` | 交互式同步 `plugin.json` 与 `package.json` 版本 |
| `pnpm update-version` | `release:version` 的别名 |
| `pnpm clean` | 删除 `dist/` 与根目录 `package.zip` |
| `pnpm build` | 清理后构建 app、kernel，并执行发布包 smoke |
| `pnpm build:app` | 构建 hub/review/dialogs 分块和 app shell |
| `pnpm build:shell` | 构建 app 主 shell |
| `pnpm build:chunk:hub` | 构建闪卡中心分块 |
| `pnpm build:chunk:review` | 构建复习分块 |
| `pnpm build:chunk:dialogs` | 构建对话框分块 |
| `pnpm build:kernel` | 构建内核插件并生成 `package.zip` |
| `pnpm smoke:dist` | 在 happy-dom 中执行发布分块，检查注册表、路径和共存契约 |
| `pnpm deploy:device` | 将运行入口、i18n 与 UI 分块复制到 `LV_DEVICE_PLUGIN_DIR` |
| `pnpm make-link` | 创建开发目录链接 |
| `pnpm make-link-win` | 以 Windows 提权方式运行开发目录链接脚本 |
| `pnpm make-install` | 构建后将整个 `dist` 复制到通过运行中的思源发现并选择的插件目录 |

常用的独立检查还包括 `node scripts/check-i18n.mjs`（中英文键和源码引用）、`node scripts/check-governance.mjs`（待办治理和体积门禁）与 `node scripts/e2e-isolated.mjs --keep`（保留靶场供人工走查）。

## 构建、安装与部署

本地验证发布包：

```bash
pnpm build
Get-ChildItem dist
```

Windows PowerShell 可使用 `pnpm deploy:device` 部署到已存在且已设置的真机插件目录；桌面开发优先使用 `make-link`。`make-install` 和 `make-link` 都需要思源运行以发现工作区；`make-link` 在发现失败时可通过 `SIYUAN_PLUGIN_DIR` 指定 `data/plugins` 目录，`make-install` 没有这个环境变量回退。手工安装时，在思源 **设置 → 集市 → 下载 → 导入安装包** 选择仓库根目录的 `package.zip`（或 GitHub Release 的 `package.zip`），不要解压后只复制 `index.js`，因为分块、i18n 和 manifest 必须一起存在。

正式发布由 `.github/workflows/release.yml` 触发：先保证提交已进入 `main`，同步两个 JSON 版本和 CHANGELOG 顶部小节，再推送 `v<version>` 标签。CI 会重新安装依赖、运行 `check`、测试、文档事实、构建、治理和包内容校验，然后上传 `package.zip` 与 SHA-256。推送标签不会绕过真机验收，也不会自动完成思源集市 PR。

## 已知限制

- UI 结构、视觉、文案、交互状态与响应断点的唯一规范事实源是 `docs/prototypes/lv-cards-r54.html`；R53 仅作既有生产界面的历史参考。生产实现与原型的差异见 [docs/45](./45-R54实现对照与验收台账.md)。原型使用合成数据，不证明思源落盘、FSRS 评分、真实模型或多窗口行为；组件 API 和责任边界见 [docs/46](./46-组件目录与状态契约.md)。
- `src/libs/request.ts` 的 `requestWithPolicy`/`postJSON` 和 `src/libs/kernel-request.ts` 统一提供只读去重、latest-key 代次保护、超时、调用方取消和最多两次读重试；写请求默认不透明重试。思源 `fetchSyncPost` 不能由插件真正 Abort，超时后底层调用仍可能在宿主后台完成，但迟到结果会被取消订阅或代次检查丢弃。内核全局 token 由思源宿主管理，插件没有独立登录 API；401/403 会被分类并给出重新登录/权限提示，真正跳转登录和回跳原页面仍需宿主公开导航契约后再接入。
- `createPersist` 在入队时捕获 JSON 快照，并提供 `saveOnce(key, operationId, data)` 防重复提交；设置、收件箱、复习日志、AI 提交文档和安全开关等高风险写入在失败时保留旧快照或回滚。未改造的旁路写入仍由统一队列重试并通过全局存储失败提示暴露，不能把提示当作宿主磁盘成功证据。
- 真实 AI 的 401、限流、配额、服务器错误、敏感内容和旧响应矩阵需要用户配置模型后按 [docs/34](./34-真机验收清单.md) 验证；没有配置 AI 时手工制卡仍可用。
- Android 真机的 320px、软键盘、安全区、返回键、后台恢复、TTS 和读屏尚未形成完整证据；桌面窄屏或浏览器模拟不能替代该验收。
- OCR 接入暂缓到思源 3.8.7 正式版。alpha 接口、提供商设置、图片外发提示、空结果和取消语义尚未作为插件能力发布。
- Anki `.apkg` 入口只在宿主同时提供 `node:sqlite` 与 `node:zlib` 时显示；真实桌面导入和非桌面降级仍待验收。
- 考试计划变更目前仅支持同一思源 Kernel 下、已连接前端之间的刷新提示：前端先将计划写入插件持久化存储，Kernel 插件只校验并临时转发失效通知，不保存计划副本。断线期间的通知不会补发，前端在 Kernel 插件恢复到 running 后重读当前持久化快照；因此这不是设备间同步或持久消息队列，也不提供并发编辑冲突合并/原子性保证。代码入口为 `src/core/exam-plan-sync.ts`、`src/kernel.ts`、`src/index.ts` 和 `src/ui/hub.svelte`，同一 Kernel 多窗口宿主验收仍待完成。
- 当前工作区生产构建实测为全部 9 个 JS/CSS 文件 869,250 B raw、261,297 B gzip、222,894 B Brotli；`index.js` gzip 为 52,130 B，低于 55 KiB 治理门槛。基线 `e5520b7` 与当前工作区的同工具对照、收件箱微基准和限制见 [R54 性能测量记录](../test-evidence/performance/2026-10-14-r54.md)。全量文件 gzip 相对基线增加，且当前工作树包含功能变更；尚无相同思源宿主下的 LCP/INP/CLS 数据，不应据此宣称整体加载变快或包体变小。

遇到行为不确定时，先查 [R54 实现对照与验收台账](./45-R54实现对照与验收台账.md)、[组件库规范](./16-UI组件库规范.md)和[真机验收清单](./34-真机验收清单.md)，再以源码、测试输出和宿主证据更新文档。
