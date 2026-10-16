import {
    HEALTH_KINDS,
    evalSourceHealth,
    openIssues,
    recordIssues,
    resolveIssue,
    type HealthIssue,
    type SourceCurrentFacts,
    type SourceFingerprint,
    type SourceHealthRecord,
} from "./source-health";

export const SOURCE_HEALTH_SCHEMA = 1 as const;

export interface SourceHealthEntry {
    fingerprint: SourceFingerprint;
    history: SourceHealthRecord[];
}

export interface SourceHealthData {
    schema: typeof SOURCE_HEALTH_SCHEMA;
    entries: SourceHealthEntry[];
}

export interface SourceHealthHistoryItem {
    blockID: string;
    records: SourceHealthRecord[];
}

export function emptySourceHealth(): SourceHealthData {
    return { schema: SOURCE_HEALTH_SCHEMA, entries: [] };
}

function validFingerprint(value: unknown): value is SourceFingerprint {
    if (!value || typeof value !== "object") return false;
    const item = value as Partial<SourceFingerprint>;
    return typeof item.blockID === "string" && item.blockID.length > 0
        && typeof item.rootID === "string"
        && typeof item.contentHash === "string"
        && Array.isArray(item.mediaRefs)
        && item.mediaRefs.every(ref => typeof ref === "string");
}

function validHistory(value: unknown): SourceHealthRecord[] {
    if (!Array.isArray(value)) return [];
    return value.filter(item => {
        if (!item || typeof item !== "object") return false;
        const row = item as Partial<SourceHealthRecord>;
        return validTimestamp(row.at)
            && (row.resolvedAt === undefined || validTimestamp(row.resolvedAt))
            && typeof row.kind === "string" && (HEALTH_KINDS as readonly string[]).includes(row.kind)
            && typeof row.resolved === "boolean" && typeof row.detail === "string";
    }).map(item => ({
        at: Number((item as SourceHealthRecord).at),
        kind: (item as SourceHealthRecord).kind,
        resolved: Boolean((item as SourceHealthRecord).resolved),
        detail: String((item as SourceHealthRecord).detail),
        ...((item as SourceHealthRecord).resolvedAt !== undefined
            ? { resolvedAt: (item as SourceHealthRecord).resolvedAt }
            : {}),
    }));
}

function validTimestamp(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(new Date(value).getTime());
}

/** An unknown probe result cannot prove that a previously missing asset recovered. */
function mediaRecoveryConfirmed(fingerprint: SourceFingerprint, current?: Pick<SourceCurrentFacts, "mediaPresent"> | null): boolean {
    return fingerprint.mediaRefs.every(ref => current?.mediaPresent[ref] === true);
}

function issueFromRecord(record: SourceHealthRecord): HealthIssue {
    const impact = record.kind === "media-broken" ? "media" : record.kind === "license-changed" ? "license" : record.kind;
    return { kind: record.kind, detail: record.detail, impactKey: `sourceHealth.impact.${impact}`, affectsScheduling: false };
}

export function normalizeSourceHealth(raw: unknown): SourceHealthData {
    const list = raw && typeof raw === "object" && Array.isArray((raw as { entries?: unknown }).entries)
        ? (raw as { entries: unknown[] }).entries
        : [];
    const byBlock = new Map<string, SourceHealthEntry>();
    for (const rawEntry of list) {
        if (!rawEntry || typeof rawEntry !== "object") continue;
        const entry = rawEntry as Partial<SourceHealthEntry>;
        if (!validFingerprint(entry.fingerprint)) continue;
        const fingerprint: SourceFingerprint = {
            blockID: entry.fingerprint.blockID,
            rootID: entry.fingerprint.rootID,
            contentHash: entry.fingerprint.contentHash,
            mediaRefs: [...new Set(entry.fingerprint.mediaRefs)],
            ...(typeof entry.fingerprint.license === "string" ? { license: entry.fingerprint.license } : {}),
        };
        byBlock.set(fingerprint.blockID, { fingerprint, history: validHistory(entry.history) });
    }
    return { schema: SOURCE_HEALTH_SCHEMA, entries: [...byBlock.values()] };
}

