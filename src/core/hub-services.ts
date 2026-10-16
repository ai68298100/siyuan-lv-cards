/** Pure, on-demand services carried by the hub chunk. The shell owns all state and I/O. */
import { findApproximateDuplicateCandidates } from "./maintenance-queue";
import { applyBatchRepair, confirmBatchRepair, previewBatchRepair } from "./maintenance-repair";
import { createMaintenanceRepairStorage } from "./maintenance-repair-storage";
import { helpMarkdown } from "../help";
import { renderExamReportMarkdown } from "./report-writer";
import { buildDiagnosticsText } from "./diagnostics";

export const hubServices = {
    findApproximateDuplicateCandidates,
    applyBatchRepair,
    confirmBatchRepair,
    previewBatchRepair,
    createMaintenanceRepairStorage,
    helpMarkdown,
    renderExamReportMarkdown,
    buildDiagnosticsText,
};

export type HubServices = typeof hubServices;
