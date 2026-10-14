/** Duration contract for Svelte transitions whose API requires milliseconds. */
export const MOTION_DURATION_MS = {
    fast: 120,
    standard: 140,
    panel: 150,
    normal: 160,
    emphasis: 180,
    slow: 240,
} as const;

export type MotionSpeed = keyof typeof MOTION_DURATION_MS;

export function getMotionDuration(speed: MotionSpeed): number {
    const reduced = typeof window !== "undefined"
        && typeof window.matchMedia === "function"
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return reduced ? 0 : MOTION_DURATION_MS[speed];
}
