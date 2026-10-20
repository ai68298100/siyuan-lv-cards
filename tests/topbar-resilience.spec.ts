import { describe, expect, it, beforeEach } from "vitest";

describe("Topbar Resilience & Self-Healing Contract (顶栏图标连通性与自愈)", () => {
    let addTopBarCalls: any[] = [];
    let removeTopBarCalls: any[] = [];
    let addedIcons: string[] = [];

    // 仿真的顶栏自愈控制器逻辑（使用真实 DOM 节点）
    class TopbarController {
        static readonly TOPBAR_ICON_ID = "topbar-lv-cards";
        topBarElement: HTMLElement | null = null;
        topBarContextMenuHandler: any = null;

        ensureIcons() {
            if (!document.getElementById("iconLvCards")) {
                addedIcons.push("iconLvCards");
                const symbol = document.createElement("div");
                symbol.id = "iconLvCards";
                document.body.appendChild(symbol);
            }
        }

        addTopBar(options: any): HTMLElement {
            addTopBarCalls.push(options);
            const el = document.createElement("div");
            el.className = "toolbar__item";
            el.dataset.id = options.id;
            document.body.appendChild(el);
            return el;
        }

        removeTopBar(id: string) {
            removeTopBarCalls.push(id);
        }

        showTopbarMenu(_evt: any) {}

        ensureTopBarElement(): HTMLElement | null {
            this.ensureIcons();

            if (this.topBarElement && this.topBarElement.isConnected && document.contains(this.topBarElement)) {
                return this.topBarElement;
            }

            try {
                if (this.topBarElement && this.topBarContextMenuHandler) {
                    this.topBarElement.removeEventListener("contextmenu", this.topBarContextMenuHandler);
                }

                this.topBarElement = this.addTopBar({
                    id: TopbarController.TOPBAR_ICON_ID,
                    icon: "iconLvCards",
                    title: "小驴闪卡",
                    position: "right",
                    callback: () => {},
                    contextMenu: () => {},
                });

                if (this.topBarElement) {
                    this.topBarElement.style.position = "relative";
                    this.topBarContextMenuHandler = (evt: any) => {
                        this.showTopbarMenu(evt);
                    };
                    this.topBarElement.addEventListener("contextmenu", this.topBarContextMenuHandler);
                }
            } catch (e) {
                // ignore
            }

            return this.topBarElement;
        }

        onunload() {
            if (this.topBarElement) {
                if (this.topBarContextMenuHandler) {
                    this.topBarElement.removeEventListener("contextmenu", this.topBarContextMenuHandler);
                    this.topBarContextMenuHandler = null;
                }
                this.removeTopBar(TopbarController.TOPBAR_ICON_ID);
                this.topBarElement = null;
            }
        }
    }

    beforeEach(() => {
        addTopBarCalls = [];
        removeTopBarCalls = [];
        addedIcons = [];
        document.body.innerHTML = "";
    });

    it("初始挂载：带唯一 ID 注册顶栏条目并自动确保 iconLvCards 存在", () => {
        const controller = new TopbarController();
        const el = controller.ensureTopBarElement();

        expect(el).not.toBeNull();
        expect(addTopBarCalls).toHaveLength(1);
        expect(addTopBarCalls[0].id).toBe("topbar-lv-cards");
        expect(addTopBarCalls[0].position).toBe("right");
        expect(addedIcons).toContain("iconLvCards");
    });

    it("自愈重挂载：当宿主重构顶栏导致原有 DOM 元素断连 (isConnected: false) 时自动恢复挂载", () => {
        const controller = new TopbarController();
        const el1 = controller.ensureTopBarElement();
        expect(addTopBarCalls).toHaveLength(1);
        expect(el1?.isConnected).toBe(true);

        // 模拟思源宿主清空或重绘顶栏（元素被从 DOM 移除）
        el1?.remove();
        expect(el1?.isConnected).toBe(false);

        // 再次调用（例如在心跳或角标刷新时）
        const el2 = controller.ensureTopBarElement();
        expect(el2).not.toBeNull();
        // 验证自动触发了自愈重新挂载！
        expect(addTopBarCalls).toHaveLength(2);
        expect(addTopBarCalls[1].id).toBe("topbar-lv-cards");
        expect(el2).not.toBe(el1);
        expect(el2?.isConnected).toBe(true);
    });

    it("元素在 DOM 正常连接时复用现有引用，不重复调用 addTopBar", () => {
        const controller = new TopbarController();
        const el1 = controller.ensureTopBarElement();
        const el2 = controller.ensureTopBarElement();
        const el3 = controller.ensureTopBarElement();

        expect(addTopBarCalls).toHaveLength(1);
        expect(el2).toBe(el1);
        expect(el3).toBe(el1);
    });

    it("插件卸载时安全移除顶栏并释放事件监听", () => {
        const controller = new TopbarController();
        controller.ensureTopBarElement();
        expect(controller.topBarElement).not.toBeNull();

        controller.onunload();
        expect(removeTopBarCalls).toContain("topbar-lv-cards");
        expect(controller.topBarElement).toBeNull();
    });
});

describe("Data Reload Echo Suppression Contract (数据重载回音抑制)", () => {
    it("判定逻辑：过滤无关笔记文件与最近主动写入的本地回音", () => {
        const storageLastWrite: Record<string, number> = {};
        const now = 10000;

        // 辅助函数仿真 onDataChanged 决策逻辑
        function shouldReload(files: unknown, currentTime: number): boolean {
            if (files === "sync") return true;

            const raw = Array.isArray(files) ? files : (files as any)?.files;
            if (!raw || !Array.isArray(raw)) return false;

            const fileStrings: string[] = raw.filter((f): f is string => typeof f === "string");
            if (fileStrings.length === 0) return false;

            const related = fileStrings.filter(f => {
                const norm = f.replace(/\\/g, "/").toLowerCase();
                return norm.includes("/storage/petal/siyuan-lv-cards/") || norm.includes("storage/petal/siyuan-lv-cards/");
            });

            if (related.length === 0) return false;

            // 回音抑制
            const allEchoes = related.every(f => {
                const filename = f.split("/").pop() ?? f;
                const lastLocalWrite = storageLastWrite[filename] ?? 0;
                return currentTime - lastLocalWrite < 3000;
            });

            if (allEchoes) return false;

            return true;
        }

        // 1. 无关笔记保存事件 -> 坚决不重载
        expect(shouldReload(["/data/notes/math.sy"], now)).toBe(false);
        expect(shouldReload({ files: ["20261020-doc.sy"] }, now)).toBe(false);
        expect(shouldReload(undefined, now)).toBe(false);

        // 2. 本地刚刚写完 revlog.json (在 1000ms 前写入) -> 命中回音抑制，不重载
        storageLastWrite["revlog.json"] = now - 1000;
        expect(shouldReload(["/storage/petal/siyuan-lv-cards/revlog.json"], now)).toBe(false);

        // 3. 超过 3000ms 或是外部其它前端/多窗口修改了 revlog.json -> 允许重载
        storageLastWrite["revlog.json"] = now - 5000;
        expect(shouldReload(["/storage/petal/siyuan-lv-cards/revlog.json"], now)).toBe(true);

        // 4. 显式 sync 事件 -> 允许重载
        expect(shouldReload("sync", now)).toBe(true);
    });
});
