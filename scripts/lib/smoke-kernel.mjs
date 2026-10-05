// ============================================================
// 冒烟/e2e 共享件：目标解析 + 共享内核防呆 + 残留清扫
// （与 小驴考试 scripts/lib/smoke-kernel.mjs 同款约定，fa57d6a）
// 背景：本机思源内核常被多个插件项目和真实数据共用——
// 写型冒烟（建删笔记本/写块/建 riff 卡组）不应直打在用工作区：
//   - 其他插件的事件监听会对冒烟写入产生真实反应
//   - 并发索引放大 flakiness
//   - 开启同步的工作区会被临时库建删反复搅动
// 三层防护：
//   1) resolveTarget：SIYUAN_BASE_URL / SIYUAN_TOKEN（argv 优先），缺 token 即退出
//   2) sweepOrphans：清扫上次崩溃残留的临时笔记本（前缀注册表匹配，只删自己的）
//   3) guardScratch：目标内核存在非临时笔记本 → 拒跑；SIYUAN_E2E_ALLOW_SHARED=1 显式豁免
// 外发约定：凡向已配置 AI 模型真实发请求的检查步默认跳过，SIYUAN_E2E_AI=1 显式启用
//（本仓库当前冒烟无 AI 步，约定先行）。
// 运行约定详见 docs/34-真机验收清单.md 与 CONTRIBUTING.md。
// ============================================================

/** 本项目所有冒烟临时笔记本前缀（新脚本一律用 siyuan-lv-cards-smoke-；旧前缀保留供清扫） */
export const SCRATCH_PREFIXES = [
    "siyuan-lv-cards-smoke-",
    "e2e-isolated", // 旧版 e2e-isolated.mjs 的固定库名（2026-10-06 前缀约定之前）
];

export function isScratchName(name) {
    return SCRATCH_PREFIXES.some((p) => name.startsWith(p));
}

/** 失败退出：设置退出码后抛出（调用方捕获吞掉即可）——
 *  不用 process.exit：Node 24 Win 上带未决句柄的 process.exit 会触发 libuv 断言污染退出码 */
export class SmokeAbort extends Error {}
function abort(msg) {
    if (msg) console.error(msg);
    process.exitCode = 1;
    throw new SmokeAbort("smoke-abort");
}

/** 目标解析：argv > env > 默认端口；token 缺失即退出（绝不内置默认 token） */
export function resolveTarget({ baseArg, tokenArg } = {}) {
    const base = String(baseArg ?? process.env.SIYUAN_BASE_URL ?? "http://127.0.0.1:6806").replace(/\/+$/, "");
    const token = tokenArg ?? process.env.SIYUAN_TOKEN ?? "";
    if (!token) {
        abort("✗ 缺少思源 token：请传入参数或设置 SIYUAN_TOKEN；不会使用默认 token");
    }
    return { base, token };
}

/** 统一 api 调用器（非 2xx 或鉴权失败均抛错，401/403 给出可操作提示） */
export function makeApi(base, token) {
    return async function api(path, body) {
        const res = await fetch(base + path, {
            method: "POST",
            headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(body ?? {}),
        });
        if (res.status === 401 || res.status === 403) {
            throw new Error(`HTTP ${res.status}（token 被拒：请核对该实例 设置→关于 的 API token，即 SIYUAN_TOKEN）`);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        if (j?.code === -1 && /auth/i.test(String(j?.msg ?? ""))) {
            throw new Error(`鉴权失败（${j.msg}）：请核对 SIYUAN_TOKEN 是否为该实例 设置→关于 的 API token`);
        }
        return j;
    };
}

/** 思源建库 id 双形态（3.8.5 裸 id / 3.8.6 { notebook: { id } }） */
export function notebookIdOf(data) {
    return data?.notebook?.id ?? data?.notebook ?? data?.id ?? "";
}

async function listNotebooks(api) {
    const r = await api("/api/notebook/lsNotebooks", {});
    if (r.code !== 0) throw new Error(`lsNotebooks code=${r.code} ${r.msg}`);
    return r.data?.notebooks ?? [];
}

/** 清扫上次崩溃残留的临时笔记本（只动前缀注册表内的，绝不碰用户数据） */
export async function sweepOrphans(api) {
    const orphans = (await listNotebooks(api)).filter((n) => isScratchName(n.name));
    for (const n of orphans) {
        try {
            await api("/api/notebook/removeNotebook", { notebook: n.id });
            console.log(`  清扫残留临时库：${n.name}`);
        } catch (e) {
            console.log(`  ⚠ 残留清理失败（不影响本次运行）：${n.name} — ${String(e).slice(0, 60)}`);
        }
    }
}

/** 共享内核防呆：存在任何非冒烟前缀的笔记本即拒跑写型冒烟 */
export async function guardScratch(api, { base } = {}) {
    const notebooks = await listNotebooks(api);
    const foreign = notebooks.filter((n) => !isScratchName(n.name));
    if (!foreign.length) return;
    if (process.env.SIYUAN_E2E_ALLOW_SHARED === "1") {
        console.log(`  ⚠ SIYUAN_E2E_ALLOW_SHARED=1：在共享内核上直跑写型冒烟（${foreign.length} 个既有笔记本），临时库用后即清`);
        return;
    }
    console.error([
        `✗ 目标内核 ${base} 不是隔离靶场：存在 ${foreign.length} 个非冒烟笔记本（如「${foreign[0].name}」）。`,
        "  写型冒烟会建删笔记本并写入块/riff 卡组——与其他插件/真实数据共用的内核不宜直跑：",
        "    ① 推荐：不带 SIYUAN_BASE_URL 直接运行，脚本会自起隔离靶场（临时 workspace + 无头内核）；",
        "    ② 或确认风险后设 SIYUAN_E2E_ALLOW_SHARED=1 显式豁免（临时库自清理，脚本崩溃可能残留）。",
    ].join("\n"));
    abort();
}
