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
    todayReviews: number;
    todayNew: number;
    todayForget: number;
    streak: number;
    dueCount: number;
    historyDays: number;
}

export interface FlashcardDueSummary {
    unreviewedCount: number;
    unreviewedNewCardCount: number;
    unreviewedOldCardCount: number;
    updatedAt: string;
}

export interface ReviewOpenOptions {
    scope?: string;
    cram?: boolean;
    entry?: string;
}

export interface CardsBridgeApi {
    readonly protocol: number;
    readonly protocolName: string;
    readonly capabilities: readonly string[];
    whenReady(): Promise<boolean>;
    getStats(): Promise<ActionResult<FlashcardStats>>;
    getDueSummary(): Promise<ActionResult<FlashcardDueSummary>>;
    openHub(tab?: string): Promise<ActionResult<boolean>>;
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

export function dispatchCardReviewedEvent(detail: {
    cardID: string;
    deckID: string;
    blockID: string;
    rating: number;
    source: "plugin" | "native";
    ts?: number;
}): void {
    if (typeof window === "undefined" || !window.dispatchEvent) return;
    try {
        const ts = detail.ts ?? Date.now();
        window.dispatchEvent(new CustomEvent("lv-cards:reviewed", {
            detail: {
                ...detail,
                plugin: "lv-cards",
                v: 1,
                ts,
                occurredAt: new Date(ts).toISOString(),
                idempotencyKey: `${detail.cardID}:${ts}`,
            },
        }));
    } catch {}
}

const wrap = async <T>(code: string, fn: () => Promise<T> | T): Promise<ActionResult<T>> => {
    try {
        return { ok: true, data: await fn() };
    } catch (e: any) {
        return { ok: false, code, message: e?.message ?? String(e) };
    }
};

export function buildCardsBridge(host: CardsBridgeHost): CardsBridgeApi {
    return {
        protocol: CARDS_BRIDGE_PROTOCOL,
        protocolName: CARDS_BRIDGE_NAME,
        capabilities: ["whenReady", "stats", "due", "openHub", "openReview"],
        whenReady: async () => true,
        getStats: () => wrap("stats-error", () => host.getStats()),
        getDueSummary: () => wrap("due-error", () => host.getDueSummary()),
        openHub: (tab?: string) => wrap("open-hub-failed", () => (host.openHub(tab), true)),
        openReview: (opts?: ReviewOpenOptions) => wrap("open-review-failed", () => (host.openReview(opts), true)),
    };
}

export function mountCardsBridge(
    host: CardsBridgeHost,
    win: { xiaolvCards?: unknown; lvCards?: unknown } = typeof window !== "undefined" ? window as any : undefined
): () => void {
    if (!win || win.xiaolvCards || win.lvCards) return () => undefined;
    const bridge = buildCardsBridge(host);
    win.xiaolvCards = bridge;
    win.lvCards = bridge;

    return () => {
        if (win.xiaolvCards === bridge) {
            delete win.xiaolvCards;
            delete win.lvCards;
        }
    };
}
