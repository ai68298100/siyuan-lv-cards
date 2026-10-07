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
        // CSS link 注入只验证节点/地址/幂等性；让 happy-dom 将禁用的外部加载视为成功，
        // 避免单测为不存在的 localhost:3000 资源创建网络请求和错误噪声。
        const settings = (window as any).happyDOM?.settings;
        if (settings) {
            settings.disableCSSFileLoading = true;
            settings.handleDisabledFileLoadingAsSuccess = true;
        }
    });

    it("onerror（失败事件）→ 拒绝、移除节点；重试路径可恢复", async () => {
        const loadChunk = await freshLoader();
        // 失败分支只需验证 loader 的 onerror/清理/重试语义；不让 happy-dom
        // 为这个故意失败的 script 真的触发外部资源加载。
        const appendChild = Node.prototype.appendChild;
        const appendSpy = vi.spyOn(document.head, "appendChild").mockImplementation(function (node) {
            if (node instanceof HTMLScriptElement && node.getAttribute("src")) {
                queueMicrotask(() => node.dispatchEvent(new Event("error")));
                return node;
            }
            return appendChild.call(this, node);
        });
        let err: Error;
        try {
            const promise = loadChunk("hub").catch(e => e);
            err = await promise as Error;
        } finally {
            appendSpy.mockRestore();
        }
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
        // 桌面端回归（v0.185.0 真机空白）：页面不在根路径（/stage/build/app/）时，
        // 相对 BASE 会解析成 stage 下的 404——BASE 必须根绝对，这里复现桌面端页面路径
        (window as any).happyDOM?.setURL?.("http://localhost:3000/stage/build/app/index.html");
        (window as any).__lvChunks = { review: { mount: () => ({ destroy() { /* noop */ } }) } };
        preinject("review");
        const mod = await loadChunk("review");
        expect(typeof mod.mount).toBe("function");
        const css = document.getElementById("lv-chunk-css-review") as HTMLLinkElement;
        expect(css).toBeTruthy();
        expect(css.href).toContain("/plugins/siyuan-lv-cards/chunks/review.css?v=");
        expect(css.href).toMatch(/\/plugins\//); // 根绝对：不得落在页面路径（/stage/…）下
        expect(css.href).not.toContain("/stage/build/app/plugins/");
        expect(css.rel).toBe("stylesheet");
    });

    it("注册表缺模块导出 → 明确报错（部署不完整可诊断）", async () => {
        const loadChunk = await freshLoader();
        (window as any).__lvChunks = {};
        preinject("review");
        const err = await loadChunk("review").catch(e => e);
        await flush();
        expect(err.message).toContain("missing export");
        // 缺注册表时清理旧 script，后续部署修复后可真正重新加载。
        expect(document.getElementById("lv-chunk-js-review")).toBeNull();
        (window as any).__lvChunks = { review: { mount: () => ({ destroy() { /* noop */ } }) } };
        preinject("review");
        expect(typeof (await loadChunk("review")).mount).toBe("function");
    });

    it("dialogs 形态（components 子表+挂载器）与 index.ts 消费一致", async () => {
        const loadChunk = await freshLoader();
        // v0.185.1 契约：dialogs chunk 注册 __lvChunks.dialogs = { components, mountDialogComponent }，
        // shell 按 m.components[compName] 取组件、m.mountDialogComponent 安装挂载器——三方必须同形
        (window as any).__lvChunks = {
            dialogs: {
                components: { AIWizard: {}, SettingsPanel: {} },
                mountDialogComponent: () => ({ destroy() { /* noop */ } }),
            },
        };
        preinject("dialogs");
        const m = await loadChunk("dialogs");
        expect(typeof m.mountDialogComponent).toBe("function");
        expect(m.components?.AIWizard).toBeTruthy();
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
