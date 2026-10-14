import { postJSON } from "../libs/request";

interface AnkiVersionResponse {
    result?: string | number;
    error?: unknown;
}

/** Read-only AnkiConnect probe. It is safe to retry once after transient transport failures. */
export async function getAnkiConnectVersion(url: string, key = ""): Promise<string> {
    const response = await postJSON<AnkiVersionResponse>(url, {
        action: "version",
        version: 6,
        ...(key ? { key } : {}),
    }, {
        timeoutMs: 5000,
        readOnly: true,
        retries: 1,
        dedupeKey: "anki-connect-version",
    });

    if (response?.error) {
        throw new Error(String(response.error));
    }
    return String(response?.result ?? "?");
}
