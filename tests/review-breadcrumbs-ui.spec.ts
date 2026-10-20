import { describe, expect, it } from "vitest";
import { parseHPathToBreadcrumbs } from "../src/core/review-breadcrumbs";

describe("BX-11 UI: Review Breadcrumbs Integration (复习卡面包屑集成)", () => {
    it("智能解析思源深层 hpath 为层级面包屑", () => {
        const hpath = "/计算机体系结构/第四章 存储系统/4.3 高速缓存 Cache/直接映射与组相联";
        const res = parseHPathToBreadcrumbs("block-101", hpath, { maxDisplayChars: 12, maxDepth: 3 });

        expect(res.cardId).toBe("block-101");
        expect(res.isTruncated).toBe(true);
        expect(res.nodes).toHaveLength(3);
        expect(res.nodes[0].displayTitle).toBe("计算机体系结构");
        expect(res.nodes[1].displayTitle).toBe("…"); // 中间层级折叠
        expect(res.nodes[2].displayTitle).toBe("直接映射与组相联");
        expect(res.formattedText).toBe("计算机体系结构 / … / 直接映射与组相联");
    });

    it("空 hpath 或根文档 hpath 优雅处理", () => {
        const emptyRes = parseHPathToBreadcrumbs("block-102", "");
        expect(emptyRes.nodes).toHaveLength(0);
        expect(emptyRes.formattedText).toBe("");

        const singleRes = parseHPathToBreadcrumbs("block-103", "/单个独立文档");
        expect(singleRes.nodes).toHaveLength(1);
        expect(singleRes.nodes[0].displayTitle).toBe("单个独立文档");
        expect(singleRes.isTruncated).toBe(false);
    });

    it("清洗带 Markdown 粗体与特殊字符的章节路径", () => {
        const dirtyPath = "/**高等数学**/第三章 **微分中值定理**/==洛必达法则==";
        const res = parseHPathToBreadcrumbs("block-104", dirtyPath);

        expect(res.nodes[0].displayTitle).toBe("高等数学");
        expect(res.nodes[1].displayTitle).toBe("第三章 微分中值定理");
        expect(res.nodes[2].displayTitle).toBe("洛必达法则");
    });
});
