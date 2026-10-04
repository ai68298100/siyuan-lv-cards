import { existsSync, readFileSync } from "node:fs";
import { resolve } from "path";
import { defineConfig, type Plugin } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import zipPack from "vite-plugin-zip-pack";
import fg from "fast-glob";

import vitePluginYamlI18n from "./yaml-plugin.js";
import { useLiveReload } from "./scripts/siyuan_live_reload.js";

const env = process.env;
const isSrcmap = env.VITE_SOURCEMAP === "inline";
const isDev = env.NODE_ENV === "development";
const buildTarget = env.VITE_BUILD_TARGET === "kernel" ? "kernel" : "app";
// AT-17（v0.158.0）：UI chunk 构建模式——VITE_CHUNK=hub|review 时产出独立 IIFE
// （window.__lvChunks 注册表 + siyuan 走 __lvSiyuan 全局），主包经 script 标签加载
// （思源移动端加载器同款机制，无 eval/CSP 依赖）；未设置时为主包构建。
const chunkTarget = ["hub", "review"].includes(env.VITE_CHUNK ?? "") ? env.VITE_CHUNK : "";

const outputDir = isDev ? "dev" : "dist";
const pluginManifest = JSON.parse(readFileSync(resolve(import.meta.dirname, "plugin.json"), "utf8"));
const packageImageTargets = [
    ["icon", "icon.png"],
    ["preview", "preview.png"],
].flatMap(([field, legacyName]) => {
    const fileName = pluginManifest[field] || (existsSync(legacyName) ? legacyName : "");
    return fileName ? [{ src: `./${fileName}`, dest: "./" }] : [];
});
console.log("isDev=>", isDev);
console.log("isSrcmap=>", isSrcmap);
console.log("outputDir=>", outputDir);
console.log("buildTarget=>", buildTarget);

