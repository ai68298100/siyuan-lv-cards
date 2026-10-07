import { unwrapKernelData } from "./kernel-response";
import { withTimeout } from "./timeout";

export type KernelRequester = (endpoint: string, payload: Record<string, unknown>) => Promise<unknown>;

/** Common bounded boundary for SiYuan kernel POST calls. */
export async function requestKernelData<T>(
    request: KernelRequester,
    endpoint: string,
    payload: Record<string, unknown>,
    timeoutMs = 15000,
): Promise<T> {
    const response = await withTimeout(request(endpoint, payload), timeoutMs, endpoint);
    return unwrapKernelData<T>(response);
}
