/**
 * AT-17 自研 chunk 加载器（v0.158.0）：主包经 script 标签加载 UI chunk。
 * 机制与思源自身加载器同源（移动端路径 = src script 标签，桌面端 = XHR 文本 + 内联），
 * 本插件取 src script 标签（无 eval/CSP 依赖；内核 HTTP 静态服务已实证 200）。
 * chunk 为独立 IIFE，自带 svelte（挂载与组件同实例，无双份内部状态），siyuan 走
 * shell 注入的 window.__lvSiyuan。CSS 以 <link> 注入（每 chunk 一次）。
 */

// 必须根绝对：桌面端页面位于 /stage/build/app/ 下，相对路径会解析成
// /stage/build/app/plugins/…（内核 404，v0.185.0 真机空白实证）；内核对 /plugins/* 全端同源服务
const BASE = `/plugins/siyuan-lv-cards`;
/** hub/review=挂载器形态 {mount}；dialogs=组件注册表+挂载器安装（形态随 chunk 约定） */
export type ChunkName = "hub" | "review" | "dialogs";

export interface ChunkMount {
    /** 挂载组件；返回句柄供 tab destroy 调用 */
    mount(target: HTMLElement, props: Record<string, unknown>): { destroy(): void };
}

const pending: Partial<Record<ChunkName, Promise<ChunkMount>>> = {};

/** 注入 <link>（幂等）；CSS 加载失败不阻断 JS（组件仍可用，仅裸样式） */
function injectCss(name: ChunkName, version: string): void {
    const id = `lv-chunk-css-${name}`;
    const href = `${BASE}/chunks/${name}.css?v=${version}`;
    const existing = document.getElementById(id) as HTMLLinkElement | null;
    if (existing) {
        const currentHref = existing.getAttribute("href");
        // 开发测试会预插无 href 占位；生产节点带版本号时，版本变化必须替换旧 CSS。
        if (!currentHref || new URL(currentHref, document.baseURI).href === new URL(href, document.baseURI).href) {
            return;
        }
        existing.remove();
    }
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
}

function injectScript(name: ChunkName, version: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const id = `lv-chunk-js-${name}`;
        const src = `${BASE}/chunks/${name}.js?v=${version}`;
        const existing = document.getElementById(id) as HTMLScriptElement | null;
        if (existing) {
            const currentSrc = existing.getAttribute("src");
            // 保留无 src 预插占位（测试/宿主预加载）；生产旧版本节点必须移除后再请求。
            if (!currentSrc || new URL(currentSrc, document.baseURI).href === new URL(src, document.baseURI).href) {
                return resolve();
            }
            existing.remove();
            const reg = (window as any).__lvChunks as Record<string, unknown> | undefined;
            if (reg) {
                delete reg[name];
            }
        }
        const s = document.createElement("script");
        s.id = id;
        s.src = src;
        s.async = false;
        s.onload = () => resolve();
        s.onerror = () => {
            s.remove();
            reject(new Error(`lv chunk load failed: ${name}`));
        };
        document.head.appendChild(s);
    });
}

/** 加载 chunk 并返回其注册表模块（幂等：同 chunk 只注入一次；形态由调用方按 chunk 约定解构） */
export function loadChunk(name: ChunkName): Promise<Record<string, any>> {
    return (pending[name] ??= (async () => {
        const version = __LV_VERSION__;
        await injectScript(name, version);
        injectCss(name, version);
        const reg = (window as any).__lvChunks as Record<string, any> | undefined;
        const mod = reg?.[name];
        if (!mod || typeof mod !== "object") {
            // 脚本已执行但未注册模块时，移除占位节点，确保后续重试会真正
            // 重新请求脚本；仅删除 pending 会被同 id 的旧节点短路，永远无法恢复。
            document.getElementById(`lv-chunk-js-${name}`)?.remove();
            document.getElementById(`lv-chunk-css-${name}`)?.remove();
            throw new Error(`lv chunk missing export: ${name}`);
        }
        return mod;
    })().catch((e) => {
        delete pending[name]; // 失败可重试（下次调用重新注入）
        throw e;
    }));
}

// vite define 注入（dev 模式亦有 define，无需运行时兜底）
declare const __LV_VERSION__: string;
