import { describe, expect, it } from "vitest";
import { parseOcclusion, serializeOcclusion, emptyOcclusion } from "../src/core/occlusion";

describe("occlusion 数据契约（M4·FR4）", () => {
    const valid = { v: 1 as const, rects: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }] };

    it("serialize→parse 往返一致", () => {
        const attrs = serializeOcclusion(valid);
        expect(attrs["lv-occlusion"]).toBeTruthy();
        expect(parseOcclusion(attrs)).toEqual(valid);
    });

    it("缺属性/空串/坏 JSON/错版本/rects 非数组 → null（宽容不抛错）", () => {
        expect(parseOcclusion({})).toBeNull();
        expect(parseOcclusion({ "lv-occlusion": "" })).toBeNull();
        expect(parseOcclusion({ "lv-occlusion": "{not json" })).toBeNull();
        expect(parseOcclusion({ "lv-occlusion": JSON.stringify({ v: 2, rects: [] }) })).toBeNull();
        expect(parseOcclusion({ "lv-occlusion": JSON.stringify({ v: 1, rects: "x" }) })).toBeNull();
        expect(parseOcclusion({ "lv-occlusion": "null" })).toBeNull();
    });

    it("emptyOcclusion 序列化后可解析回空 rects", () => {
        const back = parseOcclusion(serializeOcclusion(emptyOcclusion()));
        expect(back).toEqual({ v: 1, rects: [] });
    });

    it("多框数据保留顺序与坐标", () => {
        const data = { v: 1 as const, rects: [{ x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.25, h: 0.25 }] };
        expect(parseOcclusion(serializeOcclusion(data))).toEqual(data);
    });
});
