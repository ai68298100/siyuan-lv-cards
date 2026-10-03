// 一次性构建变体：单文件内联（inlineDynamicImports），用于真机加载兼容性验证。
// 不进正线门禁；产物输出 dist-inline/，仅 index.js + index.css 有意义。
import { resolve } from "path";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
    resolve: { alias: { "@": resolve(import.meta.dirname, "src") } },
    plugins: [svelte()],
    define: {
        "process.env.DEV_MODE": JSON.stringify("false"),
        "process.env.NODE_ENV": JSON.stringify("production"),
    },
    build: {
        outDir: "dist-inline",
        emptyOutDir: true,
        minify: true,
        sourcemap: false,
        lib: {
            entry: resolve(import.meta.dirname, "src/index.ts"),
            fileName: () => "index.js",
            cssFileName: "index",
            formats: ["cjs"],
        },
        rollupOptions: {
            external: ["siyuan", "process"],
            output: { inlineDynamicImports: true },
        },
    },
});
