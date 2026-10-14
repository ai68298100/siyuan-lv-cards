import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import AIWizard from "../src/ui/ai-wizard.svelte";

vi.mock("svelte/transition", () => ({ fade: () => ({ duration: 0, css: () => "" }) }));

const { getRiffDecks } = vi.hoisted(() => ({ getRiffDecks: vi.fn() }));
vi.mock("@/api/riff", () => ({ getRiffDecks, createRiffDeck: vi.fn() }));
vi.mock("@/api/ai", () => ({ classifyAiFailure: () => ({ cls: "network" }), isAICanceled: () => false }));
vi.mock("siyuan", () => ({ showMessage: vi.fn() }));

const aiWizardText = new Proxy<Record<string, string>>({}, {
    get: (_target, key) => String(key),
});

describe("AI wizard recovery", () => {
    beforeEach(() => getRiffDecks.mockResolvedValue([{ id: "deck-a", name: "Default" }]));
    afterEach(cleanup);

    it("restores saved candidate text for review without regenerating or importing it", async () => {
        const onCreate = vi.fn();
        render(AIWizard, {
            i18n: { aiWizard: aiWizardText },
            generate: vi.fn(),
            onCreate,
            onClose: vi.fn(),
            closeLabel: "Close",
            recoveryJob: {
                id: "review-job",
                sourceLabel: "Chapter A",
                candidates: [{ q: "Saved question", a: "Saved answer", origIndex: 2 }],
            },
        });

        expect(await screen.findByDisplayValue("Saved question")).toBeTruthy();
        expect(screen.getByDisplayValue("Saved answer")).toBeTruthy();
        expect(screen.getByText(/recoveredCandidates/)).toBeTruthy();
        const regenerate = document.querySelector<HTMLButtonElement>('button[title="recoveredRegenHint"]');
        expect(regenerate?.disabled).toBe(true);
        expect(onCreate).not.toHaveBeenCalled();
    });
});
