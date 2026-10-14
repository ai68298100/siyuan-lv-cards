import { describe, expect, it, vi } from "vitest";
import {
    planSfxTone,
    playReviewSfx,
    detectLanguage,
    speakReviewText,
    speakAnswerText,
    closeReviewAudio,
} from "../src/core/review-audio";

describe("review-audio 纯逻辑与防御式降级", () => {
    describe("planSfxTone 音效规划算法", () => {
        it("木鱼（wood）：短促三角波，音高随评分递增", () => {
            const plan1 = planSfxTone(1, "wood");
            const plan4 = planSfxTone(4, "wood");

            expect(plan1.type).toBe("triangle");
            expect(plan1.frequencies[0].freq).toBe(645);
            expect(plan4.frequencies[0].freq).toBe(780);
            expect(plan1.decayDuration).toBeCloseTo(0.1);
        });

        it("清音（chime）：正弦波，不同评分音阶规划正确", () => {
            const plan1 = planSfxTone(1, "chime");
            const plan3 = planSfxTone(3, "chime");

            expect(plan1.type).toBe("sine");
            expect(plan1.frequencies.map(f => f.freq)).toEqual([220]);
            expect(plan3.frequencies.map(f => f.freq)).toEqual([440, 554]);
        });

        it("铃声（bell）：频率加倍且混响尾音更长", () => {
            const chimePlan = planSfxTone(1, "chime");
            const bellPlan = planSfxTone(1, "bell");

            expect(bellPlan.frequencies[0].freq).toBe(chimePlan.frequencies[0].freq * 2);
            expect(bellPlan.decayDuration).toBeGreaterThan(chimePlan.decayDuration);
        });
    });

    describe("playReviewSfx 播放控制", () => {
        it("当 sfxEnabled=false 时直接早退，不创建任何 AudioContext", () => {
            const mockAudioContextClass = vi.fn();
            const result = playReviewSfx(3, { sfxEnabled: false }, null, mockAudioContextClass as any);
            expect(result).toBeNull();
            expect(mockAudioContextClass).not.toHaveBeenCalled();
        });

        it("当 sfxEnabled=true 时调用 Web Audio API 振荡器与增益节点", () => {
            const mockOsc = {
                connect: vi.fn(),
                start: vi.fn(),
                stop: vi.fn(),
                frequency: { setValueAtTime: vi.fn() },
                type: "sine",
            };
            const mockGain = {
                connect: vi.fn(),
                gain: {
                    setValueAtTime: vi.fn(),
                    exponentialRampToValueAtTime: vi.fn(),
                },
            };
            const mockCtx = {
                currentTime: 10,
                destination: {},
                createOscillator: vi.fn(() => mockOsc),
                createGain: vi.fn(() => mockGain),
            };

            const ctx = playReviewSfx(3, { sfxEnabled: true, sfxStyle: "chime" }, mockCtx as any);
            expect(ctx).toBe(mockCtx);
            expect(mockCtx.createOscillator).toHaveBeenCalled();
            expect(mockGain.connect).toHaveBeenCalledWith(mockCtx.destination);
            expect(mockOsc.start).toHaveBeenCalledWith(10);
        });

        it("AudioContext 抛错时防御式旁路，不阻断评分流转", () => {
            const mockCtx = {
                currentTime: 10,
                destination: {},
                createOscillator: vi.fn(() => { throw new Error("Audio blocked"); }),
                createGain: vi.fn(),
            };
            expect(() => playReviewSfx(1, { sfxEnabled: true }, mockCtx as any)).not.toThrow();
        });
    });

    describe("detectLanguage 语言探测", () => {
        it("含有中文字符返回 zh-CN，否则返回 en-US", () => {
            expect(detectLanguage("你好世界")).toBe("zh-CN");
            expect(detectLanguage("Hello world (含汉字)")).toBe("zh-CN");
            expect(detectLanguage("Hello World 123")).toBe("en-US");
            expect(detectLanguage("Bonjour")).toBe("en-US");
        });
    });

    describe("speakReviewText 与 speakAnswerText", () => {
        it("文本为空或无 speechSynthesis 时返回 null", () => {
            expect(speakReviewText("", {}, undefined)).toBeNull();
            expect(speakReviewText("Hello", {}, undefined)).toBeNull();
        });

        it("启用 TTS 时清洗 HTML 并调用 speechSynthesis.speak", () => {
            class MockUtterance {
                text: string;
                lang = "";
                rate = 1;
                voice: any = null;
                constructor(text: string) { this.text = text; }
            }
            const mockSpeak = vi.fn();
            const mockCancel = vi.fn();
            const mockSynth = {
                speak: mockSpeak,
                cancel: mockCancel,
                getVoices: vi.fn(() => [{ name: "Ting-Ting" }]),
            };

            const res = speakAnswerText(
                "",
                "<p>答案是：<b>光合作用</b></p>",
                { ttsEnabled: true, ttsRate: 1.2, ttsVoice: "Ting-Ting" },
                mockSynth as any,
                MockUtterance,
            );
            expect(res).not.toBeNull();
            expect(res?.text).toBe("答案是： 光合作用");
            expect(res?.lang).toBe("zh-CN");
            expect(res?.rate).toBe(1.2);
            expect(mockCancel).toHaveBeenCalled();
            expect(mockSpeak).toHaveBeenCalled();
        });

        it("当 ttsEnabled=false 时不触发朗读", () => {
            const mockSynth = { speak: vi.fn(), cancel: vi.fn() };
            const res = speakAnswerText("答案", "", { ttsEnabled: false }, mockSynth as any);
            expect(res).toBeNull();
            expect(mockSynth.speak).not.toHaveBeenCalled();
        });
    });

    describe("closeReviewAudio 资源清理", () => {
        it("安全关闭未关闭的 AudioContext", () => {
            const mockClose = vi.fn();
            const mockCtx = { state: "running", close: mockClose };
            closeReviewAudio(mockCtx as any);
            expect(mockClose).toHaveBeenCalled();
        });

        it("已 closed 或为 null 时安全跳过", () => {
            const mockClose = vi.fn();
            const mockCtx = { state: "closed", close: mockClose };
            closeReviewAudio(mockCtx as any);
            expect(mockClose).not.toHaveBeenCalled();
            expect(() => closeReviewAudio(null)).not.toThrow();
        });
    });
});
