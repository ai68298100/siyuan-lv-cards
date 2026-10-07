# Contributing / 贡献指南

感谢关注小驴闪卡（Lv Cards）！/ Thanks for your interest in Lv Cards!

## Development environment / 开发环境

```bash
pnpm install
pnpm dev          # watch build + livereload（需思源运行中）
pnpm make-link    # 将 dist 软链到工作区 data/plugins/
pnpm check        # tsc + svelte-check + 版本门禁
pnpm test         # vitest 单测
pnpm build        # 生产构建（app + kernel）
pnpm release      # 交互式发版改版（更新 plugin.json/package.json 并复跑门禁）
```

- Node ≥ 24, pnpm ≥ 12.5, SiYuan ≥ 3.8.0（调试内核 riff API 建议 3.8.x 最新版）。
- 插件开发速成见思源官方 [plugin-sample-vite-svelte](https://github.com/siyuan-note/plugin-sample-vite-svelte)。

## Architecture in 60 seconds / 架构 60 秒

- **双轨 Gateway**：运行时探测内核 flashcard V2（3.9.0 feature 分支），未激活走 riff API（3.8.x）。上层只依赖 Gateway。
- **内核唯一调度源**：评分/排程永远调内核（go-fsrs），插件只做增值层——请勿引入自建调度。
- **UI 必须 Kit 装配**：新界面只允许组合 [docs/16](./docs/16-UI组件库规范.md) 的组件；缺件先补 Kit。
- **体积预算**：`dist/index.js` gzip ≤55KB（CI 强制；最近基线约 52.89KB，治理脚本按 KiB 约 51KB 计），重组件一律懒加载 chunk。
- 全部架构决策见 [docs/24-ADR](./docs/24-架构决策记录.md)，设计基线见 [docs/10-16](./docs/README.md)。

## Smoke / e2e conventions / 冒烟与 e2e 约定

- 写型冒烟（建删笔记本/写块/riff）一律打**隔离靶场**：`node scripts/e2e-isolated.mjs` 自起临时 workspace + 无头内核；不要直打在用工作区或与他人共用的内核；
- 附着既有内核用 `SIYUAN_BASE_URL` / `SIYUAN_TOKEN`（缺 token 拒跑；共享内核会被 `siyuan-lv-cards-smoke-*` 前缀防呆拦截，豁免用 `SIYUAN_E2E_ALLOW_SHARED=1`）；
- 同一实例上的写型冒烟**串行**执行；只读走查可并发。详见 [docs/34](docs/34-真机验收清单.md)。
## Pull request checklist / PR 自检清单

1. `pnpm check && pnpm test && pnpm build` 全绿。
2. 主包 gzip 未超预算（CI 会拦）。
3. 新增 UI 走 Kit（PR 描述附使用的 Kit 组件清单）。
4. 面向用户的文案同时更新 `public/i18n/zh-CN.json` 与 `en.json`（`node scripts/check-i18n.mjs` 对齐）。
5. 涉及版本号时同步 `plugin.json` / `package.json` / `CHANGELOG.md` 顶部小节（`check-versions` 门禁强制）。
6. 不绕过内核调度、不引入第三方网络请求（AI 端点除外，须用户配置）。

## Issues / 反馈

- Bug 报告请附思源版本、插件版本与「设置 → 数据 → 复制诊断」的输出。
- 功能建议欢迎先看 [docs/17-待办清单](./docs/17-待办清单.md) 是否已在计划中。

## License / 授权

贡献即同意以 [MIT](./LICENSE) 授权发布。