export function upsertSourceFingerprint(data: SourceHealthData, fingerprint: SourceFingerprint): SourceHealthData {
    if (!validFingerprint(fingerprint)) return data;
    const entries = data.entries.filter(entry => entry.fingerprint.blockID !== fingerprint.blockID);
    const previous = data.entries.find(entry => entry.fingerprint.blockID === fingerprint.blockID);
    entries.push({
        fingerprint: {
            ...fingerprint,
            mediaRefs: [...new Set(fingerprint.mediaRefs)],
        },
        history: previous?.history.map(item => ({ ...item })) ?? [],
    });
    return { schema: SOURCE_HEALTH_SCHEMA, entries };
}

/**
 * Explicitly accept the source as it exists now and make it the new baseline.
 *
 * This is intentionally separate from reconciliation: a scan must never move
 * the baseline on its own, while the maintenance UI can ask the user to
 * acknowledge a known source edit/move. Existing history is retained. Media
 * issues stay open until probes confirm recovery or their references are removed.
 */
export function acknowledgeSourceHealth(
    data: SourceHealthData,
    fingerprint: SourceFingerprint,
    now: number = Date.now(),
    current?: Pick<SourceCurrentFacts, "mediaPresent">,
): SourceHealthData {
    if (!validFingerprint(fingerprint)) return data;
    const previous = data.entries.find(entry => entry.fingerprint.blockID === fingerprint.blockID);
    let history = previous?.history.map(item => ({ ...item })) ?? [];
    for (const issue of openIssues(history)) {
        if (issue.kind === "media-broken" && !mediaRecoveryConfirmed(fingerprint, current)) continue;
        history = resolveIssue(history, issue.kind, now);
    }
    if (current) {
        const mediaIssues = evalSourceHealth(fingerprint, {
            rootID: fingerprint.rootID,
            contentHash: fingerprint.contentHash,
            mediaPresent: current.mediaPresent,
            license: fingerprint.license,
        }).issues;
        history = recordIssues(history, mediaIssues, now);
    }
    const next = upsertSourceFingerprint(data, fingerprint);
    return {
        schema: SOURCE_HEALTH_SCHEMA,
        entries: next.entries.map(entry => entry.fingerprint.blockID === fingerprint.blockID
            ? { ...entry, history }
            : entry),
    };
}

/** Reconcile one card's current source facts without changing its baseline fingerprint. */
export function reconcileSourceHealth(
    data: SourceHealthData,
    blockID: string,
    current: SourceCurrentFacts | null,
    now: number = Date.now(),
): { data: SourceHealthData; issues: ReturnType<typeof evalSourceHealth>["issues"] } {
    const entry = data.entries.find(item => item.fingerprint.blockID === blockID);
    if (!entry) return { data, issues: [] };
    const evaluation = evalSourceHealth(entry.fingerprint, current);
    let history = recordIssues(entry.history, evaluation.issues, now);
    const currentKinds = new Set(evaluation.issues.map(issue => issue.kind));
    for (const open of openIssues(history)) {
        const unverified = !current
            || (open.kind === "media-broken" && !mediaRecoveryConfirmed(entry.fingerprint, current))
            || (open.kind === "license-changed" && current.license === undefined);
        if (unverified) {
            if (!currentKinds.has(open.kind)) {
                evaluation.issues.push(issueFromRecord(open));
            }
            continue;
        }
        if (!currentKinds.has(open.kind)) history = resolveIssue(history, open.kind, now);
    }
    const entries = data.entries.map(item => item.fingerprint.blockID === blockID ? { ...item, history } : item);
    return { data: { schema: SOURCE_HEALTH_SCHEMA, entries }, issues: evaluation.issues };
}

export function sourceHealthIssues(data: SourceHealthData, blockID: string): SourceHealthRecord[] {
    const entry = data.entries.find(item => item.fingerprint.blockID === blockID);
    return entry ? openIssues(entry.history).map(item => ({ ...item })) : [];
}

/** Full append-only history for diagnostics; callers may render resolved rows too. */
export function sourceHealthHistory(data: SourceHealthData, blockID: string): SourceHealthRecord[] {
    const entry = data.entries.find(item => item.fingerprint.blockID === blockID);
    return entry ? entry.history.map(item => ({ ...item })) : [];
}

/** All persisted histories, including sources that no longer belong to a card group. */
export function sourceHealthHistories(data: SourceHealthData): SourceHealthHistoryItem[] {
    return data.entries
        .filter(entry => entry.history.length > 0)
        .map(entry => ({
            blockID: entry.fingerprint.blockID,
            records: entry.history.map(item => ({ ...item })),
        }));
}
