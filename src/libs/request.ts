/** Bounded JSON POST transport for kernel and external HTTP APIs. */

export type RequestFailureKind = "abort" | "timeout" | "http" | "network" | "stale";

/** 用户可理解的错误分层；kind 保留底层传输口径供旧调用方兼容。 */
export type RequestErrorCategory = "cancelled" | "timeout" | "network" | "auth" | "permission" | "validation" | "server" | "unknown";

function classifyCategory(kind: RequestFailureKind, status?: number): RequestErrorCategory {
    if (kind === "abort" || kind === "stale") return "cancelled";
    if (kind === "timeout") return "timeout";
    if (kind === "network") return "network";
    if (status === 401) return "auth";
    if (status === 403) return "permission";
    if (status !== undefined && status >= 400 && status < 500) return "validation";
    if (status !== undefined && status >= 500) return "server";
    return "unknown";
}

export class RequestError extends Error {
    constructor(
        message: string,
        readonly kind: RequestFailureKind,
        readonly status?: number,
        readonly category: RequestErrorCategory = classifyCategory(kind, status),
    ) {
        super(message);
        this.name = "RequestError";
    }
}

export interface RequestOptions {
    /** Timeout in milliseconds; 0 disables the deadline. Defaults to 15000. */
    timeoutMs?: number;
    headers?: Record<string, string>;
    /** Cancels only this caller's wait when the request is shared. */
    signal?: AbortSignal;
    /** Retries are honored only for explicitly read-only requests, and are capped at 2. */
    readOnly?: boolean;
    retries?: number;
    /** Enables single-flight only when readOnly is true. Payload and headers remain part of identity. */
    dedupeKey?: string;
    /**
     * Logical request key whose previous in-flight request is superseded when
     * a new request starts.  This is useful for search/pagination where a
     * late response must never overwrite the newest view.
     */
    latestKey?: string;
    /** Retry backoff in milliseconds. Defaults to 100. */
    retryDelayMs?: number;
}

/** A transport-independent request factory used by kernel and other hosts. */
export type RequestExecutor<T> = (signal: AbortSignal) => Promise<T>;

/** Request was completed after a newer request for the same logical key. */
export class StaleRequestError extends RequestError {
    constructor(key: string) {
        super(`request superseded by a newer request: ${key}`, "stale");
        this.name = "StaleRequestError";
    }
}

interface Flight<T> {
    controller: AbortController;
    promise: Promise<T>;
    consumers: Set<symbol>;
    settled: boolean;
}

function abortError(): RequestError {
    return new RequestError("request aborted", "abort");
}

function timeoutError(url: string, timeoutMs: number): RequestError {
    // Preserve the established message consumed by existing UI error mapping.
    return new RequestError(`kernel timeout after ${timeoutMs}ms (code=504): ${url}`, "timeout");
}

function isRetryable(error: unknown): boolean {
    return error instanceof RequestError &&
        (error.kind === "network" || (error.kind === "http" && (error.status ?? 0) >= 500));
}

function retryCount(opts: RequestOptions): number {
    if (!opts.readOnly) return 0;
    const retries = Math.floor(opts.retries ?? 0);
    return Math.min(2, Math.max(0, Number.isFinite(retries) ? retries : 0));
}

function requestIdentity(url: string, payload: unknown, headers: Record<string, string>, key: string): string {
    // Including request content prevents accidental coalescing when a caller reuses a key.
    return JSON.stringify([url, key, payload, headers]);
}

async function fetchAttempt<T>(
    url: string,
    body: string,
    headers: Record<string, string>,
    timeoutMs: number,
    parentSignal?: AbortSignal,
): Promise<T> {
    if (parentSignal?.aborted) throw abortError();

    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abortFromParent = () => controller.abort();
    parentSignal?.addEventListener("abort", abortFromParent, { once: true });
    let onControllerAbort: (() => void) | undefined;

    const abortResult = new Promise<never>((_, reject) => {
        onControllerAbort = () => reject(timedOut ? timeoutError(url, timeoutMs) : abortError());
        controller.signal.addEventListener("abort", onControllerAbort, { once: true });
        if (timeoutMs > 0) {
            timer = setTimeout(() => {
                timedOut = true;
                controller.abort();
            }, timeoutMs);
        }
    });

    const request = (async () => {
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...headers },
                body,
                signal: controller.signal,
            });
            if (!response.ok) {
                throw new RequestError(`HTTP ${response.status}`, "http", response.status);
            }
            return await response.json() as T;
        } catch (error) {
            if (error instanceof RequestError) throw error;
            if (controller.signal.aborted) {
                throw timedOut ? timeoutError(url, timeoutMs) : abortError();
            }
            throw new RequestError(`network error: ${error instanceof Error ? error.message : String(error)}`, "network");
        }
    })();

    try {
        return await Promise.race([request, abortResult]);
    } finally {
        if (timer !== undefined) clearTimeout(timer);
        if (onControllerAbort) controller.signal.removeEventListener("abort", onControllerAbort);
        parentSignal?.removeEventListener("abort", abortFromParent);
    }
}

