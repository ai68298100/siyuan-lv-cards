/**
 * 图片遮挡数据（M4·FR4，docs/14 §2 卡型契约的 riff 先行实现）。
 * 数据存块自定义属性 lv-occlusion；坐标为相对图片包围盒的归一化值（0-1）。
 * 局限（v1）：坐标绑定容器渲染宽度，图片宽高比变化会有偏差——AP 已记录，V2 后转 templateID 数据。
 */

export interface OcclusionRect {
    /** 0-1 归一化 */
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface OcclusionData {
    v: 1;
    rects: OcclusionRect[];
}

const ATTR_KEY = "lv-occlusion";

export function parseOcclusion(attrs: Record<string, string>): OcclusionData | null {
    const raw = attrs[ATTR_KEY];
    if (!raw) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.v === 1 && Array.isArray(parsed.rects) && parsed.rects.every(isValidOcclusionRect)) {
            return parsed as OcclusionData;
        }
    } catch {
        // 宽容解析
    }
    return null;
}

export function isValidOcclusionRect(value: unknown): value is OcclusionRect {
    if (!value || typeof value !== "object") return false;
    const rect = value as Partial<OcclusionRect>;
    const { x, y, w, h } = rect;
    return typeof x === "number" && typeof y === "number" && typeof w === "number" && typeof h === "number"
        && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(w) && Number.isFinite(h)
        && x >= 0 && y >= 0 && w > 0 && h > 0
        && x + w <= 1.000001 && y + h <= 1.000001;
}

export function serializeOcclusion(data: OcclusionData): Record<string, string> {
    return { [ATTR_KEY]: JSON.stringify(data) };
}

export function emptyOcclusion(): OcclusionData {
    return { v: 1, rects: [] };
}
