// AT-3 可取消超时层：与任意 Promise 组合的有界等待（纯逻辑，node 可单测）。
// 底层 fetchSyncPost 无法真正中断（慢请求仍会在后台完成），但调用方在 ms 内
// 必然得到确定结果（成功 / 原始错误 / 超时拒绝），不再无限期挂起。
// 注意：计时器在任一方先落定时都会清除，不泄漏；迟到一方的 settle 被静默忽略。

export class TimeoutError extends Error {
    constructor(label: string, ms: number) {
        super(`timeout after ${ms}ms: ${label}`);
        this.name = "TimeoutError";
    }
}

export function withTimeout<T>(p: Promise<T>, ms: number, label = "request"): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
        p.then(
            value => {
                clearTimeout(timer);
                resolve(value);
            },
            err => {
                clearTimeout(timer);
                reject(err);
            },
        );
    });
}
