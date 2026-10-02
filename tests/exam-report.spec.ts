import { describe, expect, it } from "vitest";
import { examReportStats, type ExamPlan } from "../src/core/exam";

const DAY = 86400000;
const NOW = 1_800_000_000_000;

const plan = (over: Partial<ExamPlan> = {}): ExamPlan => ({
    id: "p1",
    name: "期末",
    examDate: "2027-06-15",
    scopeKind: "all",
    scopeId: "",
    scopeName: "全部",
    cramDays: 7,
    enabled: true,
    createdAt: NOW - 10 * DAY,
    ...over,
});

const e = (daysAgo: number, rating: number, deckID = "", blockID = "") => ({
    ts: NOW - daysAgo * DAY,
    rating,
    deckID,
    blockID,
});

describe("examReportStats（AR-11 考试报告口径）", () => {
    it("时间窗 = 计划创建以来：窗口前的复习不计入", () => {
        const p = plan(); // createdAt = 10 天前
        const s = examReportStats(p, [e(30, 3), e(20, 3), e(5, 3), e(2, 1)], { now: NOW });
        expect(s.reviews).toBe(2);
        expect(s.forgets).toBe(1);
        expect(s.windowFrom).toBe(p.createdAt);
        expect(s.hasData).toBe(true);
    });

    it("deck 范围按 deckID 过滤；缺 deckID 的原生记录进 unattributed", () => {
        const p = plan({ scopeKind: "deck", scopeId: "deck-A", scopeName: "A 卡组" });
        const s = examReportStats(p, [
            e(5, 3, "deck-A"),
            e(4, 3, "deck-B"),   // 其他卡组：不计
            e(3, 1, ""),          // 缺卡组信息：unattributed
            e(2, 2, "deck-A"),
        ], { now: NOW });
        expect(s.reviews).toBe(2);
        expect(s.unattributed).toBe(1);
    });

    it("notebook/all 由调用方注入 inScope 谓词", () => {
        const p = plan({ scopeKind: "notebook", scopeId: "nb1", scopeName: "笔记1" });
        const inScope = (x: { blockID?: string }) => x.blockID === "b1";
        const s = examReportStats(p, [e(5, 3, "", "b1"), e(4, 3, "", "b2")], { now: NOW, inScope });
        expect(s.reviews).toBe(1);
    });

    it("两个计划窗口交错：各自只统计自己创建后的记录", () => {
        const p1 = plan({ id: "p1", createdAt: NOW - 30 * DAY });
        const p2 = plan({ id: "p2", createdAt: NOW - 3 * DAY });
        const entries = [e(20, 3), e(10, 3), e(2, 3), e(1, 3)];
        expect(examReportStats(p1, entries, { now: NOW }).reviews).toBe(4);
        expect(examReportStats(p2, entries, { now: NOW }).reviews).toBe(2);
    });

    it("缺失历史：窗口内无任何记录时 hasData=false（报告须声明而非计 0）", () => {
        const p = plan({ createdAt: NOW - 10 * DAY });
        const s = examReportStats(p, [e(30, 3)], { now: NOW });
        expect(s.hasData).toBe(false);
        expect(s.reviews).toBe(0);
    });
});
