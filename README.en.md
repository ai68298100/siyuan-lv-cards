<div align="center">

# Lv Cards (Beta) · 小驴闪卡（内测版）

**Turn your notes into long-term knowledge you can actually use.**

The full-lifecycle flashcard learning platform for SiYuan — local-first, native FSRS scheduling, auditable AI assistance

中文 ｜ [English](./README.en.md)

[![Release](https://img.shields.io/github/v/release/ai68298100/siyuan-lv-cards)](https://github.com/ai68298100/siyuan-lv-cards/releases/latest)
[![CI](https://github.com/ai68298100/siyuan-lv-cards/actions/workflows/ci.yml/badge.svg)](https://github.com/ai68298100/siyuan-lv-cards/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![SiYuan >= 3.8.0](https://img.shields.io/badge/SiYuan-%3E%3D%203.8.0-blue)](https://b3log.org/siyuan/)

![Lv Cards preview](preview.png)

</div>

> **Note**: The primary README and all design docs are in Chinese. This page covers the essentials; see [docs/](./docs/README.md) for full design material.

Lv Cards turns blocks worth remembering into traceable flashcards, scheduled by SiYuan's native FSRS algorithm with optional, auditable AI assistance. The current version is **v0.210.5** (2026-10-17), delivering native .lvcards sharing package export/import, touch haptic feedback, and custom card CSS. See [GitHub Release](https://github.com/ai68298100/siyuan-lv-cards/releases/tag/v0.210.5) for the package and publishing status.

## What's New in v0.210.5

- Fully upgrade and adapt to official SiYuan SDK `siyuan@1.2.9`, fixing `i18n` declaration typing conflicts with `JSONValue` assignments and `Custom` tab model contexts.
- Merge core dependency upgrades: `vite@8.3.4`, `@types/node@26.6.5`, `happy-dom@21.0.3`, `npm-run-all2@9.0.3`, and CI workflow `actions/setup-node@7.1.0`.
- Safe request contract adaptation: harmonize generated kernel API route signatures in `ai.ts` and `flashcardV2.ts`.
- Review & onboarding experience: streamlined review topbar with core 5 pinned actions and secondary tools collapsed into a clean `··· More` popover; added "Notes are Flashcards" empty state onboarding card.
- Post-release workspace fixes (not yet published as a new version): notebook AI material queries now include document roots; interleaved Obsidian deck hints preserve block mapping and persist the ledger after each successful group; the Learning hub now exposes recap, plans, and calendar facets with keyboard date selection and forecast retry; bidirectional quick-card creation reuses one target document.

## Previous Update: v0.210.1

- **Consistent card checks:** Creation, imports, and edits validate the final card before adding it. Ordinary cards require an answer marker and a visible question; image occlusion requires an image and valid regions. AI candidates gain high-confidence quality checks, and Anki/Obsidian imports gain safer cleaning and error feedback. These checks cannot establish factual accuracy; human review remains necessary.
- **Old cards and maintenance:** Invalid old cards are isolated for the current review session without changing due dates, ratings, or logs. Maintenance detects answer-only cards, checks media, offers side-by-side approximate-duplicate review with saved decisions, and returns to a fresh scan after editing.
- **Repair and source history:** Batch repairs offer drafts, before/after previews, confirmation, and a persisted repair journal. Failed repairs restore the exact old snapshot, including invalid old cards that normal editing checks would reject; successful batches expose conflict-protected undo while normal edits still require validation. A rollback is blocked when a card changed after repair, and the journal records repair events rather than every edit. Source fingerprints and issue history persist independently of the current deck, including detection and handling times.
- **Recovery and device behavior:** Failed lazy loads can be retried, maintenance work loads on demand within the existing 55 KiB gzip entry budget, and review gestures and keyboard-driven viewport changes have been improved. AI settings add OpenAI, DeepSeek, Ollama, and LM Studio presets.
- **Validation:** 1070 tests across 157 files, TypeScript/Svelte checks (0 errors and 0 warnings), 1679 aligned translation keys and 856 source references, documentation/governance checks, a clean production build, and package smoke pass. Smoke includes failed-repair compensation for invalid old cards through the production IIFE. The entry bundle is approximately 54 KiB gzip, within the 55 KiB budget. The five real SiYuan Chrome paths, Android host testing, and the real-model error matrix remain pending; automated checks do not replace them.

The current workspace validation (not a new release asset) is 1,202 tests across 169 files, 1,855 translation keys and 949 source references, `pnpm check`, production build/smoke, and isolated-kernel E2E 18/18. Real SiYuan Chrome, Android, real AI providers, third-party themes, screen readers, and multi-window persistence remain host-level acceptance work.

<details>
<summary>Previous releases</summary>

### v0.209.3 · 2026-10-10

- **New:** Classified AI generation failures (cancel, timeout, auth, rate limit, quota, server, and network), sensitive-material warnings, onboarding with example cards, a delayed short loop for forgotten cards, and manager keyboard navigation.
- **Improved:** Multiple-choice questions now degrade to two or three options or free recall when reliable distractors are unavailable. Review, dashboard, and manager views synchronize across windows and expose clearer loading, empty, error, retry, and disabled states.
- **Fixed:** Old AI responses, over-budget jobs, delayed requeues, undo, scope changes, and destroyed review panels no longer leave stale state behind.
- **Validation:** 747 unit tests, type/Svelte checks, i18n and documentation checks, governance checks, production build, and package smoke pass. Android host testing remains pending.

### v0.209.1 · 2026-10-10

- **Loading and recovery:** Dashboard refreshes preserve the last successful data with its timestamp. Deck, notebook, maintenance, challenge, pairing, and inbox actions now show clearer loading, empty, error, or retry states.
- **Action feedback:** Review controls, settings saves, and batch operations prevent duplicate submissions while busy. AnkiConnect checks use the current draft credentials.
- **Fixes:** Exiting a challenge invalidates pending card reads. Declining duplicate-card confirmation no longer creates the newly entered deck in advance.
- **Validation:** 736 unit tests, source checks, i18n and governance checks, documentation facts, production build, and package smoke pass. Android host testing remains pending.

### v0.209.2

- Updated marketplace metadata: explicit supported platforms and no unused sponsor placeholder.

### v0.209.0

- Fixed card creation on SiYuan 3.8.x, cloze answer leakage, empty all-deck due queues, knowledge-object panel crashes, and AI safety/rejection feedback.
- Fixed error-reason tags, live review preferences, and preset confirmation labels; aligned review shortcuts and terminology.

### v0.208.1

- Fixed wizard, drill, and card-detail callbacks; added visible feedback for lazy-load failures.

### v0.208.0

- Completed the Starline R53 UI refinement across page headers, review, component states, narrow layouts, and motion.

</details>

## 📸 Screenshots

| Overview — pick up where you left off | Review — recall first, check, then grade |
|---|---|
| ![Overview](./asset/screenshots/overview.png) | ![Review](./asset/screenshots/review.png) |
| **Manager** — back to content, with source & history | **Rating bar** — 4-button grading with interval preview |
| ![Manager](./asset/screenshots/manager.png) | ![Rating](./asset/screenshots/review-rating.png) |

## ✨ Features

| Module | Highlights |
|---|---|
| 🃏 **Review** | 4/3-button rating with interval preview · source-context preview · hint ladder · forgotten-card batch re-queue · undo · type-in grading (LCS diff) · dictation (TTS) · multiple choice · image occlusion · mixed question-type rotation · timeout mode · session resume |
| ✍️ **Create** | Block cards (multi-select) · cloze from selection · quick Q/A · marker scanning · AI batch generation (12-template prompt registry + provider fallback) · occlusion editor · manual editing with pre-save diff |
| 🧭 **Learning journey** | Material inbox → authoring workbench · learning goals (three-step chain + daily budget) · content lifecycle panel · entry context · wrap-up reasons · recovery banner · next-step suggestions |
| 📊 **Stats & diagnostics** | Heatmap · **study calendar with load forecast** · **deck dashboard** (per-deck due/retention/leech ranking) · streak · retention curve · capability share · error reasons · AI batch quality |
| 🗂 **Manage** | Paged browsing with search & filters · card detail drawer (content/source/learning record/issues — four facets + version tracking) · batch operations · export CSV / Obsidian SR · maintenance debt queue |
| 🎓 **Exam** | Daily targets from deadline · cram mode · post-exam report |
| 📦 **Share & migrate** | Obsidian SR import/export with deck mapping & fingerprint dedup · Anki `.apkg` import when the desktop host provides `node:sqlite` and `node:zlib` · deck-level share pack export · JSON/CSV review log export & import |
| ⌨ **⌘K palette** | Actions + navigation, keyboard-first access to every entry point |
| 📅 **Weekly report** | Auto-write last week's review summary to a SiYuan document (opt-in) |
| 🛡 **AI safety** | Preflight checks · prompt-injection isolation · context budget planner · emergency kill switch |

## 🚀 Install

SiYuan ≥ 3.8.0. Desktop is the core experience; mobile and browser are narrow-screen adapted (390px structural walkthrough recorded), while the full Android SiYuan host matrix remains pending.

1. Download `package.zip` from the [latest release](https://github.com/ai68298100/siyuan-lv-cards/releases/latest) (do **not** unzip)
2. SiYuan → Settings → Marketplace → Download → "Import package" → pick the zip
3. Enable "Lv Cards (Beta)" under Downloaded

## ⌨️ Quick start

1. Select a block → block icon → **Add to deck**
2. Press **Ctrl+K** for the command palette, or click the **donkey badge** in the top bar
3. In review: **Space** flips, **1-4** rates, `?` shows all shortcuts

## 📚 Docs

Full design docs in [docs/](./docs/README.md) (Chinese). The [R54 interactive prototype](./docs/prototypes/lv-cards-r54.html) is the single source of truth for UI structure, visual language, copy, interaction states, and responsive breakpoints; compare implementation evidence in the [R54 acceptance ledger](./docs/45-R54实现对照与验收台账.md) and component APIs in the [component catalogue](./docs/46-组件目录与状态契约.md). [R53 design spec](./docs/42-UI设计规范-R53.md) is retained as a historical reference. See also [product positioning](./docs/41-竞品调研与定位强化.md) · [user guide](./docs/21-用户上手指南.md) · [FAQ](./docs/20-FAQ与故障排查.md) · [privacy](./docs/PRIVACY.md). For development, see [CONTRIBUTING](./CONTRIBUTING.md); report bugs through [Issues](https://github.com/ai68298100/siyuan-lv-cards/issues) and security problems through [SECURITY](./SECURITY.md).

## 🗺 Roadmap

| Priority | Item | Status |
|---|---|---|
| P0 | ⌘K command palette | ✅ v0.206.3 |
| P0 | Learning calendar & load forecast | ✅ v0.206.4 |
| P1 | Weekly report | ✅ v0.206.7 |
| P1 | Deck dashboard | ✅ v0.206.8 |
| P1 | Share pack (deck-level Obsidian SR export) | ✅ v0.206.9 |
| P2 | 390px narrow-screen structural walkthrough | ✅ v0.206.10 |
| P1 | Starline UI overhaul (page heads / complete states / micro-motion / narrow screen / review polish) | ✅ v0.208.0 |
| P2 | Full Android SiYuan host matrix | Pending |
| P2 | Templates & fields | Deferred |

## 🙏 Credits

- Built on [plugin-sample-vite-svelte](https://github.com/siyuan-note/plugin-sample-vite-svelte)
- Scheduling: SiYuan kernel's native [go-fsrs](https://github.com/open-spaced-repetition/go-fsrs)
- Research: Anki, Obsidian Spaced Repetition, RemNote, Mochi, Quizlet, Knowt, and SiYuan community plugins — see [docs/41](./docs/41-竞品调研与定位强化.md)

## License

[MIT](./LICENSE) © ai68298100
