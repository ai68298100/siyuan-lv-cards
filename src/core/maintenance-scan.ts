export interface MaintenanceScanPage {
    blocks?: { id?: unknown }[];
    total?: number;
    pageCount?: number;
}

export interface MaintenanceScanResult {
    ids: string[];
    error?: string;
    issue?: { kind: "empty-page" | "repeated-page"; page: number };
}

function pageCountOf(data: MaintenanceScanPage, pageSize: number): number | undefined {
    const reported = Number.isSafeInteger(data.pageCount) && (data.pageCount ?? 0) >= 0
        ? data.pageCount!
        : undefined;
    const total = Number.isSafeInteger(data.total) && (data.total ?? -1) >= 0
        ? Math.ceil(data.total! / pageSize)
        : undefined;
    if (reported === undefined && total === undefined) return undefined;
    return Math.max(1, reported ?? 1, total ?? 1);
}

function pageIds(data: MaintenanceScanPage): string[] {
    return (data.blocks ?? [])
        .map(block => typeof block?.id === "string" ? block.id : String(block?.id ?? ""))
        .filter(Boolean);
}

function pageFingerprint(ids: string[]): string {
    return JSON.stringify(ids);
}

/** Collects every page while preserving partial IDs and reporting interrupted scans. */
export async function scanAllMaintenanceCardIds(
    fetchPage: (page: number, pageSize: number) => Promise<MaintenanceScanPage>,
    pageSize = 100,
): Promise<MaintenanceScanResult> {
    const ids: string[] = [];
    const seen = new Set<string>();
    const fingerprints = new Set<string>();
    let expectedPages: number | undefined;

    for (let page = 1; ; page++) {
        let data: MaintenanceScanPage;
        try {
            data = await fetchPage(page, pageSize);
        } catch (error) {
            return { ids, error: error instanceof Error ? error.message : String(error) };
        }

        const currentIds = pageIds(data);
        for (const id of currentIds) {
            if (seen.has(id)) continue;
            seen.add(id);
            ids.push(id);
        }

        const reportedPages = pageCountOf(data, pageSize);
        if (reportedPages !== undefined) {
            expectedPages = Math.max(expectedPages ?? 1, reportedPages);
        }

        if (expectedPages !== undefined) {
            if (page >= expectedPages) return { ids };
            if (currentIds.length === 0) {
                return { ids, issue: { kind: "empty-page", page } };
            }
        } else if (currentIds.length < pageSize) {
            return { ids };
        }

        const fingerprint = pageFingerprint(currentIds);
        if (fingerprints.has(fingerprint)) {
            return { ids, issue: { kind: "repeated-page", page } };
        }
        fingerprints.add(fingerprint);
    }
}
