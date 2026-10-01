import "./index.scss";

import { mount, unmount } from "svelte";
import { Plugin, Menu, showMessage } from "siyuan";

import { svelteDialog } from "./libs/dialog";
import { defaultSettings, normalizeSettings, type LvCardsSettings } from "./core/settings";
import {
    appendRevlog, emptyRevlog, localDate, normalizeRevlog, recalcDays,
    type RevlogData, type RevlogEntry,
} from "./core/revlog";
import { detectFlashcardV2, type MigrationStatus } from "./api/flashcardV2";
import { getDueCount } from "./api/riff";
import { normalizeSuspendToday, rollDateIfNeeded, isSuspended, suspend, type SuspendTodayData } from "./core/suspend-today";
import Dashboard from "./ui/dashboard.svelte";
import Review from "./ui/review.svelte";
import Manager from "./ui/manager.svelte";
import SettingsPanel from "./ui/settings.svelte";

const TAB_DASHBOARD = "lv-cards-dashboard";
const TAB_REVIEW = "lv-cards-review";
const TAB_MANAGER = "lv-cards-manager";
const SETTINGS_DATA = "settings.json";
const REVLOG_DATA = "revlog.json";
const SUSPEND_TODAY_DATA = "suspend-today.json";

export default class LvCardsPlugin extends Plugin {

    private settings: LvCardsSettings = defaultSettings();
    private revlog: RevlogData = emptyRevlog();
    private saveRevlogTimer: ReturnType<typeof setTimeout> | null = null;
    /** 内核闪卡 V2 状态（null = 当前内核 < 3.9.0，无 V2 API） */
    private flashcardV2: MigrationStatus | null = null;
    private topBarElement: HTMLElement | null = null;
    private badgeTimer: ReturnType<typeof setInterval> | null = null;
    private suspendToday: SuspendTodayData = { date: "", cardIDs: [] };

