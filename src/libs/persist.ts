/**
 * 统一持久化队列（AQ-4）：插件私有数据的 saveData 调用全部经过这里——
 * - 同 key 串行（前一笔完成后才写下一笔，故障注入不会用旧数据覆盖先写数据）；
 * - 有限重试（默认 2 次尝试 + 退避），重试耗尽才上报失败；
 * - 可观测：ok/fail 计数、最近成功时间、最近错误，诊断可导出；失败回调由宿主提示用户。
 */

export interface PersistStats {
    key: string;
    ok: number;
    fail: number;
    lastOkTs: number;
    lastError: string;
}

export interface PersistOptions {
    /** 总尝试次数（含首次），默认 2 */
    attempts?: number;
    /** 重试退避毫秒，默认 500 */
    retryDelayMs?: number;
    /** 最终失败回调（限流由宿主处理） */
    onFail?: (key: string, error: Error) => void;
    /** 每次成功回调（宿主刷新 lastWrite 展示） */
    onOk?: (key: string) => void;
}

export interface PersistQueue {
    save(key: string, data: unknown): Promise<void>;
    /** 等待全部在途写入完成（卸载前冲刷；上限 deadlineMs 防止无限等待） */
    waitAll(deadlineMs?: number): Promise<boolean>;
    stats(): PersistStats[];
    /** 是否存在尚未成功的写入（诊断用） */
    hasFailures(): boolean;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export function createPersist(impl: (key: string, data: unknown) => Promise<void>, opts: PersistOptions = {}): PersistQueue {
    const attempts = Math.max(1, opts.attempts ?? 2);
    const retryDelayMs = Math.max(0, opts.retryDelayMs ?? 500);
    const chains = new Map<string, Promise<void>>();
    const statsMap = new Map<string, PersistStats>();
    const statOf = (key: string): PersistStats => {
        let s = statsMap.get(key);
        if (!s) {
            s = { key, ok: 0, fail: 0, lastOkTs: 0, lastError: "" };
            statsMap.set(key, s);
        }
        return s;
    };

    async function attempt(key: string, data: unknown): Promise<void> {
        let lastError: Error = new Error("not attempted");
        for (let i = 0; i < attempts; i++) {
            if (i > 0) {
                await sleep(retryDelayMs * i);
            }
            try {
                await impl(key, data);
                const s = statOf(key);
                s.ok += 1;
                s.lastOkTs = Date.now();
                opts.onOk?.(key);
                return;
            } catch (e) {
                lastError = e instanceof Error ? e : new Error(String(e));
            }
        }
        const s = statOf(key);
        s.fail += 1;
        s.lastError = lastError.message;
        opts.onFail?.(key, lastError);
        throw lastError;
    }

    return {
        save(key: string, data: unknown): Promise<void> {
            // 同 key 串行：本笔在前一笔 settle 后执行，且不被前一笔的失败阻断
            const prev = chains.get(key) ?? Promise.resolve();
            const next = prev.then(
                () => attempt(key, data),
                () => attempt(key, data),
            );
            // 链条吞掉拒绝（由 save 的调用方拿到拒绝），保持链条可继续
            chains.set(key, next.catch(() => { /* 失败已在 stats/onFail 记录 */ }));
            return next;
        },
        async waitAll(deadlineMs = 3000): Promise<boolean> {
            const all = Promise.all([...chains.values()]).then(() => true);
            let timedOut = false;
            const deadline = new Promise<boolean>(r => setTimeout(() => { timedOut = true; r(false); }, deadlineMs));
            const ok = await Promise.race([all, deadline]);
            return ok === true && !timedOut;
        },
        stats(): PersistStats[] {
            return [...statsMap.values()];
        },
        hasFailures(): boolean {
            return [...statsMap.values()].some(s => s.fail > 0);
        },
    };
}
