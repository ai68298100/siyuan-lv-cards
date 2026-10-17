import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { triggerHaptic } from "../src/core/haptic";

describe("haptic feedback (Web Vibration API)", () => {
    const originalNavigator = globalThis.navigator;

    afterEach(() => {
        Object.defineProperty(globalThis, "navigator", {
            configurable: true,
            value: originalNavigator,
        });
    });

    it("triggers default 12ms pulse when navigator.vibrate is available", () => {
        const vibrate = vi.fn().mockReturnValue(true);
        Object.defineProperty(globalThis, "navigator", {
            configurable: true,
            value: { vibrate },
        });

        const res = triggerHaptic();
        expect(res).toBe(true);
        expect(vibrate).toHaveBeenCalledWith(12);
    });

    it("passes complex vibration waveform array (e.g. [15, 30, 15])", () => {
        const vibrate = vi.fn().mockReturnValue(true);
        Object.defineProperty(globalThis, "navigator", {
            configurable: true,
            value: { vibrate },
        });

        const res = triggerHaptic([15, 30, 15]);
        expect(res).toBe(true);
        expect(vibrate).toHaveBeenCalledWith([15, 30, 15]);
    });

    it("returns false and skips execution when disabled in options", () => {
        const vibrate = vi.fn();
        Object.defineProperty(globalThis, "navigator", {
            configurable: true,
            value: { vibrate },
        });

        const res = triggerHaptic(12, { enabled: false });
        expect(res).toBe(false);
        expect(vibrate).not.toHaveBeenCalled();
    });

    it("defensively catches navigator.vibrate errors without throwing", () => {
        const vibrate = vi.fn().mockImplementation(() => {
            throw new Error("SecurityError: vibrate blocked by permission policy");
        });
        Object.defineProperty(globalThis, "navigator", {
            configurable: true,
            value: { vibrate },
        });

        expect(() => triggerHaptic(12)).not.toThrow();
        expect(triggerHaptic(12)).toBe(false);
    });

    it("returns false safely when navigator.vibrate is not supported", () => {
        Object.defineProperty(globalThis, "navigator", {
            configurable: true,
            value: {},
        });

        expect(triggerHaptic()).toBe(false);
    });
});