export default defineConfig(buildTarget === "kernel" ? {
    build: {
        outDir: outputDir,
        emptyOutDir: false,
        minify: true,
        sourcemap: isSrcmap ? "inline" : false,

        lib: {
            entry: resolve(import.meta.dirname, "src/kernel.ts"),
            name: "KernelPluginSample",
            fileName: () => "kernel.js",
            formats: ["iife"],
        },
        rollupOptions: {
            plugins: isDev ? [
                watchExternalFiles(["src/kernel.ts"])
            ] : [
                cleanupDistFiles({
                    patterns: ["i18n/*.yaml", "i18n/*.md"],
                    distDir: outputDir
                }),
                zipPack({
                    inDir: "./dist",
                    outDir: "./",
                    outFileName: "package.zip"
                })
            ],

            external: [],

            output: {
                entryFileNames: "kernel.js",
            },
        },
    }
} : chunkTarget ? {
    // AT-17：UI chunk 构建——独立 IIFE 自带 svelte（避免与主包 svelte 实例双份内部状态
    // 造成 split-brain），siyuan 走 shell 注入的 __lvSiyuan 全局；CSS 平铺到 chunks/
    resolve: {
        alias: {
            "@": resolve(import.meta.dirname, "src"),
        }
    },
    plugins: [svelte()],
    define: {
        "process.env.DEV_MODE": JSON.stringify(isDev),
        "process.env.NODE_ENV": JSON.stringify(env.NODE_ENV),
        "__LV_VERSION__": JSON.stringify(pluginManifest.version),
    },
    build: {
        outDir: outputDir,
        emptyOutDir: false,
        minify: true,
        sourcemap: isSrcmap ? "inline" : false,
        lib: {
            entry: resolve(import.meta.dirname, `src/chunks/${chunkTarget}.ts`),
            name: `lvChunk_${chunkTarget}`,
            fileName: () => `chunks/${chunkTarget}.js`,
            formats: ["iife"],
            cssFileName: chunkTarget,
        },
        rollupOptions: {
            external: ["siyuan", "process"],
            output: {
                entryFileNames: `chunks/${chunkTarget}.js`,
                assetFileNames: (assetInfo) => assetInfo.name?.endsWith(".css") ? `chunks/${chunkTarget}[extname]` : (assetInfo.name ?? "asset"),
                globals: { siyuan: "__lvSiyuan", process: "process" },
            },
        },
    },
} : {
    resolve: {
        alias: {
            "@": resolve(import.meta.dirname, "src"),
        }
    },

    plugins: [
        svelte(),

        vitePluginYamlI18n({
            inDir: "public/i18n",
            outDir: `${outputDir}/i18n`
        }),

        viteStaticCopy({
            targets: [
                ...packageImageTargets,
                { src: "./README*.md", dest: "./" },
                // A-06 决策（v0.103）：发布包仅随用户向文档（FAQ/上手指南/术语表/许可证/隐私），
                // 内部调研与治理文档经 GitHub 仓库获取；新增用户向文档时在此追加
                // 注意：显式文件目标（非通配）才会平铺到 dest；通配形式会产生 docs/docs 嵌套
                { src: "./docs/20-*.md", dest: "./docs", rename: { stripBase: true } },
                { src: "./docs/21-*.md", dest: "./docs", rename: { stripBase: true } },
                { src: "./docs/22-*.md", dest: "./docs", rename: { stripBase: true } },
                { src: "./docs/23-*.md", dest: "./docs", rename: { stripBase: true } },
                { src: "./docs/P*.md", dest: "./docs", rename: { stripBase: true } },
                { src: "./asset/*", dest: "./asset", rename: { stripBase: true } },
                { src: "./plugin.json", dest: "./" },
            ],
        }),
    ],

    define: {
        "process.env.DEV_MODE": JSON.stringify(isDev),
        "process.env.NODE_ENV": JSON.stringify(env.NODE_ENV),
        "__LV_VERSION__": JSON.stringify(pluginManifest.version),
    },

    build: {
        outDir: outputDir,
        emptyOutDir: false,
        // AT-15 实测定案（v0.151.0）：terser（含 toplevel mangle + drop_console）98.41KB，
        // 不敌 esbuild 96.97KB——本代码库 esbuild 压缩率更优，维持 esbuild
        minify: true,
        sourcemap: isSrcmap ? "inline" : false,

        lib: {
            entry: resolve(import.meta.dirname, "src/index.ts"),
            fileName: () => "index.js",
            cssFileName: "index",
            formats: ["cjs"],
        },
        rollupOptions: {
            plugins: isDev ? [
                useLiveReload({ outputDir }),
                watchExternalFiles([
                    "public/i18n/**",
                    "./README*.md",
                    "./docs/*.md",
                    "./plugin.json"
                ])
            ] : [],

            external: ["siyuan", "process"],

            output: {
                // AT-12（v0.125.0）：单文件内联——3.8.6 插件 require shim 将相对 chunk require
                // 原样透传 Electron Node require（以应用包为基准解析），多分包构建必然加载失败
                // （本插件/官方 install-package/siyuan-home/siyuan-exam 多插件实证，docs/34 E2E-1 发现 1）。
                // 代价：主包体积上升（懒加载失效），以可靠性优先；体积预算与回降手段见 AT-14。
                inlineDynamicImports: true,
                entryFileNames: "[name].js",
                assetFileNames: (assetInfo) => assetInfo.name ?? "asset",
            },
        },
    }
});

function watchExternalFiles(patterns: string[]): Plugin {
    return {
        name: "watch-external",
        async buildStart() {
            const files = await fg(patterns);
            for (const file of files) {
                this.addWatchFile(file);
            }
        }
    };
}

/**
 * Clean up some dist files after compiled
 * @author frostime
 * @param options:
 * @returns
 */
function cleanupDistFiles(options: { patterns: string[], distDir: string }): Plugin {
    const {
        patterns,
        distDir
    } = options;

    return {
        name: "rollup-plugin-cleanup",
        enforce: "post",
        writeBundle: {
            sequential: true,
            order: "post" as "post",
            async handler() {
                const fg = await import("fast-glob");
                const fs = await import("fs");
                // const path = await import('path');

                // Use glob syntax so nested translation files are included.
                const distPatterns = patterns.map(pat => `${distDir}/${pat}`);
                console.debug("Cleanup searching patterns:", distPatterns);

                const files = await fg.default(distPatterns, {
                    dot: true,
                    absolute: true,
                    onlyFiles: false
                });

                // console.info('Files to be cleaned up:', files);

                for (const file of files) {
                    try {
                        if (fs.default.existsSync(file)) {
                            const stat = fs.default.statSync(file);
                            if (stat.isDirectory()) {
                                fs.default.rmSync(file, { recursive: true });
                            } else {
                                fs.default.unlinkSync(file);
                            }
                            console.log(`Cleaned up: ${file}`);
                        }
                    } catch (error) {
                        console.error(`Failed to clean up ${file}:`, error);
                    }
                }
            }
        }
    };
}
