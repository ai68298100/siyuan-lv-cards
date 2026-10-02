import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// 组件测试专用配置（happy-dom + svelte 插件）：
// 纯函数测试（tests/*.spec.ts）不依赖此配置也能跑；本配置让 vitest 同时能挂载 Svelte 组件。
export default defineConfig({
    plugins: [svelte()],
    resolve: {
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
