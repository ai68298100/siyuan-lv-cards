import { describe, expect, it } from "vitest";
import { friendlyError } from "../src/api/errors";

describe("friendlyError（内核错误码 → 用户文案，327）", () => {
    const hints = { ec404: "内容不存在或已被删除", ec500: "内核内部错误" };

    it("命中错误码返回 i18n 提示", () => {
        expect(friendlyError(new Error("kernel error (code=404)"), hints)).toBe("内容不存在或已被删除");
        expect(friendlyError(new Error("AI HTTP 500"), hints)).toBe("内核内部错误");
    });

    it("未命中码/无 hints 原样透传", () => {
        expect(friendlyError(new Error("plain failure"), hints)).toBe("plain failure");
        expect(friendlyError(new Error("kernel error (code=404)"))).toBe("kernel error (code=404)");
        expect(friendlyError(new Error("kernel error (code=418)"), hints)).toBe("kernel error (code=418)");
    });

    it("非 Error 值字符串化", () => {
        expect(friendlyError("boom", hints)).toBe("boom");
        expect(friendlyError(undefined, hints)).toBe("");
    });
});
