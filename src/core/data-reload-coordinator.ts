/**
 * AT-1 跨前端数据同步重载协调器（纯逻辑，node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 宽容兼容：同时支持 string[]、{ files: string[] }、空参数等内核变更事件形态；
 * 2. 路径过滤：仅当变更涉及本插件目录或关键数据文件时才触发重载，无关笔记变动 0 损耗忽略；
 * 3. 防抖与单飞串行：高频连环事件在 2000ms 静默窗口内折叠合并为 1 次，执行期间新事件自动排队，严禁并发交叉重读；
 * 4. 写优先安全守卫：在磁盘重读前，必须优先等待并冲刷本地未落盘写操作（flush pending writes），绝不让旧磁盘覆盖新内存；
 * 5. 生命周期清理：支持随时 cancelPending 取消未决重载，杜绝句柄泄漏。
 */

export interface DataReloadCoordinatorOptions {
    /** 防抖等待时长（毫秒，默认 2000ms） */
    debounceMs?: number;
    /** 插件标识目录片段（如 siyuan-lv-cards） */
    pluginDirIdentifier?: string;
    /** 冲刷未落盘本地写的钩子函数 */
    flushPendingWrites?: () => Promise<void>;
    /** 执行真正的全量重载操作 */
    onReload: (generation: number) => Promise<void>;
    /** 记录协调器日志（可选） */
    log?: (msg: string) => void;
}

export type ReloadCoordinatorStatus = "idle" | "scheduled" | "reloading";

export interface DataReloadCoordinatorState {
    status: ReloadCoordinatorStatus;
    generation: number;
    scheduledAt: number | null;
    lastReloadedAt: number | null;
    totalEventsReceived: number;
    totalReloadsTriggered: number;
}

/** 关键数据文件名白名单（只要命中即认为涉及本插件） */
const KEY_STORAGE_FILES = [
    "settings.json",
    "revlog.json",
    "learning-goals.json",
    "content-lifecycles.json",
    "maintenance-queue.json",
    "exam-plans.json",
    "ai-batches.json",
    "audit-log.json",
    "consent-center.json",
];

/**
 * 判定事件载荷是否涉及本插件数据变动（纯函数）
 */
export function isPluginDataChanged(
    payload: unknown,
    pluginDirId: string = "siyuan-lv-cards",
): boolean {
    if (!payload) return true; // 空载荷保守处理：触发防抖重载

    let files: string[] = [];

    if (Array.isArray(payload)) {
        files = payload.filter((f): f is string => typeof f === "string");
    } else if (typeof payload === "object" && payload !== null) {
        const rawFiles = (payload as any).files;
        if (Array.isArray(rawFiles)) {
            files = rawFiles.filter((f): f is string => typeof f === "string");
        }
    }

    if (files.length === 0) {
        return true; // 无法提取文件名时保守视为有关
    }

    // 检查是否命中插件目录或关键文件名
    return files.some(file => {
        const lower = file.toLowerCase();
        if (lower.includes(pluginDirId.toLowerCase())) {
            return true;
        }
        return KEY_STORAGE_FILES.some(keyFile => lower.includes(keyFile));
    });
}

/**
 * 数据重载协调器实例控制器
 */
export class DataReloadCoordinator {
    private options: Required<DataReloadCoordinatorOptions>;
    private status: ReloadCoordinatorStatus = "idle";
    private generation: number = 0;
    private timer: any = null;
    private scheduledAt: number | null = null;
    private lastReloadedAt: number | null = null;
    private queuedNext: boolean = false;
    private totalEventsReceived: number = 0;
    private totalReloadsTriggered: number = 0;

    constructor(options: DataReloadCoordinatorOptions) {
        this.options = {
            debounceMs: options.debounceMs ?? 2000,
            pluginDirIdentifier: options.pluginDirIdentifier ?? "siyuan-lv-cards",
            flushPendingWrites: options.flushPendingWrites ?? (async () => {}),
            onReload: options.onReload,
            log: options.log ?? (() => {}),
        };
    }

    /**
     * 接收外部数据变更事件
     */
    public onDataChanged(payload?: unknown, now: number = Date.now()): boolean {
        this.totalEventsReceived++;

        // 路径过滤：无关变更直接跳过
        if (!isPluginDataChanged(payload, this.options.pluginDirIdentifier)) {
            this.options.log("onDataChanged skipped: payload not related to plugin data");
            return false;
        }

        // 若当前正在重载中，排队下一次单飞重载
        if (this.status === "reloading") {
            this.queuedNext = true;
            this.options.log("onDataChanged received while reloading; queued for next serial run");
            return true;
        }

        // 防抖折叠：清除已有待执行定时器
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        this.status = "scheduled";
        this.scheduledAt = now;

        this.timer = setTimeout(() => {
            this.timer = null;
            void this.executeReload();
        }, this.options.debounceMs);

        return true;
    }

    /**
     * 执行单飞串行重载：先冲刷未落盘写，再安全重读
     */
    private async executeReload(): Promise<void> {
        this.status = "reloading";
        this.scheduledAt = null;
        const currentGen = ++this.generation;

        try {
            // 铁律：重读前必须冲刷本地内存中未落盘的防抖写
            this.options.log(`[Gen ${currentGen}] Flushing pending writes before disk reload...`);
            await this.options.flushPendingWrites();

            // 执行真正的全量重装配与重读
            this.options.log(`[Gen ${currentGen}] Executing onReload...`);
            await this.options.onReload(currentGen);

            this.lastReloadedAt = Date.now();
            this.totalReloadsTriggered++;
        } catch (err) {
            this.options.log(`[Gen ${currentGen}] onReload failed: ${String(err)}`);
        } finally {
            this.status = "idle";

            // 检查重载期间是否有新的积压事件，若有则立即开启下一轮排队
            if (this.queuedNext) {
                this.queuedNext = false;
                this.onDataChanged();
            }
        }
    }

    /**
     * 取消挂起的防抖重载（插件卸载或窗口关闭时调用）
     */
    public cancelPending(): void {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.queuedNext = false;
        if (this.status === "scheduled") {
            this.status = "idle";
            this.scheduledAt = null;
        }
    }

    /**
     * 立即冲刷并强制重载（如设置页重载或用户手动同步）
     */
    public async forceReloadNow(): Promise<void> {
        this.cancelPending();
        await this.executeReload();
    }

    /**
     * 获取协调器运行快照
     */
    public getState(): DataReloadCoordinatorState {
        return {
            status: this.status,
            generation: this.generation,
            scheduledAt: this.scheduledAt,
            lastReloadedAt: this.lastReloadedAt,
            totalEventsReceived: this.totalEventsReceived,
            totalReloadsTriggered: this.totalReloadsTriggered,
        };
    }
}
