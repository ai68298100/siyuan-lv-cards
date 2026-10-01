# Lv Cards (小驴闪卡)

[中文版](./README.zh-CN.md)

The all-in-one flashcard cockpit for [SiYuan](https://b3log.org/siyuan/) — statistics dashboard, card manager, custom review panel, exam deadline pacing, Anki import and AI card generation, all built **on top of the native FSRS scheduler** (never replacing it).

> Design docs (Chinese): [docs/](./docs/) — market research of 40+ flashcard products (00-01), full feature matrix (02), kernel V2 response (05), and the complete top-down design: **10 design overview → 11 module specs → 12 interaction spec → 13 UI prototypes → 14 extension architecture**.

## Why

SiYuan ships a built-in FSRS flashcard system, but users have been asking for the two missing pieces ([issue #10326](https://github.com/siyuan-note/siyuan/issues/10326)): **flashcard management** and **statistics**. Meanwhile the wider ecosystem (Anki, Obsidian, RemNote, Quizlet, 墨墨…) has proven dozens of features SiYuan doesn't have yet. Lv Cards closes that gap.

## Current status: v0.2.0

- `src/api/riff.ts` — typed client for all 17 kernel `/api/riff/*` endpoints
- `src/api/flashcardV2.ts` — kernel Flashcard V2 (feature/flashcard branch, 3.9.0) wrappers with migration-state detection
- Module registry aligned with the design docs (M1-M12, persona-affine, phase-tagged) + legacy id migration
- **Persona presets** — Exam sprint / Card notes / Language learning apply a full module+parameter profile
- **Entry matrix** — top-bar left click starts review instantly, right click opens the menu, and a **due-count badge** refreshes every 60s
- **Review panel** — interval preview on every rating button, 4-button / 3-button (Know/Vague/Unknown) styles, hotkeys, peek-previous overlay, "skip today" (local, next-day auto-restore), timeout mode (reveal / rate-Again) with countdown, undo, session summary
- **Card Hub** — overview (six stats, heatmap, streak, deck table, V2 badge + official statistics summary) and paged card manager
- Settings — persona presets, module switches, rating style, timeout, daily targets, data zone (revlog export/clear, V2 re-detect)
- Minimal kernel plugin (`kernel.js`) for future shared-state features

## Roadmap

- **v1.0**: full dashboard (forecast, true retention), card manager with batch ops & leech detection, FSRS parameter panel with presets
- **v1.x**: FSRS optimizer loop (revlog export → optimize → write back weights), exam deadline mode, Anki `.apkg` import, AI card generation with mandatory preview, type-in answers, tags & advanced search
- **v2.x**: image occlusion, multiple choice / match / timed challenge, TTS & whiteboard, conversational AI review, knowledge graph, deck sharing

See [docs/04-路线图.md](./docs/04-路线图.md) for the full plan.

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
