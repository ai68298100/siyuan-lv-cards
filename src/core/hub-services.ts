/** Pure, on-demand services carried by the hub chunk. The shell owns all state and I/O. */
import { findApproximateDuplicateCandidates } from "./maintenance-queue";
import { applyBatchRepair, confirmBatchRepair, previewBatchRepair, rollbackBatchRepair, appendRepairJournalEntry, updateRepairJournalEntryStatus, normalizeRepairJournal } from "./maintenance-repair";
import { createMaintenanceRepairStorage } from "./maintenance-repair-storage";
import { createMaintenanceRepairController } from "./maintenance-repair-controller";
import { helpMarkdown } from "../help";
import { renderExamReportMarkdown } from "./report-writer";
import { buildDiagnosticsText } from "./diagnostics";

export const hubServices = {
    findApproximateDuplicateCandidates,
    applyBatchRepair,
    confirmBatchRepair,
    previewBatchRepair,
    rollbackBatchRepair,
    appendRepairJournalEntry,
    updateRepairJournalEntryStatus,
    createMaintenanceRepairStorage,
    createMaintenanceRepairController,
    normalizeRepairJournal,
    helpMarkdown,
    renderExamReportMarkdown,
    buildDiagnosticsText,
};

export type HubServices = typeof hubServices;
