export const EXAM_PLANS_CHANGED_EVENT = "siyuan-lv-cards.exam-plans.changed";
export const EXAM_PLANS_PUBLISH_RPC = "siyuan-lv-cards.publish-exam-plans-changed";

export interface ExamPlansChangedNotice {
    schema: 1;
    sourceID: string;
    sequence: number;
    changedAt: number;
}

export function createExamPlansChangedNotice(
    sourceID: string,
    sequence: number,
    changedAt = Date.now(),
): ExamPlansChangedNotice {
    return { schema: 1, sourceID, sequence, changedAt };
}

export function isExamPlansChangedNotice(value: unknown): value is ExamPlansChangedNotice {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const notice = value as Partial<ExamPlansChangedNotice>;
    return notice.schema === 1
        && typeof notice.sourceID === "string"
        && notice.sourceID.length > 0
        && notice.sourceID.length <= 128
        && Number.isSafeInteger(notice.sequence)
        && (notice.sequence ?? 0) > 0
        && Number.isSafeInteger(notice.changedAt)
        && (notice.changedAt ?? 0) > 0;
}

export function shouldReloadExamPlans(value: unknown, ownSourceID: string): value is ExamPlansChangedNotice {
    return isExamPlansChangedNotice(value) && value.sourceID !== ownSourceID;
}

export function isKernelPluginRunning(stateCode: number): boolean {
    return stateCode === 2;
}

/** The persisted operation is authoritative; notification delivery is a non-blocking side effect. */
export function persistThenNotify<T>(
    persist: () => Promise<T>,
    notify: () => Promise<unknown>,
    onNotifyError: (error: unknown) => void,
): Promise<T> {
    return Promise.resolve().then(persist).then(result => {
        void Promise.resolve().then(notify).catch(error => {
            try {
                onNotifyError(error);
            } catch {
                // Diagnostics must not change the persisted operation result.
            }
        });
        return result;
    });
}
