/**
 * AI 调用层（M2·FR7）：双 provider。
 * - siyuan：思源内置 AI 配置（/api/ai/chatGPT，端点形状 🧪 真机校验，宽容解析）
 * - custom：OpenAI 兼容 /chat/completions（用户自配 endpoint/key/model）
 * AQ-14：外部可传入 AbortSignal（向导关闭/换源即取消），请求级 15s 超时。
 * AQ-15：fallback 仅对可恢复错误（网络/5xx/429）生效；401/配额/4xx/取消/解析错误直接给原因。
 */
import { fetchSyncPost } from "siyuan";
import { AICanceledError, isAICanceled, isRecoverableAIError } from "./ai-errors";

// 错误分类从零依赖模块再导出（单测不经 siyuan 包解析；调用方仍从 @/api/ai 引入）
export { AICanceledError, isAICanceled, isRecoverableAIError };

export interface AIConfig {
    mode: "siyuan" | "custom";
    endpoint: string;
    apiKey: string;
    model: string;
    /** 备用端点（300 回退链）：主端点失败时自动切换（仅 custom 模式） */
    fallbackEndpoint?: string;
    fallbackApiKey?: string;
    fallbackModel?: string;
}

export interface AICallOptions {
    /** 取消信号：abort 后不触发 fallback、不写回调用方 */
    signal?: AbortSignal;
    /** 实际使用的 provider 回调（界面可提示「已切换备用端点」） */
    onProvider?: (provider: "primary" | "fallback") => void;
    /** 请求超时毫秒，默认 15000 */
    timeoutMs?: number;
}

const normalizeEndpoint = (url: string) => url.trim().replace(/\/+$/, "");

export async function aiChat(cfg: AIConfig, system: string, user: string, opts: AICallOptions = {}): Promise<string> {
    if (cfg.mode === "custom") {
        if (!cfg.endpoint) {
            throw new Error("custom endpoint is empty");
        }
        try {
            return await chatCompletions(cfg, system, user, opts);
        } catch (e) {
            const fallback = cfg.fallbackEndpoint ? normalizeEndpoint(cfg.fallbackEndpoint) : "";
            if (fallback && fallback !== normalizeEndpoint(cfg.endpoint) && isRecoverableAIError(e)) {
                try {
                    const text = await chatCompletions(
                        { ...cfg, endpoint: fallback, apiKey: cfg.fallbackApiKey ?? "", model: cfg.fallbackModel || cfg.model },
                        system, user,
                        { ...opts, signal: opts.signal, onProvider: undefined },
                    );
                    opts.onProvider?.("fallback");
                    return text;
                } catch (e2) {
                    throw new Error(
                        `AI fail: primary (${describe(e)}) | fallback (${describe(e2)})`,
                    );
                }
            }
            throw e;
        }
    }
    // siyuan 内置 AI（AbortSignal 无法透传 fetchSyncPost，取消语义由调用方序号守卫兜底）
    if (opts.signal?.aborted) {
        throw new AICanceledError();
    }
    const resp = await fetchSyncPost("/api/ai/chatGPT", {
        messages: [
            { role: "system", content: system },
            { role: "user", content: user },
        ],
    });
    if (opts.signal?.aborted) {
        throw new AICanceledError();
    }
    if (!resp || resp.code !== 0) {
        throw new Error(resp?.msg || `kernel error (code=${resp?.code ?? "unknown"})`);
    }
    const d = resp.data;
    return typeof d === "string" ? d : String(d?.content ?? d?.text ?? "");
}

function describe(e: unknown): string {
    return (e instanceof Error ? e.message : String(e ?? "")).slice(0, 200);
}

async function chatCompletions(cfg: AIConfig, system: string, user: string, opts: AICallOptions): Promise<string> {
    const timeoutMs = opts.timeoutMs ?? 15000;
    const ctrl = new AbortController();
    const onOuterAbort = () => ctrl.abort();
    opts.signal?.addEventListener("abort", onOuterAbort);
    const timer = timeoutMs > 0 ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    opts.onProvider?.("primary");
    try {
        const resp = await fetch(normalizeEndpoint(cfg.endpoint) + "/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
            },
            body: JSON.stringify({
                model: cfg.model || "gpt-4o-mini",
                messages: [
                    { role: "system", content: system },
                    { role: "user", content: user },
                ],
                temperature: 0.4,
            }),
            signal: ctrl.signal,
        });
        if (opts.signal?.aborted) {
            throw new AICanceledError();
        }
        if (!resp.ok) {
            throw new Error(`AI HTTP ${resp.status}`);
        }
        try {
            const j: any = await resp.json();
            return String(j?.choices?.[0]?.message?.content ?? "");
        } catch {
            throw new Error("AI parse failed");
        }
    } catch (e) {
        // 区分「调用方取消」与「超时」：前者不可恢复，后者按网络故障可 fallback/重试
        if (opts.signal?.aborted) {
            throw new AICanceledError();
        }
        if (e instanceof DOMException && e.name === "AbortError") {
            throw new Error(`AI timeout after ${timeoutMs}ms`);
        }
        throw e;
    } finally {
        if (timer) { clearTimeout(timer); }
        opts.signal?.removeEventListener("abort", onOuterAbort);
    }
}

// 解析/估算纯逻辑从 ai-parse 再导出（零依赖可单测；调用方 import 路径不变）
export { estimateTokens, parseCards } from "./ai-parse";
