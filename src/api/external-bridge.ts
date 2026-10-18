/**
 * 小驴闪卡对外服务桥 v1（window.xiaolvCards / window.lvCards）
 * 遵循小驴生态跨插件契约：
 * - 协议版本：CARDS_BRIDGE_PROTOCOL = 1
 * - 能力协商：["whenReady", "stats", "due", "openHub", "openReview"]
 * - 结果包装：ActionResult<T> 信封（ok: true/false）
 * - 只读安全边界：外部桥仅暴露只读统计与导航方法，不提供破坏性删卡/删组方法
 * - 生态事件总线：通过 window.dispatchEvent 派发 lv-cards:reviewed 自定义事件（带幂等键），供快门、打卡等消费
 */

export const CARDS_BRIDGE_PROTOCOL = 1;
export const CARDS_BRIDGE_NAME = "xiaolv-cards" as const;

export interface ActionSuccess<T> {
    ok: true;
    data: T;
}

export interface ActionFailure {
    ok: false;
    code: string;
    message: string;
    details?: unknown;
}

export type ActionResult<T> = ActionSuccess<T> | ActionFailure;

export interface FlashcardStats {
    /** 今日复习卡次数 */
    todayReviews: number;
    /** 今日新学卡片数 */
    todayNew: number;
    /** 今日遗忘卡片数 */
    todayForget: number;
    /** 连续复习天数（连击） */
    streak: number;
    /** 当前到期卡片数 */
    dueCount: number;
    /** 历史有打卡记录的总天数 */
    historyDays: number;
}

export interface FlashcardDueSummary {
    /** 待复习卡总数 */
    unreviewedCount: number;
    /** 待复习新卡数 */
    unreviewedNewCardCount: number;
    /** 待复习旧卡（复习卡）数 */
    unreviewedOldCardCount: number;
    /** 更新时间戳（ISO 字符串） */
    updatedAt: string;
}

export interface ReviewOpenOptions {
    /** 复习范围，如 deckID、notebookID 等 */
    scope?: string;
    /** 是否为死磕/突击模式 */
    cram?: boolean;
    /** 入口来源标记 */
    entry?: string;
}

export interface CardsBridgeApi {
    readonly protocol: number;
    readonly protocolName: string;
    readonly capabilities: readonly string[];

    /** 就绪探针 */
    whenReady(): Promise<boolean>;

    /** 读取闪卡统计快照（今日复习、连击、到期等） */
    getStats(): Promise<ActionResult<FlashcardStats>>;

    /** 读取今日到期卡汇总 */
    getDueSummary(): Promise<ActionResult<FlashcardDueSummary>>;

    /** 打开闪卡工作台（可指定 tab，例如 "overview", "manage", "authoring", "goals", "inbox", "exam", "maintenance"） */
    openHub(tab?: string): Promise<ActionResult<boolean>>;

    /** 打开复习/死磕界面 */
    openReview(options?: ReviewOpenOptions): Promise<ActionResult<boolean>>;
}

export interface CardsBridgeHost {
    getStats(): Promise<FlashcardStats> | FlashcardStats;
    getDueSummary(): Promise<FlashcardDueSummary>;
    openHub(tab?: string): void;
    openReview(options?: ReviewOpenOptions): void;
}

export interface CardReviewedEventDetail {
    plugin: "lv-cards";
    v: 1;
    ts: number;
    cardID: string;
    deckID: string;
    blockID: string;
    rating: number;
    source: "plugin" | "native";
    occurredAt: string;
    idempotencyKey: string;
}

/**
 * 派发生态学习事件（跨插件总线：window.dispatchEvent）
 * 允许小驴快门（物化到 events.ndjson）、小驴打卡等伴侣插件联动学习连击与打卡
 */
export function dispatchCardReviewedEvent(detail: {
    cardID: string;
    deckID: string;
    blockID: string;
    rating: number;
    source: "plugin" | "native";
    ts?: number;
}): void {
    if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
        return;
    }
    try {
        const ts = detail.ts ?? Date.now();
        const fullDetail: CardReviewedEventDetail = {
            plugin: "lv-cards",
            v: 1,
            ts,
            cardID: detail.cardID,
            deckID: detail.deckID,
            blockID: detail.blockID,
            rating: detail.rating,
            source: detail.source,
            occurredAt: new Date(ts).toISOString(),
            idempotencyKey: `${detail.cardID}:${ts}`,
        };
        window.dispatchEvent(new CustomEvent("lv-cards:reviewed", { detail: fullDetail }));
    } catch {
        // 事件旁路隔离，绝不影响闪卡核心主流程
    }
}

export function buildCardsBridge(host: CardsBridgeHost): CardsBridgeApi {
    return {
        protocol: CARDS_BRIDGE_PROTOCOL,
        protocolName: CARDS_BRIDGE_NAME,
        capabilities: ["whenReady", "stats", "due", "openHub", "openReview"],

        async whenReady() {
            return true;
        },

        async getStats() {
            try {
                const stats = await host.getStats();
                return { ok: true, data: stats };
            } catch (e) {
                return {
                    ok: false,
                    code: "stats-error",
                    message: e instanceof Error ? e.message : String(e),
                };
            }
        },

        async getDueSummary() {
            try {
                const summary = await host.getDueSummary();
                return { ok: true, data: summary };
            } catch (e) {
                return {
                    ok: false,
                    code: "due-error",
                    message: e instanceof Error ? e.message : String(e),
                };
            }
        },

        async openHub(tab?: string) {
            try {
                host.openHub(tab);
                return { ok: true, data: true };
            } catch (e) {
                return {
                    ok: false,
                    code: "open-hub-failed",
                    message: e instanceof Error ? e.message : String(e),
                };
            }
        },

        async openReview(options?: ReviewOpenOptions) {
            try {
                host.openReview(options);
                return { ok: true, data: true };
            } catch (e) {
                return {
                    ok: false,
                    code: "open-review-failed",
                    message: e instanceof Error ? e.message : String(e),
                };
            }
        },
    };
}

export function mountCardsBridge(
    host: CardsBridgeHost,
    win: { xiaolvCards?: unknown; lvCards?: unknown } = window as unknown as { xiaolvCards?: unknown; lvCards?: unknown }
): () => void {
    if (!win) return () => undefined;
    if (win.xiaolvCards || win.lvCards) {
        // 已有桥挂载：跳过覆盖，遵守首个实例独占窗口期原则
        return () => undefined;
    }
    const bridge = buildCardsBridge(host);
    win.xiaolvCards = bridge;
    win.lvCards = bridge;

    let disposed = false;
    return () => {
        if (disposed) return;
        disposed = true;
        if (win.xiaolvCards === bridge) {
            delete win.xiaolvCards;
        }
        if (win.lvCards === bridge) {
            delete win.lvCards;
        }
    };
}
