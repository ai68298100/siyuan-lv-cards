import { describe, expect, it, vi, beforeEach } from "vitest";

// AT-17：chunk 加载器（script 标签 + window.__lvChunks 注册表）。
// happy-dom 会真实尝试加载 script src 并同步触发 onerror（"JavaScript file loading
// is disabled"）——onerror 分支用这个真实行为测；onload 分支用「预插同 id 元素」短路
// （加载器对已存在 id 幂等直通），聚焦注册表读取/css 注入/缓存语义。
const flush = () => new Promise(r => setTimeout(r, 0));

const freshLoader = async () =>
    (await import("../src/libs/chunk-loader")).loadChunk as (n: "hub" | "review") => Promise<any>;

/** 预插 script 占位（无 src 不触发加载）→ 加载器视为已注入，直通 resolve */
function preinject(name: string): void {
    const s = document.createElement("script");
    s.id = `lv-chunk-js-${name}`;
    document.head.appendChild(s);
}

describe("chunk-loader（AT-17）", () => {
    beforeEach(() => {
        vi.resetModules();
        document.head.innerHTML = "";
        (window as any).__lvChunks = undefined;
    });

    it("onerror（真实加载失败）→ 拒绝、移除节点；重试路径可恢复", async () => {
        const loadChunk = await freshLoader();
        const promise = loadChunk("hub").catch(e => e);
        const err = await promise as Error;
        expect(err.message).toContain("chunk load failed");
        expect(document.getElementById("lv-chunk-js-hub")).toBeNull();
        // 重试：预插占位 + 注册表就位 → 成功
        (window as any).__lvChunks = { hub: { mount: () => ({ destroy() { /* noop */ } }) } };
        preinject("hub");
        const mod = await loadChunk("hub");
        expect(typeof mod.mount).toBe("function");
    });

    it("onload 路径：返回注册表条目并注入带版本号的 css link", async () => {
        const loadChunk = await freshLoader();
        (window as any).__lvChunks = { review: { mount: () => ({ destroy() { /* noop */ } }) } };
        preinject("review");
        const mod = await loadChunk("review");
        expect(typeof mod.mount).toBe("function");
        const css = document.getElementById("lv-chunk-css-review") as HTMLLinkElement;
        expect(css).toBeTruthy();
        expect(css.href).toContain("/plugins/siyuan-lv-cards/chunks/review.css?v=");
        expect(css.rel).toBe("stylesheet");
    });

    it("注册表缺模块导出 → 明确报错（部署不完整可诊断）", async () => {
        const loadChunk = await freshLoader();
        (window as any).__lvChunks = {};
        preinject("review");
        const err = await loadChunk("review").catch(e => e);
        await flush();
        expect(err.message).toContain("missing export");
    });

    it("dialogs 形态（组件注册表+挂载器）可整包返回", async () => {
        const loadChunk = await freshLoader();
        (window as any).__lvChunks = {
            dialogs: {
                AIWizard: {}, SettingsPanel: {},
                mountDialogComponent: () => ({ destroy() { /* noop */ } }),
            },
        };
        preinject("dialogs");
        const m = await loadChunk("dialogs");
        expect(typeof m.mountDialogComponent).toBe("function");
        expect(m.AIWizard).toBeTruthy();
    });

    it("注册表整体缺失 → 同样可诊断报错", async () => {
        const loadChunk = await freshLoader();
        preinject("hub");
        const err = await loadChunk("hub").catch(e => e);
        expect(err.message).toContain("missing export");
    });

    it("同 chunk 二次调用幂等：不重复注入 css（pending 缓存命中）", async () => {
        const loadChunk = await freshLoader();
        (window as any).__lvChunks = { hub: { mount: () => ({ destroy() { /* noop */ } }) } };
        preinject("hub");
        await loadChunk("hub");
        await loadChunk("hub");
        expect(document.querySelectorAll("#lv-chunk-css-hub")).toHaveLength(1);
        expect(document.querySelectorAll("#lv-chunk-js-hub")).toHaveLength(1);
    });
});
