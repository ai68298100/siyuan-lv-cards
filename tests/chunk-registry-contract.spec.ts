import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * AT-17 chunk 注册契约（v0.185.1 真机空白回归门禁，源文件级）：
 * loader 以 window.__lvChunks[name] 取模块，chunk 必须按键合并注册——
 * v0.158.0~v0.185.0 三个 chunk 均整表覆盖 window.__lvChunks = {…}，
 * __lvChunks.hub/.review/.dialogs 恒为 undefined，生产页签必空白（dev 走进程内导入不暴露）。
 * 构建产物的真实执行验证在 scripts/smoke-dist.mjs（build 链尾）。
 */
const read = (p: string) => readFileSync(resolve(import.meta.dirname, "..", p), "utf8");

describe("AT-17 chunk 注册契约", () => {
    it.each(["hub", "review", "dialogs"])("%s：按键合并注册，禁止整表覆盖", (name) => {
        const src = read(`src/chunks/${name}.ts`);
        expect(src).toMatch(/__lvChunks\s*\?\?=\s*\{\s*\}/);
        expect(src).toMatch(new RegExp(`__lvChunks\\s*\\?\\?=\\s*\\{\\s*\\}\\s*\\)\\s*\\.\\s*${name}\\s*=`));
        // 整表覆盖赋值（注册表失配的根因形态）
        expect(src).not.toMatch(/__lvChunks\s*=\s*\{/);
    });

    it("dialogs 注册 components 子表（shell loadDialogsComp 消费形态）", () => {
        const src = read("src/chunks/dialogs.ts");
        expect(src).toMatch(/components\s*:\s*\{/);
        expect(src).toMatch(/mountDialogComponent\s*[,}]/);
    });

    it("chunk-loader BASE 为根绝对路径（桌面端页面不在根路径）", () => {
        expect(read("src/libs/chunk-loader.ts")).toMatch(/BASE\s*=\s*`\/plugins\//);
    });

    it("shell 两个页签挂载点都有失败兜底（静默空白回归）", () => {
        const src = read("src/index.ts");
        expect(src).toMatch(/loadHubMount\(\)\.then[\s\S]*?\.catch/);
        expect(src).toMatch(/loadReviewMount\(\)\.then[\s\S]*?\.catch/);
        expect(src).toMatch(/mountChunkFallback/);
    });

    it("工作台按钮回调使用插件实例（避免 init 的 this 指向页签对象）", () => {
        const src = read("src/index.ts");
        expect(src).toMatch(/openWizard:\s*\(\)\s*=>\s*plugin\.openAIWizard\(\)/);
        expect(src).toMatch(/openDrill:\s*\(\)\s*=>\s*plugin\.openRepairDrill\(\)/);
        expect(src).not.toMatch(/openWizard:\s*\(\)\s*=>\s*this\.openAIWizard\(\)/);
        expect(src).not.toMatch(/openDrill:\s*\(\)\s*=>\s*this\.openRepairDrill\(\)/);
    });

    it("卡片详情版本回调使用插件实例（避免保存/接受操作丢失）", () => {
        const src = read("src/index.ts");
        const managerVersionCtx = src.match(/saveBlockContent:[\s\S]*?acceptContentAt:[\s\S]*?\n\s*},\n\s*exam:/)?.[0] ?? "";
        expect(src).toMatch(/plugin\.contentVersions\s*=\s*appendVersion\(plugin\.contentVersions/);
        expect(src).toMatch(/plugin\.persist\.save\(CONTENT_VERSIONS_DATA, plugin\.contentVersions\)/);
        expect(src).toMatch(/contentVersionsOf:\s*\(blockID: string\) => versionsOf\(plugin\.contentVersions, blockID\)/);
        expect(src).toMatch(/plugin\.contentVersions\s*=\s*acceptVersion\(plugin\.contentVersions/);
        expect(managerVersionCtx).not.toMatch(/this\.contentVersions|this\.persist/);
    });
});