    async onload() {
        this.addIcons(`<symbol id="iconLvCards" viewBox="0 0 32 32">
<path d="M6 10h16v16H6z" fill="none" stroke="currentColor" stroke-width="2"></path>
<path d="M10 6h16v16" fill="none" stroke="currentColor" stroke-width="2"></path>
<path d="M11 16h6M11 20h10" stroke="currentColor" stroke-width="2"></path>
</symbol>`);

        const [loadedSettings, loadedRevlog, loadedSuspend] = await Promise.all([
            this.loadData(SETTINGS_DATA),
            this.loadData(REVLOG_DATA),
            this.loadData(SUSPEND_TODAY_DATA),
        ]);
        this.settings = normalizeSettings(loadedSettings);
        this.revlog = normalizeRevlog(loadedRevlog);
        recalcDays(this.revlog); // AJ1 迁移：由明细重建每日聚合（幂等）
        this.suspendToday = normalizeSuspendToday(loadedSuspend);
        if (rollDateIfNeeded(this.suspendToday)) {
            await this.saveData(SUSPEND_TODAY_DATA, this.suspendToday);
        }

        // 探测内核闪卡 V2（feature/flashcard 分支 / 3.9.0）：决定走 V2 还是 riff 兼容路径
        this.flashcardV2 = await detectFlashcardV2();

        // 原生复习界面的评分事件 → 本地 revlog（宽容解析，事件结构变化不致崩）
        this.eventBus.on("click-flashcard-action", this.onNativeCardAction);

        const plugin = this;
        this.addTab({
            type: TAB_DASHBOARD,
            init() {
                const div = document.createElement("div");
                div.style.height = "100%";
                const app = mount(Dashboard, {
                    target: div,
                    props: { ctx: {
                        i18n: plugin.i18n,
                        getRevlog: () => plugin.revlog,
                        getV2Status: () => plugin.flashcardV2,
                        getDailyTargets: () => ({
                            new: plugin.settings.dailyNewTarget,
                            review: plugin.settings.dailyReviewTarget,
                        }),
                        openReview: () => plugin.openTabOf(TAB_REVIEW),
                        openManager: () => plugin.openTabOf(TAB_MANAGER),
                    } },
                });
                this.element.appendChild(div);
                this.destroy = () => unmount(app); // AJ7：Tab 销毁时卸载实例
            },
        });

        this.addTab({
            type: TAB_REVIEW,
            init() {
                const div = document.createElement("div");
                div.style.height = "100%";
                const app = mount(Review, {
                    target: div,
                    props: { ctx: {
                        i18n: plugin.i18n,
                        app: plugin.app,
                        settings: () => ({
                            ratingStyle: plugin.settings.ratingStyle,
                            timeoutMode: plugin.settings.timeoutMode,
                            timeoutSeconds: plugin.settings.timeoutSeconds,
                            randomOrder: plugin.settings.randomOrder,
                        }),
                        appendRevlog: (e) => plugin.appendRevlog(e),
                        getRevlog: () => plugin.revlog,
                        isSuspendedToday: (cardID: string) => isSuspended(plugin.suspendToday, cardID),
                        suspendToday: (cardID: string) => {
                            suspend(plugin.suspendToday, cardID);
                            plugin.saveData(SUSPEND_TODAY_DATA, plugin.suspendToday).catch(() => { /* 旁路 */ });
                        },
                        openDashboard: () => plugin.openTabOf(TAB_DASHBOARD),
                    } },
                });
                this.element.appendChild(div);
                this.destroy = () => unmount(app);
            },
        });

        this.addTab({
            type: TAB_MANAGER,
            init() {
                const div = document.createElement("div");
                div.style.height = "100%";
                const app = mount(Manager, {
                    target: div,
                    props: { ctx: { i18n: plugin.i18n, app: plugin.app } },
                });
                this.element.appendChild(div);
                this.destroy = () => unmount(app);
            },
        });

        this.addCommand({
            langKey: "openDashboard",
            langText: this.i18n.cmdOpenDashboard,
            hotkey: "",
            callback: () => this.openTabOf(TAB_DASHBOARD),
        });
        this.addCommand({
            langKey: "startReview",
            langText: this.i18n.cmdStartReview,
            hotkey: "",
            callback: () => this.openTabOf(TAB_REVIEW),
        });

        // 入口矩阵（docs/12 §1.1）：左键 = 零层级开始复习；右键 = 菜单；角标 = 今日到期数
        this.topBarElement = this.addTopBar({
            icon: "iconLvCards",
            title: this.i18n.topbarTitle,
            position: "right",
            callback: () => {
                if (this.settings.modules.review) {
                    this.openTabOf(TAB_REVIEW);
                } else {
                    this.showTopbarMenu(new MouseEvent("contextmenu"));
                }
            },
        });
        this.topBarElement.style.position = "relative";
        this.topBarElement.addEventListener("contextmenu", (evt: MouseEvent) => {
            evt.preventDefault();
            this.showTopbarMenu(evt);
        });
    }

    onLayoutReady() {
        this.refreshDueBadge();
        // 到期数心跳（60s）；移动端同样适用（悬浮球入口在 v1.0 接入）
        this.badgeTimer = setInterval(() => this.refreshDueBadge(), 60_000);
    }

    onunload() {
        this.eventBus.off("click-flashcard-action", this.onNativeCardAction);
        this.flushRevlogSave();
        if (this.badgeTimer) {
            clearInterval(this.badgeTimer);
            this.badgeTimer = null;
        }
    }

    private refreshDueBadge() {
        if (!this.topBarElement || !this.settings.modules.review) {
            this.updateBadge(0);
            return;
        }
        getDueCount().then(count => this.updateBadge(count)).catch(() => { /* 旁路，静默 */ });
    }

    private updateBadge(count: number) {
        if (!this.topBarElement) {
            return;
        }
        let badge = this.topBarElement.querySelector<HTMLElement>(".lv-badge");
        if (!count || count <= 0) {
            badge?.remove();
            return;
        }
        if (!badge) {
            badge = document.createElement("span");
            badge.className = "lv-badge";
            this.topBarElement.appendChild(badge);
        }
        badge.textContent = count > 99 ? "99+" : String(count);
        badge.title = this.i18n.badgeDue.replace("${n}", String(count));
    }

    private onNativeCardAction = (event: CustomEvent) => {
        try {
            const detail: any = event?.detail ?? {};
            const cardID: string = detail?.cardID ?? detail?.id ?? "";
            if (!cardID) {
                return;
            }
            const rating = Number(detail?.rating ?? detail?.level ?? 0);
            const entry: RevlogEntry = {
                ts: Date.now(),
                cardID,
                deckID: detail?.deckID ?? "",
                blockID: detail?.blockID ?? "",
                rating: Number.isFinite(rating) ? rating : 0,
                source: "native",
            };
            this.appendRevlog(entry);
        } catch {
            // 统计属于旁路功能，绝不影响主流程
        }
    };