async function runRequest<T>(
    url: string,
    payload: unknown,
    opts: RequestOptions,
    signal?: AbortSignal,
): Promise<T> {
    const timeoutMs = opts.timeoutMs ?? 15000;
    const headers = opts.headers ?? {};
    const body = JSON.stringify(payload);
    const retries = retryCount(opts);

    for (let attempt = 0; ; attempt++) {
        try {
            return await fetchAttempt<T>(url, body, headers, timeoutMs, signal);
        } catch (error) {
            if (signal?.aborted || attempt >= retries || !isRetryable(error)) throw error;
            const delayMs = Math.max(0, opts.retryDelayMs ?? 100) * (attempt + 1);
            if (delayMs > 0) {
                await new Promise<void>((resolve, reject) => {
                    let timer: ReturnType<typeof setTimeout>;
                    const onDelayDone = () => {
                        signal?.removeEventListener("abort", onAbort);
                        resolve();
                    };
                    const onAbort = () => {
                        clearTimeout(timer);
                        signal?.removeEventListener("abort", onAbort);
                        reject(abortError());
                    };
                    timer = setTimeout(onDelayDone, delayMs);
                    signal?.addEventListener("abort", onAbort, { once: true });
                    if (signal?.aborted) onAbort();
                });
            }
        }
    }
}

function subscribe<T>(flight: Flight<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(abortError());
    const token = Symbol("request-consumer");
    flight.consumers.add(token);

    return new Promise<T>((resolve, reject) => {
        let finished = false;
        const detach = () => {
            if (finished) return;
            finished = true;
            signal?.removeEventListener("abort", onAbort);
            flight.consumers.delete(token);
            if (!flight.settled && flight.consumers.size === 0) flight.controller.abort();
        };
        const onAbort = () => {
            detach();
            reject(abortError());
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        flight.promise.then(
            value => { if (!finished) { detach(); resolve(value); } },
            error => { if (!finished) { detach(); reject(error); } },
        );
    });
}

/*
 * Transport-independent policy runner.
 *
 * `postJSON` above owns the browser fetch transport.  Kernel calls and other
 * host APIs cannot always be expressed as fetch, so they use this runner for
 * the same timeout/retry/single-flight/latest-wins policy.  The executor gets
 * an AbortSignal when the underlying transport supports cancellation; when a
 * host cannot cancel (for example fetchSyncPost), the generation check still
 * prevents a late response from being accepted by the caller.
 */
interface ManagedFlight<T> extends Flight<T> {
    latestKey?: string;
    generation: number;
}

const managedFlights = new Map<string, ManagedFlight<unknown>>();
const latestFlights = new Map<string, ManagedFlight<unknown>>();
const latestGenerations = new Map<string, number>();

function normalizeManagedError(error: unknown, signal: AbortSignal): unknown {
    if (error instanceof RequestError) return error;
    if (signal.aborted) return abortError();
    if (error instanceof DOMException && error.name === "AbortError") return abortError();
    if (error && typeof error === "object" && ("status" in error || "category" in error)) return error;
    // Host adapters may throw domain errors (for example kernel envelope
    // failures). Only obvious transport wording is normalized so read-only
    // retries do not repeat validation/permission failures.
    if (error instanceof Error && /network|offline|fetch|connection|socket|econn|failed to load/i.test(error.message)) {
        return new RequestError(`network error: ${error.message}`, "network");
    }
    return error;
}

async function executeManagedAttempt<T>(
    executor: RequestExecutor<T>,
    controller: AbortController,
    timeoutMs: number,
    label: string,
): Promise<T> {
    const signal = controller.signal;
    if (signal.aborted) throw abortError();
    // Invoke synchronously so callers observe a transport attempt immediately
    // (and so a double-click can be locked before the next microtask).
    let request: Promise<T>;
    try {
        request = Promise.resolve(executor(signal));
    } catch (error) {
        request = Promise.reject(error);
    }
    if (timeoutMs <= 0) {
        try {
            return await request;
        } catch (error) {
            throw normalizeManagedError(error, signal);
        }
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            timedOut = true;
            // Abort cooperatively first; the race below rejects immediately
            // even when the host executor cannot observe this signal.
            controller.abort();
            reject(timeoutError(label, timeoutMs));
        }, timeoutMs);
    });
    try {
        return await Promise.race([request, deadline]);
    } catch (error) {
        if (timedOut) throw timeoutError(label, timeoutMs);
        throw normalizeManagedError(error, signal);
    } finally {
        if (timer !== undefined) clearTimeout(timer);
    }
}

