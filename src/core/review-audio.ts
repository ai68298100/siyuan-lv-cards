/**
 * 专注复习音频与语音朗读服务（Web Audio 评分音效合成 + Web Speech TTS，纯逻辑，带防御式降级）
 */

export type Rating = 1 | 2 | 3 | 4;
export type SfxStyle = "chime" | "wood" | "bell";

export interface SfxConfig {
    sfxEnabled: boolean;
    sfxStyle?: SfxStyle;
}

export interface TtsConfig {
    ttsEnabled: boolean;
    ttsRate?: number;
    ttsVoice?: string;
}

/**
 * 评分音效合成参数
 */
export interface SfxTonePlan {
    style: SfxStyle;
    type: OscillatorType;
    frequencies: { freq: number; timeOffset: number }[];
    gainPeak: number;
    decayDuration: number;
}

/**
 * 计算音效频率与波形计划（纯函数，支持无 AudioContext 单测）
 */
export function planSfxTone(rating: Rating, style: SfxStyle = "chime"): SfxTonePlan {
    if (style === "wood") {
        return {
            style: "wood",
            type: "triangle",
            frequencies: [{ freq: 600 + rating * 45, timeOffset: 0 }],
            gainPeak: 0.2,
            decayDuration: 0.1,
        };
    }

    const freqs: Record<number, number[]> = {
        1: [220],
        2: [330, 392],
        3: [440, 554],
        4: [523, 659],
    };

    const notes = (freqs[rating] ?? [440]).map(f => (style === "bell" ? f * 2 : f));
    const step = 0.08;
    const tail = style === "bell" ? 0.45 : 0.1;

    return {
        style,
        type: "sine",
        frequencies: notes.map((freq, i) => ({ freq, timeOffset: i * step })),
        gainPeak: 0.15,
        decayDuration: notes.length * step + tail,
    };
}

/**
 * 播放评分音效（Web Audio API）
 */
export function playReviewSfx(
    rating: Rating,
    config: SfxConfig,
    existingCtx: AudioContext | null = null,
    AudioContextClass: typeof AudioContext | undefined = typeof window !== "undefined" ? (window.AudioContext || (window as any).webkitAudioContext) : undefined,
): AudioContext | null {
    if (!config.sfxEnabled || (!existingCtx && !AudioContextClass)) {
        return existingCtx;
    }

    let ctx = existingCtx;
    if (!ctx && AudioContextClass) {
        try {
            ctx = new AudioContextClass();
        } catch {
            return null;
        }
    }
    if (!ctx) return null;

    try {
        const plan = planSfxTone(rating, config.sfxStyle || "chime");
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;
        osc.type = plan.type;

        for (const note of plan.frequencies) {
            osc.frequency.setValueAtTime(note.freq, now + note.timeOffset);
        }

        gain.gain.setValueAtTime(plan.gainPeak, now);
        gain.gain.exponentialRampToValueAtTime(0.005, now + plan.decayDuration);

        osc.start(now);
        osc.stop(now + plan.decayDuration);
    } catch {
        // 音频上下文受浏览器自动播放策略限制时防御式旁路
    }

    return ctx;
}

/**
 * 语言自适应识别（中文使用 zh-CN，其余回退 en-US）
 */
export function detectLanguage(text: string): "zh-CN" | "en-US" {
    return /[\u4e00-\u9fa5]/.test(text) ? "zh-CN" : "en-US";
}

/**
 * TTS 语音朗读文本
 */
export function speakReviewText(
    text: string,
    config: Partial<TtsConfig> = {},
    synth: SpeechSynthesis | undefined = typeof window !== "undefined" ? window.speechSynthesis : undefined,
    UtteranceClass: any = typeof SpeechSynthesisUtterance !== "undefined" ? SpeechSynthesisUtterance : undefined,
): SpeechSynthesisUtterance | null {
    if (!synth || !text || !UtteranceClass) {
        return null;
    }

    try {
        const u = new UtteranceClass(text);
        u.lang = detectLanguage(text);
        if (config.ttsRate) {
            u.rate = config.ttsRate;
        }
        if (config.ttsVoice && typeof synth.getVoices === "function") {
            const voice = synth.getVoices().find(v => v.name === config.ttsVoice);
            if (voice) {
                u.voice = voice;
            }
        }
        synth.cancel();
        synth.speak(u);
        return u;
    } catch {
        return null;
    }
}

/**
 * 清洗 HTML 并朗读答案文本
 */
export function speakAnswerText(
    expectedText: string,
    cardHtml: string,
    config: TtsConfig,
    synth?: SpeechSynthesis,
    UtteranceClass?: any,
): SpeechSynthesisUtterance | null {
    if (!config.ttsEnabled) {
        return null;
    }
    const text = expectedText || (cardHtml || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (!text) {
        return null;
    }
    return speakReviewText(text, config, synth, UtteranceClass);
}

/**
 * 安全销毁 AudioContext
 */
export function closeReviewAudio(ctx: AudioContext | null): void {
    if (!ctx) return;
    try {
        if (ctx.state !== "closed" && typeof ctx.close === "function") {
            void ctx.close();
        }
    } catch {
        // 旁路
    }
}
