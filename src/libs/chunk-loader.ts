/**
 * AT-17 自研 chunk 加载器（v0.158.0）：主包经 script 标签加载 UI chunk。
 * 机制与思源自身加载器同源（移动端路径 = src script 标签，桌面端 = XHR 文本 + 内联），
 * 本插件取 src script 标签（无 eval/CSP 依赖；内核 HTTP 静态服务已实证 200）。
 * chunk 为独立 IIFE，自带 svelte（挂载与组件同实例，无双份内部状态），siyuan 走
 * shell 注入的 window.__lvSiyuan。CSS 以 <link> 注入（每 chunk 一次）。
 */

const BASE = `plugins/siyuan-lv-cards`;
export type ChunkName = "hub" | "review";

export interface ChunkMount {
    /** 挂载组件；返回句柄供 tab destroy 调用 */
    mount(target: HTMLElement, props: Record<string, unknown>): { destroy(): void };
}

const pending: Partial<Record<ChunkName, Promise<ChunkMount>>> = {};

/** 注入 <link>（幂等）；CSS 加载失败不阻断 JS（组件仍可用，仅裸样式） */
function injectCss(name: ChunkName, version: string): void {
    const id = `lv-chunk-css-${name}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `${BASE}/chunks/${name}.css?v=${version}`;
    document.head.appendChild(link);
}

function injectScript(name: ChunkName, version: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const id = `lv-chunk-js-${name}`;
        if (document.getElementById(id)) return resolve();
        const s = document.createElement("script");
        s.id = id;
        s.src = `${BASE}/chunks/${name}.js?v=${version}`;
        s.async = false;
        s.onload = () => resolve();
        s.onerror = () => {
            s.remove();
            reject(new Error(`lv chunk load failed: ${name}`));
        };
        document.head.appendChild(s);
    });
}

/** 加载 chunk 并返回其挂载入口（幂等：同 chunk 只注入一次） */
export function loadChunk(name: ChunkName): Promise<ChunkMount> {
    return (pending[name] ??= (async () => {
        const version = __LV_VERSION__;
        await injectScript(name, version);
        injectCss(name, version);
        const reg = (window as any).__lvChunks as Record<string, unknown> | undefined;
        const mod = reg?.[name] as ChunkMount | undefined;
        if (!mod || typeof mod.mount !== "function") {
            throw new Error(`lv chunk missing mount export: ${name}`);
        }
        return mod;
    })().catch((e) => {
        delete pending[name]; // 失败可重试（下次调用重新注入）
        throw e;
    }));
}

// vite define 注入（dev 模式亦有 define，无需运行时兜底）
declare const __LV_VERSION__: string;
