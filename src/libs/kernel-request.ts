import { unwrapKernelData } from "./kernel-response";
import { TimeoutError, withTimeout } from "./timeout";
import { RequestError, requestWithPolicy, type RequestOptions } from "./request";

export type KernelRequester = (endpoint: string, payload: Record<string, unknown>) => Promise<unknown>;

export type KernelRequestOptions = Pick<
    RequestOptions,
    "readOnly" | "retries" | "retryDelayMs" | "dedupeKey" | "latestKey" | "signal"
>;

/** Common bounded boundary for SiYuan kernel POST calls. */
export async function requestKernelData<T>(
    request: KernelRequester,
    endpoint: string,
    payload: Record<string, unknown>,
    timeoutMs = 15000,
    options: KernelRequestOptions = {},
): Promise<T> {
    // fetchSyncPost does not accept AbortSignal.  The policy runner still
    // protects consumers from late responses (latestKey) and lets callers
    // cancel their wait; the explicit deadline bounds the host promise.
    return requestWithPolicy(
        async () => {
            let response: unknown;
            try {
                response = await withTimeout(request(endpoint, payload), timeoutMs, endpoint);
            } catch (error) {
                // Host transport failures are retryable for read-only calls;
                // malformed/kernel-error envelopes below remain application
                // errors and are never retried by the shared policy.
                if (error instanceof TimeoutError) {
                    throw new RequestError(error.message, "timeout");
                }
                if (error instanceof RequestError) throw error;
                throw new RequestError(
                    `network error: ${error instanceof Error ? error.message : String(error)}`,
                    "network",
                );
            }
            return unwrapKernelData<T>(response);
        },
        // Keep timeout ownership in withTimeout so existing kernel error text
        // remains stable while sharing dedupe/latest/retry policy.
        { ...options, timeoutMs: 0 },
    );
}