    private appendRevlog(entry: Omit<RevlogEntry, "ts"> & { ts?: number }) {
        appendRevlog(this.revlog, { ts: entry.ts ?? Date.now(), ...entry } as RevlogEntry);
        this.scheduleRevlogSave();
        this.refreshDueBadge();
    }

    private scheduleRevlogSave() {
        if (this.saveRevlogTimer) {
            clearTimeout(this.saveRevlogTimer);
        }
        this.saveRevlogTimer = setTimeout(() => this.flushRevlogSave(), 2000);
    }

    private flushRevlogSave() {
        if (this.saveRevlogTimer) {
            clearTimeout(this.saveRevlogTimer);
            this.saveRevlogTimer = null;
        }
        this.saveData(REVLOG_DATA, this.revlog).catch(() => { /* 忽略瞬时失败，下次修改会重试 */ });
    }

    private openTabOf(type: string) {
        const anySelf = this as any;
        anySelf.openTab({ app: this.app, type });
    }

    private showTopbarMenu(evt: MouseEvent) {
        const menu = new Menu("lvCardsMenu");
        if (this.flashcardV2) {
            // 内核 V2 状态徽章（迁移状态机 Legacy/Preparing/Active/LegacyDiverged）
            menu.addItem({
                icon: "iconLvCards",
                label: `Flashcard V2 · ${this.flashcardV2.state}`,
                type: "readonly",
            });
        }
        if (this.settings.modules.stats) {
            menu.addItem({ icon: "iconLvCards", label: this.i18n.menuDashboard, click: () => this.openTabOf(TAB_DASHBOARD) });
        }
        if (this.settings.modules.review) {
            menu.addItem({ icon: "iconLvCards", label: this.i18n.menuReview, click: () => this.openTabOf(TAB_REVIEW) });
        }
        if (this.settings.modules.manager) {
            menu.addItem({ icon: "iconLvCards", label: this.i18n.menuManager, click: () => this.openTabOf(TAB_MANAGER) });
        }
        menu.addSeparator();
        menu.addItem({
            label: this.i18n.menuSettings,
            icon: "iconSettings",
            click: () => this.openSettingsDialog(),
        });
        const x = evt.clientX || window.innerWidth - 60;
        const y = evt.clientY || 48;
        menu.open({ x, y });
        const today = localDate(Date.now());
        const stat = this.revlog.days[today];
        if (stat && this.settings.dailyReviewTarget > 0 && stat.review >= this.settings.dailyReviewTarget) {
            showMessage(this.i18n.dailyTargetReached, 3000, "info");
        }
    }

    private openSettingsDialog() {
        const { close } = svelteDialog({
            title: this.i18n.settingsTitle,
            component: SettingsPanel,
            width: "620px",
            props: {
                ctx: {
                    i18n: this.i18n,
                    settings: this.settings,
                    close: () => close(),
                    save: async (s: LvCardsSettings) => {
                        this.settings = s;
                        await this.saveData(SETTINGS_DATA, s);
                        showMessage(this.i18n.settingsSaved, 2000, "info");
                    },
                    exportRevlog: () => this.exportRevlog(),
                    clearRevlog: () => this.clearRevlog(),
                    redetectV2: async () => {
                        this.flashcardV2 = await detectFlashcardV2();
                        return this.flashcardV2 ? this.flashcardV2.state : "N/A (<3.9.0)";
                    },
                    getV2Status: () => this.flashcardV2 ? this.flashcardV2.state : "N/A (<3.9.0)",
                },
            },
        });
    }

    /** 导出本地复习日志（M10·FR1） */
    private exportRevlog() {
        const stamp = localDate(Date.now());
        const blob = new Blob([JSON.stringify(this.revlog, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `lv-cards-revlog-${stamp}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /** 清空本地复习日志（热力图与连击归零；不影响内核调度） */
    private clearRevlog() {
        this.revlog = emptyRevlog();
        this.saveData(REVLOG_DATA, this.revlog).catch(() => { /* 忽略 */ });
        this.refreshDueBadge();
        showMessage(this.i18n.settingsSaved, 2000, "info");
    }
}
