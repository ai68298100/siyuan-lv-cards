# Security Policy / 安全策略

## Supported versions / 支持版本

Only the latest GitHub Release receives security fixes. / 仅为最新 Release 提供安全修复。

## Reporting a vulnerability / 漏洞反馈

**Please do NOT open a public issue for security vulnerabilities.** / 请勿以公开 Issue 报告安全漏洞。

- Use GitHub [Private Vulnerability Reporting](https://github.com/ai68298100/siyuan-lv-cards/security/advisories/new) (Security → Report a vulnerability), or
- 私信联系作者（思源社区 / ld246 站内信，用户名 ai68298100）。

You will get a response within 7 days. / 预期 7 天内响应。

## Scope / 范围

- This plugin stores review data **locally in the SiYuan workspace** (synced only if the user enables SiYuan sync).
- AI features send text **only to the endpoint the user configures** (SiYuan built-in AI or a custom OpenAI-compatible endpoint); keys are stored in the local workspace `settings.json`.
- Review data never leaves the machine unless the user exports it or enables workspace sync.
- 本插件复习数据全部存于本地工作区；AI 功能仅调用用户自行配置的端点；未导出/未开启同步时数据不出本机。详见 [PRIVACY.md](./PRIVACY.md)。
