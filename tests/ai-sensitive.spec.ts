import { describe, expect, it } from "vitest";
import { SENSITIVE_PATTERNS, scanSensitive, maskSensitive, isCnProductIdValid } from "../src/core/ai-sensitive";

// BU-8 敏感内容识别：命中只回打码样本；脱敏后复扫清零；身份证校验位降误报
describe("ai-sensitive（BU-8）", () => {
    it("模式表自洽：id 唯一、全局标志、无锚点死模式", () => {
        const ids = SENSITIVE_PATTERNS.map(p => p.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const p of SENSITIVE_PATTERNS) {
            expect(p.pattern.flags).toContain("g");
            expect(p.pattern.source.includes("^$")).toBe(false);
        }
    });

    it("密钥类：assignment/openai/github/aws/私钥块/JWT 各自命中且样本打码", () => {
        const text = [
            "password: hunter2secret",
            "apiKey=sk-abcdefghijklmnopqrstuvwx",
            "token ghp_abcdefghijklmnopqrstuvwxyz012345",
            "key AKIAIOSFODNN7EXAMPLE",
            "-----BEGIN RSA PRIVATE KEY-----",
            "auth eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.SflKxwRJSMeKKF2QT4",
        ].join("\n");
        const hits = scanSensitive(text);
        const ids = hits.map(h => h.id);
        expect(ids).toContain("secret-assignment");
        expect(ids).toContain("openai-key");
        expect(ids).toContain("github-token");
        expect(ids).toContain("aws-key");
        expect(ids).toContain("private-key-block");
        expect(ids).toContain("jwt");
        for (const h of hits) {
            expect(h.sample.endsWith("***")).toBe(true);
            expect(h.sample.length).toBeLessThanOrEqual(27); // 24 截断 + ***
        }
    });

    it("联系方式：手机号与邮箱命中；样本不回显完整原文", () => {
        const hits = scanSensitive("联系 13812345678 或 mail me at someone@example.com");
        const ids = hits.map(h => h.id);
        expect(ids).toContain("cn-mobile");
        expect(ids).toContain("email");
        const mob = hits.find(h => h.id === "cn-mobile")!;
        expect(mob.sample).not.toBe("13812345678");
        expect(mob.sample.startsWith("13812345")).toBe(true);
    });

    it("身份证：校验位合法才命中；普通 18 位数字（订单/时间戳）不误报", () => {
        // 合法校验位样例（GB 11643 国标推导）
        expect(isCnProductIdValid("11010519491231002X")).toBe(true);
        expect(scanSensitive("证件号 11010519491231002X 请核对").map(h => h.id)).toContain("cn-id");
        // 校验位不合法 → 不命中
        expect(isCnProductIdValid("110105194912310021")).toBe(false);
        expect(scanSensitive("订单 110105194912310021 已发货").map(h => h.id)).not.toContain("cn-id");
    });

    it("自定义敏感词：大小写不敏感命中，id 带 custom: 前缀", () => {
        const hits = scanSensitive("项目代号 ProjectBlue 保密", ["projectblue"]);
        expect(hits.map(h => h.id)).toContain("custom:projectblue");
        expect(hits.find(h => h.id.startsWith("custom:"))!.count).toBe(1);
    });

    it("无命中回空数组；空文本安全", () => {
        expect(scanSensitive("今天天气不错，适合复习闪卡")).toEqual([]);
        expect(scanSensitive("")).toEqual([]);
        expect(scanSensitive("", ["term"])).toEqual([]);
    });

    it("脱敏：命中替换为占位符、复扫清零、非法校验位数字保持原样", () => {
        const src = "password: hunter2secret，邮箱 a@b.com，单号 110105194912310021";
        const r = maskSensitive(src, []);
        expect(r.masked).toContain("【已脱敏·secret-assignment】");
        expect(r.masked).toContain("【已脱敏·email】");
        expect(r.masked).toContain("110105194912310021"); // 非法 ID 不动
        expect(r.hits).toEqual([]); // 脱敏后复扫清零
        expect(r.masked).not.toContain("hunter2secret");
        expect(r.masked).not.toContain("a@b.com");
    });

    it("脱敏：自定义词同步替换", () => {
        const r = maskSensitive("代号 ProjectBlue 相关", ["projectblue"]);
        expect(r.masked).toContain("【已脱敏·自定义】");
        expect(r.masked.toLowerCase()).not.toContain("projectblue");
    });
});