function abortManagedFlight(flight: ManagedFlight<unknown>): void {
    flight.controller.abort();
}

async function runManaged<T>(
    executor: RequestExecutor<T>,
    opts: RequestOptions,
    controller: AbortController,
    latestKey: string | undefined,
    generation: number,
): Promise<T> {
    const timeoutMs = opts.timeoutMs ?? 15000;
    const retries = retryCount(opts);
    for (let attempt = 0; ; attempt++) {
        try {
            const value = await executeManagedAttempt(executor, controller, timeoutMs, opts.dedupeKey ?? latestKey ?? "request");
            if (latestKey && latestGenerations.get(latestKey) !== generation) {
                throw new StaleRequestError(latestKey);
            }
            return value;
        } catch (error) {
            if (controller.signal.aborted || attempt >= retries || !isRetryable(error)) throw error;
            const delayMs = Math.max(0, opts.retryDelayMs ?? 100) * (attempt + 1);
            if (delayMs <= 0) continue;
            await new Promise<void>((resolve, reject) => {
                let timer: ReturnType<typeof setTimeout> | undefined;
                const onAbort = () => {
                    if (timer !== undefined) clearTimeout(timer);
                    controller.signal.removeEventListener("abort", onAbort);
                    reject(abortError());
                };
                timer = setTimeout(() => {
                    controller.signal.removeEventListener("abort", onAbort);
                    resolve();
                }, delayMs);
                controller.signal.addEventListener("abort", onAbort, { once: true });
                if (controller.signal.aborted) onAbort();
            });
        }
    }
}

/**
 * Run an arbitrary request through the shared transport policy.
 *
 * - `readOnly + dedupeKey` coalesces identical in-flight calls.
 * - `latestKey` aborts/supersedes an older call and rejects a late response
 *   with `StaleRequestError`, so UI state can only be updated by the newest
 *   request.
 * - retries remain opt-in and are never applied to writes.
 */
export function requestWithPolicy<T>(executor: RequestExecutor<T>, opts: RequestOptions = {}): Promise<T> {
    if (opts.signal?.aborted) return Promise.reject(abortError());
    const identity = opts.readOnly && opts.dedupeKey
        ? JSON.stringify(["managed", opts.dedupeKey])
        : undefined;
    if (identity) {
        const existing = managedFlights.get(identity) as ManagedFlight<T> | undefined;
        if (existing) return subscribe(existing, opts.signal);
    }

    const controller = new AbortController();
    const latestKey = opts.latestKey;
    let generation = 0;
    if (latestKey) {
        generation = (latestGenerations.get(latestKey) ?? 0) + 1;
        latestGenerations.set(latestKey, generation);
        const previous = latestFlights.get(latestKey);
        if (previous) abortManagedFlight(previous);
    }

    const flight: ManagedFlight<T> = {
        controller,
        promise: Promise.resolve(undefined as T),
        consumers: new Set(),
        settled: false,
        latestKey,
        generation,
    };
    flight.promise = runManaged(executor, opts, controller, latestKey, generation)
        .finally(() => {
            flight.settled = true;
            if (identity && managedFlights.get(identity) === flight) managedFlights.delete(identity);
            if (latestKey && latestFlights.get(latestKey) === flight) latestFlights.delete(latestKey);
        });
    // If all consumers abort, the underlying promise can still settle later;
    // attach a sink so it never becomes an unhandled rejection.
    void flight.promise.catch(() => undefined);
    if (identity) managedFlights.set(identity, flight as ManagedFlight<unknown>);
    if (latestKey) latestFlights.set(latestKey, flight as ManagedFlight<unknown>);
    return subscribe(flight, opts.signal);
}

/** Alias with a concise name for service-layer call sites. */
export const requestManaged = requestWithPolicy;

export function postJSON<T = unknown>(url: string, payload: unknown, opts: RequestOptions = {}): Promise<T> {
    if (opts.signal?.aborted) return Promise.reject(abortError());
    // Keep the fetch-specific timeout/error mapping in runRequest while
    // delegating dedupe, latest-wins, cancellation and retry policy to the
    // transport-independent runner.  The derived key includes payload and
    // headers, so reusing a caller key cannot coalesce a different request.
    const dedupeKey = opts.readOnly && opts.dedupeKey
        ? requestIdentity(url, payload, opts.headers ?? {}, opts.dedupeKey)
        : undefined;
    return requestWithPolicy<T>(
        signal => runRequest<T>(url, payload, { ...opts, signal, retries: 0 }, signal),
        { ...opts, dedupeKey, timeoutMs: 0 },
    );
}
