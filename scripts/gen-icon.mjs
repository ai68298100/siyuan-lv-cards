// 生成品牌 icon.png（160×160）：渐变圆角底 + 双卡片图形。
// 纯 Node 实现 PNG 编码（zlib deflate + CRC32），4x 超采样抗锯齿。
// 用法：node scripts/gen-icon.mjs [输出路径=icon.png]
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const SIZE = 160;
const SS = 4; // 超采样倍数
const N = SIZE * SS;

// ---- 几何工具（超采样坐标系） ----
const inRoundedRect = (x, y, rx, ry, rw, rh, r) => {
    if (x < rx || x >= rx + rw || y < ry || y >= ry + rh) return false;
    const cx = Math.max(rx + r, Math.min(x, rx + rw - r));
    const cy = Math.max(ry + r, Math.min(y, ry + rh - r));
    const dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy <= r * r;
};

const lerp = (a, b, t) => a + (b - a) * t;

// 背景：对角渐变 #4F6BFF → #8B5CF6
const bg = (x, y) => {
    const t = (x / N + y / N) / 2;
    return [Math.round(lerp(79, 139, t)), Math.round(lerp(107, 92, t)), Math.round(lerp(255, 246, t))];
};

// 圆角卡片区域与描边（白色系）
const cardBack = (x, y) => inRoundedRect(x, y, N * 0.38, N * 0.16, N * 0.44, N * 0.58, N * 0.10);
const cardFront = (x, y) => inRoundedRect(x, y, N * 0.18, N * 0.28, N * 0.46, N * 0.58, N * 0.10);
const slotRows = [0.46, 0.57, 0.68]; // 前卡三条信息槽（相对 N）
const inSlot = (x, y, r) => inRoundedRect(x, y, N * 0.28, N * r, N * (r === 0.68 ? 0.18 : 0.26), N * 0.045, N * 0.022);

const buf = Buffer.alloc(N * N * 4);

for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
        const x = px + 0.5, y = py + 0.5;
        let r = 0, g = 0, b = 0, a = 255;

        if (inRoundedRect(x, y, 0, 0, N, N, N * 0.225)) {
            [r, g, b] = bg(x, y);
            // 后卡（半透明白）
            if (cardBack(x, y)) {
                const w = 0.62 * 255;
                r = Math.round(lerp(r, 255, 0.62)); g = Math.round(lerp(g, 255, 0.62)); b = Math.round(lerp(b, 255, 0.62));
            }
            // 前卡（纯白 + 轻投影色）
            if (cardFront(x, y)) {
                r = 255; g = 255; b = 255;
                // 三条信息槽：蓝紫渐变色
                for (const row of slotRows) {
                    if (inSlot(x, y, row)) {
                        const t = (row - 0.46) / 0.22;
                        r = Math.round(lerp(79, 139, t));
                        g = Math.round(lerp(107, 92, t));
                        b = Math.round(lerp(255, 246, t));
                    }
                }
            }
        } else {
            a = 0; // 圆角外透明
        }
        const i = (py * N + px) * 4;
        buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
    }
}

// ---- 4x 超采样降采样 → SIZE×SIZE ----
const out = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let dy = 0; dy < SS; dy++) {
            for (let dx = 0; dx < SS; dx++) {
                const i = ((y * SS + dy) * N + (x * SS + dx)) * 4;
                r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; a += buf[i + 3];
            }
        }
        const n = SS * SS;
        const o = (y * SIZE + x) * 4;
        out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n); out[o + 3] = Math.round(a / n);
    }
}

// ---- PNG 编码 ----
const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
const crc32 = (buf2) => {
    let c = 0xffffffff;
    for (const byte of buf2) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
    raw[y * (SIZE * 4 + 1)] = 0; // filter: none
    out.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
]);

const outPath = process.argv[2] ?? "icon.png";
writeFileSync(outPath, png);
console.log(`icon written: ${outPath} (${png.length} bytes, ${SIZE}x${SIZE} RGBA)`);
