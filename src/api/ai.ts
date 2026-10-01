/**
 * AI 调用层（M2·FR7）：双 provider。
 * - siyuan：思源内置 AI 配置（/api/ai/chatGPT，端点形状 🧪 真机校验，宽容解析）
 * - custom：OpenAI 兼容 /chat/completions（用户自配 endpoint/key/model）
 */
import { fetchSyncPost } from "siyuan";

export interface AIConfig {
    mode: "siyuan" | "custom";
    endpoint: string;
    apiKey: string;
    model: string;
}

export async function aiChat(cfg: AIConfig, system: string, user: string): Promise<string> {
    if (cfg.mode === "custom") {
        if (!cfg.endpoint) {
            throw new Error("custom endpoint is empty");
        }
        const url = cfg.endpoint.replace(/\/+$/, "") + "/chat/completions";
        const resp = await fetch(url, {
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
        });
        if (!resp.ok) {
            throw new Error(`AI HTTP ${resp.status}`);
        }
        const j: any = await resp.json();
        return String(j?.choices?.[0]?.message?.content ?? "");
    }
    // siyuan 内置 AI
    const resp = await fetchSyncPost("/api/ai/chatGPT", {
        messages: [
            { role: "system", content: system },
            { role: "user", content: user },
        ],
    });
    if (!resp || resp.code !== 0) {
        throw new Error(resp?.msg || `kernel error (code=${resp?.code ?? "unknown"})`);
    }
    const d = resp.data;
    return typeof d === "string" ? d : String(d?.content ?? d?.text ?? "");
}

/** 粗略 token 估算（中英混按 4 字符/token） */
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

/** 从模型回复中宽容解析卡片 JSON 数组（容忍 ```json 围栏与前后噪声） */
export function parseCards(raw: string): { q: string; a: string }[] {
    let text = raw.trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) {
        text = fence[1];
    }
    const arrStart = text.indexOf("[");
    const arrEnd = text.lastIndexOf("]");
    if (arrStart >= 0 && arrEnd > arrStart) {
        text = text.slice(arrStart, arrEnd + 1);
    }
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) {
        throw new Error("not an array");
    }
    return arr
        .map((c: any) => ({ q: String(c?.q ?? c?.question ?? "").trim(), a: String(c?.a ?? c?.answer ?? "").trim() }))
        .filter(c => c.q && c.a);
}
