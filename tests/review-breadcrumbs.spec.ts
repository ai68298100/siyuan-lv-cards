import { describe, expect, it } from "vitest";
import {
    cleanTitleText,
    resolveReviewBreadcrumbs,
    truncateBreadcrumbTitle,
} from "../src/core/review-breadcrumbs";
import enJson from "../public/i18n/en.json";
import zhJson from "../public/i18n/zh-CN.json";

describe("BX-11: Review Context Breadcrumbs (复习来源层级面包屑)", () => {
    it("标题 Markdown 与 HTML 格式清洗 (cleanTitleText)", () => {
        expect(cleanTitleText("## **第3章** 树与二叉树")).toBe("## 第3章 树与二叉树");
        expect(cleanTitleText("概念：==重要考点== 与 `核心算法`")).toBe("概念：重要考点 与 核心算法");
        expect(cleanTitleText("<span style='color:red;'>警告</span> [链接](siyuan://blocks/123)")).toBe("警告 链接");
        expect(cleanTitleText("   多余   空白    文本   ")).toBe("多余 空白 文本");
    });

    it("标题紧凑截断 (truncateBreadcrumbTitle)", () => {
        expect(truncateBreadcrumbTitle("短标题", 10)).toBe("短标题");
        expect(truncateBreadcrumbTitle("这是一个特别长特别长的大纲文档标题名称", 8)).toBe("这是一个特别长…");
        expect(truncateBreadcrumbTitle("", 8)).toBe("");
        expect(truncateBreadcrumbTitle("**粗体**超长标题文本测试案例", 6)).toBe("粗体超长标…");
    });

    it("正常组装三级层级面包屑链条", () => {
        const res = resolveReviewBreadcrumbs({
            cardId: "card-101",
            notebookName: "计算机科学",
            docTitle: "数据结构与算法",
            docId: "doc-20261020",
            ancestorHeadings: [
                { id: "h-1", title: "第 3 章 树与二叉树" },
            ],
            maxDisplayChars: 12,
        });

        expect(res.cardId).toBe("card-101");
        expect(res.nodes).toHaveLength(3);
        expect(res.nodes[0].type).toBe("notebook");
        expect(res.nodes[0].fullTitle).toBe("计算机科学");
        expect(res.nodes[1].type).toBe("doc");
        expect(res.nodes[1].targetId).toBe("doc-20261020");
        expect(res.nodes[2].type).toBe("heading");
        expect(res.nodes[2].fullTitle).toBe("第 3 章 树与二叉树");
        expect(res.formattedText).toBe("计算机科学 / 数据结构与算法 / 第 3 章 树与二叉树");
        expect(res.isTruncated).toBe(false);
    });

    it("层级过深时自动中间省略折叠 (isTruncated: true)，深度为 3", () => {
        const res = resolveReviewBreadcrumbs({
            cardId: "card-102",
            notebookName: "医学综合",
            docTitle: "人体解剖学",
            ancestorHeadings: [
                { id: "h-1", title: "第一篇 运动系统" },
                { id: "h-2", title: "第二章 骨连接" },
                { id: "h-3", title: "第三节 脊柱的连接与韧带" },
            ],
            maxDepth: 3, // 限制最大 3 层
        });

        expect(res.isTruncated).toBe(true);
        expect(res.nodes).toHaveLength(3);
        expect(res.nodes[0].fullTitle).toBe("医学综合"); // 保留首节点
        expect(res.nodes[1].displayTitle).toBe("…");     // 中间折叠为省略号
        expect(res.nodes[2].fullTitle).toBe("第三节 脊柱的连接与韧带"); // 保留末节点
        expect(res.formattedText).toContain("…");
    });

    it("层级过深时自动中间省略折叠，深度为 4 时自适应保留前两级", () => {
        const res = resolveReviewBreadcrumbs({
            cardId: "card-102-depth4",
            notebookName: "医学综合",
            docTitle: "人体解剖学",
            ancestorHeadings: [
                { id: "h-1", title: "第一篇 运动系统" },
                { id: "h-2", title: "第二章 骨连接" },
                { id: "h-3", title: "第三节 脊柱的连接与韧带" },
            ],
            maxDepth: 4, // 允许 4 层
        });

        expect(res.isTruncated).toBe(true);
        expect(res.nodes).toHaveLength(4);
        expect(res.nodes[0].fullTitle).toBe("医学综合");
        expect(res.nodes[1].fullTitle).toBe("人体解剖学");
        expect(res.nodes[2].displayTitle).toBe("…");
        expect(res.nodes[3].fullTitle).toBe("第三节 脊柱的连接与韧带");
    });

    it("缺失笔记本或父级标题时优雅退化", () => {
        const res = resolveReviewBreadcrumbs({
            cardId: "card-103",
            docTitle: "独立快速卡片文档",
            docId: "doc-quick-1",
        });

        expect(res.nodes).toHaveLength(1);
        expect(res.nodes[0].type).toBe("doc");
        expect(res.formattedText).toBe("独立快速卡片文档");
        expect(res.isTruncated).toBe(false);
    });

    it("全空参数安全防御，不抛异常", () => {
        const res = resolveReviewBreadcrumbs({
            cardId: "card-empty",
        });

        expect(res.cardId).toBe("card-empty");
        expect(res.nodes).toEqual([]);
        expect(res.formattedText).toBe("");
        expect(res.isTruncated).toBe(false);
    });

    it("双语 i18n 字典已完整覆盖复习面包屑文案", () => {
        expect(zhJson.reviewBreadcrumbs.tooltip).toBe("点击回源查看完整层级上下文");
        expect(zhJson.reviewBreadcrumbs.ellipsis).toBe("中间层级已折叠");
        expect(enJson.reviewBreadcrumbs.tooltip).toContain("hierarchical context");
        expect(enJson.reviewBreadcrumbs.ellipsis).toContain("collapsed");
    });
});
