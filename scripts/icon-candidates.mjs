// 系列风格 icon 候选生成器（小驴闪卡）：复用 gen-icon.mjs 的纯 Node PNG 编码与 4x 超采样，
// 产出 3 个候选到 design/icon-candidates/，供用户挑选后固化进 gen-icon.mjs / icon.png。
//   A 闪卡闪电（紫蓝现品牌，白卡+渐变闪电镂空+系列橙点）
//   B 闪卡闪电（青绿新色相，系列内无占用）
//   C 星轨卡（violet→fuchsia，呼应 Starline 视觉系统）
// 用法：node scripts/icon-candidates.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SIZE = 160;
const SS = 4;
const N = SIZE * SS;

const lerp = (a, b, t) => a + (b - a) * t;
const inRoundedRect = (x, y, rx, ry, rw, rh, r) => {
    if (x < rx || x >= rx + rw || y < ry || y >= ry + rh) return false;
    const cx = Math.max(rx + r, Math.min(x, rx + rw - r));
    const cy = Math.max(ry + r, Math.min(y, ry + rh - r));
    const dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy <= r * r;
};
const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const inRing = (x, y, cx, cy, r, w) => {
    const d = (x - cx) ** 2 + (y - cy) ** 2;
    return d <= (r + w / 2) ** 2 && d >= (r - w / 2) ** 2;
};
const inPoly = (x, y, pts) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
};
const star = (cx, cy, r, waist = 0.26) => {
    const pts = [];
    for (let i = 0; i < 8; i++) {
        const ang = (Math.PI / 4) * i - Math.PI / 2;
        const rr = i % 2 === 0 ? r : r * waist;
        pts.push([cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)]);
    }
    return pts;
};
const BOLT = [[0.345, 0.30], [0.475, 0.30], [0.415, 0.455], [0.505, 0.455], [0.315, 0.735], [0.385, 0.535], [0.295, 0.535]];

const designs = {
    "A-bolt-violetblue": {
        grad: [[79, 107, 255], [139, 92, 246]],
        glyph(x, y, bgc) {
            if (inRoundedRect(x, y, N * 0.46, N * 0.14, N * 0.38, N * 0.40, N * 0.09)) return { alpha: 0.5 };
            if (inRoundedRect(x, y, N * 0.14, N * 0.24, N * 0.54, N * 0.56, N * 0.11)) {
                // 先判卡内镂空（渐变色闪电），再落白底
                if (inPoly(x, y, BOLT.map(([px, py]) => [px * N, py * N]))) return { color: bgc };
                return { color: [255, 255, 255] };
            }
            if (inCircle(x, y, N * 0.735, N * 0.70, N * 0.05)) return { color: [249, 115, 22] };
            return null;
        },
    },
    "B-bolt-teal": {
        grad: [[5, 150, 105], [20, 184, 166]],
        glyph(x, y, bgc) {
            if (inRoundedRect(x, y, N * 0.46, N * 0.14, N * 0.38, N * 0.40, N * 0.09)) return { alpha: 0.5 };
            if (inRoundedRect(x, y, N * 0.14, N * 0.24, N * 0.54, N * 0.56, N * 0.11)) {
                if (inPoly(x, y, BOLT.map(([px, py]) => [px * N, py * N]))) return { color: bgc };
                return { color: [255, 255, 255] };
            }
            if (inCircle(x, y, N * 0.735, N * 0.70, N * 0.05)) return { color: [249, 115, 22] };
            return null;
        },
    },
    "C-starline": {
        grad: [[124, 58, 237], [217, 70, 239]],
        glyph(x, y, bgc) {
            if (inRoundedRect(x, y, N * 0.46, N * 0.14, N * 0.38, N * 0.40, N * 0.09)) return { alpha: 0.5 };
            if (inRoundedRect(x, y, N * 0.14, N * 0.24, N * 0.54, N * 0.56, N * 0.11)) {
                // 星轨弧线（先画）+ 大小星形，均落在白卡上
                const cx = N * 0.30, cy = N * 0.60, r = N * 0.26;
                const ang = Math.atan2(y - cy, x - cx);
                if (inRing(x, y, cx, cy, r, N * 0.022) && ang >= (-72 * Math.PI) / 180 && ang <= (-12 * Math.PI) / 180) return { color: bgc };
                if (inPoly(x, y, star(N * 0.375, N * 0.44, N * 0.105))) return { color: bgc };
                if (inPoly(x, y, star(N * 0.535, N * 0.615, N * 0.048))) return { color: bgc };
                return { color: [255, 255, 255] };
            }
            if (inCircle(x, y, N * 0.735, N * 0.70, N * 0.05)) return { color: [249, 115, 22] };
            return null;
        },
    },
};

// ---- PNG 编码（同 gen-icon.mjs） ----
const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
const crc32 = (b) => {
    let c = 0xffffffff;
    for (const byte of b) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};
const encodePng = (out) => {
    const crcOf = (body) => { const c = Buffer.alloc(4); c.writeUInt32BE(crc32(body)); return c; };
    const mkChunk = (type, data) => {
        const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
        return Buffer.concat([len, Buffer.from(type, "ascii"), data, crcOf(Buffer.concat([Buffer.from(type, "ascii"), data]))]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4);
    ihdr[8] = 8; ihdr[9] = 6;
    const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
    for (let y = 0; y < SIZE; y++) {
        raw[y * (SIZE * 4 + 1)] = 0;
        out.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        mkChunk("IHDR", ihdr),
        mkChunk("IDAT", deflateSync(raw, { level: 9 })),
        mkChunk("IEND", Buffer.alloc(0)),
    ]);
};

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "design", "icon-candidates");
mkdirSync(outDir, { recursive: true });

for (const [name, { grad, glyph }] of Object.entries(designs)) {
    const buf = Buffer.alloc(N * N * 4);
    for (let py = 0; py < N; py++) {
        for (let px = 0; px < N; px++) {
            const x = px + 0.5, y = py + 0.5;
            const i = (py * N + px) * 4;
            if (!inRoundedRect(x, y, 0, 0, N, N, N * 0.225)) { buf[i + 3] = 0; continue; }
            const t = (x / N + y / N) / 2;
            const bgc = [Math.round(lerp(grad[0][0], grad[1][0], t)), Math.round(lerp(grad[0][1], grad[1][1], t)), Math.round(lerp(grad[0][2], grad[1][2], t))];
            let [r, g, b, a] = [bgc[0], bgc[1], bgc[2], 255];
            const hit = glyph(x, y, bgc);
            if (hit?.alpha != null) {
                r = Math.round(lerp(r, 255, hit.alpha)); g = Math.round(lerp(g, 255, hit.alpha)); b = Math.round(lerp(b, 255, hit.alpha));
            } else if (hit?.color) {
                [r, g, b] = hit.color;
            }
            buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
        }
    }
    // 4x → 1x
    const out = Buffer.alloc(SIZE * SIZE * 4);
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            let r = 0, g = 0, b = 0, al = 0;
            for (let dy = 0; dy < SS; dy++) {
                for (let dx = 0; dx < SS; dx++) {
                    const i = ((y * SS + dy) * N + (x * SS + dx)) * 4;
                    r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; al += buf[i + 3];
                }
            }
            const n = SS * SS, o = (y * SIZE + x) * 4;
            out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n); out[o + 3] = Math.round(al / n);
        }
    }
    const file = resolve(outDir, `${name}.png`);
    writeFileSync(file, encodePng(out));
    console.log(`candidate: ${file}`);
}
