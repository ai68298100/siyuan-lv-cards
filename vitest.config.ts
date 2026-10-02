import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// 测试配置（happy-dom + svelte 插件）：纯函数测试与 Svelte 组件挂载测试共用。
// 已知限制：依赖 siyuan 包的模块（api/siyuan.ts、api/flashcardV2.ts、api/ai.ts 网络路径、libs/dialog.ts）
// 在 node 条件下无法解析，且 vite 8 对裸包名的别名/optimizeDeps 绕过会启动崩溃（v0.101 实测）——
// 这些模块的测试策略是抽取零依赖纯逻辑到独立模块（ai-errors/ai-parse/v2-contract/kernel-response）后测纯逻辑。
export default defineConfig({
    plugins: [svelte()],
    resolve: {
        // 注意：vite 8 中 alias 必须用对象形式——数组形式（尤其含正则 find 的条目）
        // 会触发 optimizeDeps 启动崩溃（"reading length"，v0.101 实测）
        alias: {
            "@": resolve(import.meta.dirname, "src"),
        },
        // svelte 5 需 browser 条件才会编译客户端组件（否则 mount 不可用）
        conditions: ["browser"],
    },
    test: {
        environment: "happy-dom",
        include: ["tests/**/*.spec.ts"],
    },
});
