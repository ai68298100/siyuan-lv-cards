// 生成品牌 icon.png（默认 1024×1024）：渐变圆角底 + 白卡闪电（用户选定 A 方案语言的精修版）。
// 系列语言：渐变圆角方底 + 单一白色简形 + 点缀橙点（2026-10-05 用户从 A/B/C 候选中选定 A）。
// 本版（v0.208.0 图标提质）：
//   - 默认输出 1024×1024（集市与社交场景高清源），4x 超采样抗锯齿
//   - 对角渐变 #4F6BFF → #8B5CF6 叠左上径向提亮（纵深）
//   - 内缘 1 条白色发丝环（精致感）；后卡透明度 0.55（浅色背景分离度）；橙点带高光
// 纯 Node 实现 PNG 编码（zlib deflate + CRC32），无任何外部依赖。
// 用法：node scripts/gen-icon.mjs [输出路径=icon.png] [尺寸=1024]
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const SIZE = Number(process.argv[3] ?? 1024);
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
const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const inPoly = (x, y, pts) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
};

const lerp = (a, b, t) => a + (b - a) * t;
const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));

// 背景：对角渐变 #4F6BFF → #8B5CF6，叠加左上径向提亮（+10%，中心 0.18/0.14，半径 0.75）
const bg = (x, y) => {
    const t = (x / N + y / N) / 2;
    let r = lerp(79, 139, t), g = lerp(107, 92, t), b = lerp(255, 246, t);
    const dx = x / N - 0.18, dy = y / N - 0.14;
    const d = Math.sqrt(dx * dx + dy * dy);
    const hl = Math.max(0, 1 - d / 0.75) * 0.10;
    return [r + hl * 255, g + hl * 255, b + hl * 255];
};

// 前后卡与闪电镂空、点缀橙点（比例相对 N）
const cardBack = (x, y) => inRoundedRect(x, y, N * 0.46, N * 0.14, N * 0.38, N * 0.40, N * 0.09);
const cardFront = (x, y) => inRoundedRect(x, y, N * 0.14, N * 0.24, N * 0.54, N * 0.56, N * 0.11);
const BOLT = [[0.345, 0.30], [0.475, 0.30], [0.415, 0.455], [0.505, 0.455], [0.315, 0.735], [0.385, 0.535], [0.295, 0.535]];
const inBolt = (x, y) => inPoly(x, y, BOLT.map(([px, py]) => [px * N, py * N]));
const inDot = (x, y) => inCircle(x, y, N * 0.735, N * 0.70, N * 0.05);
const inDotHi = (x, y) => inCircle(x, y, N * 0.718, N * 0.682, N * 0.016);
// 内缘发丝环：沿圆角方内缩 1.1%，环宽 0.45%，白色 16%
const inHairline = (x, y) => {
    const inset = N * 0.011, w = N * 0.0045;
    const outer = inRoundedRect(x, y, inset, inset, N - inset * 2, N - inset * 2, N * 0.21);
    const inner = inRoundedRect(x, y, inset + w, inset + w, N - (inset + w) * 2, N - (inset + w) * 2, N * (0.21 - w / N));
    return outer && !inner;
};

const buf = Buffer.alloc(N * N * 4);

for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
        const x = px + 0.5, y = py + 0.5;
        let r = 0, g = 0, b = 0, a = 255;

        if (inRoundedRect(x, y, 0, 0, N, N, N * 0.225)) {
            [r, g, b] = bg(x, y);
            if (inHairline(x, y)) {
                r = lerp(r, 255, 0.16); g = lerp(g, 255, 0.16); b = lerp(b, 255, 0.16);
            }
            // 层序与候选一致：后卡（半透明白）先判，前卡白底上做闪电镂空，卡外橙点
            if (cardBack(x, y)) {
                r = lerp(r, 255, 0.55); g = lerp(g, 255, 0.55); b = lerp(b, 255, 0.55);
            } else if (cardFront(x, y)) {
                if (!inBolt(x, y)) {
                    r = 255; g = 255; b = 255;
                }
            } else if (inDot(x, y)) {
                if (inDotHi(x, y)) {
                    r = 255; g = 180; b = 120; // 高光点
                } else {
                    r = 249; g = 115; b = 22; // #F97316
                }
            }
        } else {
            a = 0; // 圆角外透明
        }
        const i = (py * N + px) * 4;
        buf[i] = clamp255(r); buf[i + 1] = clamp255(g); buf[i + 2] = clamp255(b); buf[i + 3] = a;
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
