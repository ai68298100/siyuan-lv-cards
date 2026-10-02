# Lv Cards (小驴闪卡)

[中文版](./README.zh-CN.md)

[![Release](https://img.shields.io/github/v/release/ai68298100/siyuan-lv-cards)](./releases)
[![CI](https://github.com/ai68298100/siyuan-lv-cards/actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![SiYuan >= 3.8.0](https://img.shields.io/badge/SiYuan-%3E%3D%203.8.0-blue)](https://b3log.org/siyuan/)

The all-in-one flashcard cockpit for [SiYuan](https://b3log.org/siyuan/) — statistics dashboard, card manager, custom review panel, exam deadline pacing, Anki import and AI card generation, all built **on top of the native FSRS scheduler** (never replacing it).

> Design docs (Chinese): [docs/](./docs/) — market research of 40+ flashcard products (00-01), full feature matrix (02), kernel V2 response (05), and the complete top-down design: **10 design overview → 11 module specs → 12 interaction spec → 13 UI prototypes → 14 extension architecture**.

## Why

SiYuan ships a built-in FSRS flashcard system, but users have been asking for the two missing pieces ([issue #10326](https://github.com/siyuan-note/siyuan/issues/10326)): **flashcard management** and **statistics**. Meanwhile the wider ecosystem (Anki, Obsidian, RemNote, Quizlet, 墨墨…) has proven dozens of features SiYuan doesn't have yet. Lv Cards closes that gap.

## Current status: v0.63.0

**Review**: interval preview · 4-button / 3-button styles · hotkeys (with ? cheat sheet) · peek previous · skip-today · timeout mode · forgotten-card batch re-queue · undo rating · quick reschedule · type-in grading (LCS diff) · dictation mode (TTS) · multiple choice · image occlusion · touch swipe · source-context preview · safe-area insets · session resume · session duration & goal progress · streak milestones & daily learning tips on the done screen

**Card creation**: block cards (multi-select) · quick cloze · quick Q/A · marker scanning (`::` and `?`) · AI batch generation (5 input sources incl. clipboard + preview editing + per-card regenerate + difficulty tags + provider fallback + prompt templates) · image occlusion editor · duplicate warning

**Stats & hub**: six animated stats · heatmap (17/26/52 weeks) · streak · True Retention · measured retention curve (PNG export) · week-over-week · milestones & XP/levels (optional) · AI batch quality with token usage · leech list · paged manager (text/sort by lapses/status/leech filters, batch reset & remove, selected-cards CSV export, card detail drawer)

**Exam**: plan countdown pacing + daily targets + cram mode + 30/7/1-day system notifications + post-exam report

**Data & health**: review log JSON/CSV export & import (with multi-device fork detection and merge preview) · 20k-entry perf budget test · settings/persona JSON export & import · target-notebook setting for all generated docs · storage audit · diagnostics copy (kernel version + 200-entry ring log)

**Engineering**: dual-track gateway (riff 3.8.x + V2 3.9.0 feature branch, persisted detection + gateway-changed event) · 19-component UI Kit + Starline design tokens · hub error boundary · unified request layer with timeout · typed store loader with schema cleaning · appearance settings (font scale, rating density, badge refresh) · main bundle ≤32KB gzip (CI-enforced) · 27 unit tests · zh/en i18n, 510 keys aligned

A minimal kernel plugin (`kernel.js`) keeps an echo stub for future shared-state features.

## Requirements

- SiYuan **≥ 3.8.0** (all platforms: Windows / macOS / Linux / iOS / Android / Harmony / Docker)
- Works on desktop, mobile and browser environments; some V2-only enhancements activate on SiYuan ≥ 3.9.0 automatically

## Roadmap

- **v1.x**: FSRS parameter panel & optimizer loop, Anki `.apkg` import, streaming AI generation, knowledge graph, deck sharing
- **V2 follow-ups** (SiYuan ≥ 3.9.0): official statistics deep-viz, third-party card-type bridge, AST query builder

See [docs/04-路线图.md](./docs/04-路线图.md) for the full plan and [docs/](./docs/) for design documents.

## Development

```bash
pnpm install
pnpm dev          # build with watch + livereload
pnpm make-link    # symlink dist into your workspace's data/plugins/
pnpm build        # production build (app + kernel)
```

Requires Node ≥ 24 and SiYuan ≥ 3.8.0. Plugin id / repo name: `siyuan-lv-cards`.

## Credits

- Built on [siyuan-note/plugin-sample-vite-svelte](https://github.com/siyuan-note/plugin-sample-vite-svelte)
- Scheduling is 100% the SiYuan kernel's [go-fsrs](https://github.com/open-spaced-repetition/go-fsrs); this plugin is a cockpit, not a replacement
- Feature research: Anki & its add-ons, Obsidian Spaced Repetition, RemNote, Logseq, Mochi, Quizlet, Brainscape, Memrise, 墨墨背单词, 滑记, MarginNote, Knowt, and the SiYuan community plugins (sy-tomato, flash-enhance, 闪卡小助手 ZY, ankiLinker, AI Flashcards Native)
