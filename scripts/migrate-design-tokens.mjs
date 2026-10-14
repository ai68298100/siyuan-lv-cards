import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const ROOT = "src";
const numericProperties = new Set(["font-size", "line-height", "font-weight"]);
const spacingProperties = new Set([
    "gap", "row-gap", "column-gap", "padding", "padding-block", "padding-inline",
    "padding-top", "padding-right", "padding-bottom", "padding-left",
    "margin", "margin-block", "margin-inline", "margin-top", "margin-right", "margin-bottom", "margin-left",
]);
const colorProperties = new Set([
    "color", "background", "background-color", "border-color", "outline-color",
    "border", "border-top", "border-right", "border-bottom", "border-left",
    "outline", "fill", "stroke", "accent-color",
]);
const declarationProperties = new Set([
    ...numericProperties, ...spacingProperties, ...colorProperties,
    "border-radius", "box-shadow", "z-index", "animation", "transition", "outline",
]);
const themeColors = new Map([
    ["--b3-theme-primary", "--lv-color-brand"],
    ["--b3-theme-on-primary", "--lv-color-on-brand"],
    ["--b3-theme-on-background", "--lv-color-text"],
    ["--b3-theme-on-surface", "--lv-color-text-muted"],
    ["--b3-theme-background", "--lv-color-canvas"],
    ["--b3-theme-background-light", "--lv-color-canvas-subtle"],
    ["--b3-theme-surface", "--lv-color-surface"],
    ["--b3-theme-error", "--lv-color-danger"],
    ["--b3-theme-warning", "--lv-color-warning"],
    ["--b3-theme-success", "--lv-color-success"],
]);
const radii = new Map([
    ["2", "--lv-r-track"], ["3", "--lv-r-optical"], ["4", "--lv-r-xs"],
    ["5", "--lv-r-tag"], ["6", "--lv-r-compact"], ["8", "--lv-r-s"],
    ["9", "--lv-r-notice"], ["10", "--lv-r-control"],
    ["12", "--lv-r-m"], ["16", "--lv-r-l"], ["20", "--lv-r-dialog"], ["999", "--lv-r-pill"],
]);
const weights = new Map([
    ["400", "--lv-fw-normal"], ["500", "--lv-fw-medium"], ["550", "--lv-fw-emphasis"],
    ["600", "--lv-fw-semibold"], ["650", "--lv-fw-heading"], ["700", "--lv-fw-bold"],
]);

function walk(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = `${directory}/${entry.name}`;
        if (entry.isDirectory()) return walk(path);
        return path.endsWith(".svelte") || path.endsWith(".scss") ? [path] : [];
    });
}

function fontToken(property, value) {
    if (property === "font-weight") return weights.get(value);
    if (property === "line-height") {
        const lineHeights = new Map([
            ["1", "--lv-lh-tight"], ["1.1", "--lv-lh-icon"],
            ["1.35", "--lv-lh-title"], ["1.4", "--lv-lh-body"],
            ["1.45", "--lv-lh-reading-tight"], ["1.5", "--lv-lh-meta"],
            ["1.6", "--lv-lh-reading"],
            ["1.7", "--lv-lh-relaxed"], ["1.8", "--lv-lh-loose"],
            ["1.95", "--lv-lh-reading-loose"],
            ["15px", "--lv-lh-control"], ["20px", "--lv-lh-control-lg"],
        ]);
        return lineHeights.get(value);
    }
    if (property === "font-size") {
        const sizes = new Map([
            ["10px", "--lv-type-caption-size"],
            ["11px", "--lv-type-meta-size"], ["12px", "--lv-type-control-size"],
            ["13px", "--lv-type-body-size"], ["16px", "--lv-type-title-size"],
            ["18px", "--lv-type-section-size"], ["20px", "--lv-type-heading-size"],
            ["24px", "--lv-type-display-size"], ["28px", "--lv-type-hero-size"],
            ["32px", "--lv-type-hero-lg-size"], ["0.9em", "--lv-type-fluid-size"],
            ["9px", "--lv-type-micro-size"], ["14px", "--lv-type-body-sm-size"],
            ["15px", "--lv-type-label-size"], ["17px", "--lv-type-title-lg-size"],
            ["19px", "--lv-type-section-lg-size"], ["22px", "--lv-type-page-size"],
            ["29px", "--lv-type-metric-size"],
        ]);
        return sizes.get(value);
    }
    return undefined;
}

function spacingToken(value) {
    const match = value.match(/^(-?)(\d+)px$/);
    if (!match) return undefined;
    const [, sign, raw] = match;
    const px = Number(raw);
    if (px === 0) return "0";
    if (px === 1) return sign ? "calc(var(--lv-space-hairline) * -1)" : "var(--lv-space-hairline)";
    const token = px % 2 === 0
        ? `calc(var(--lv-space-unit) * ${px / 2})`
        : `calc(var(--lv-space-unit) * ${(px - 1) / 2} + var(--lv-space-hairline))`;
    return sign ? `calc((${token}) * -1)` : token;
}

function transformValue(property, value) {
    if (numericProperties.has(property)) {
        const token = fontToken(property, value.trim());
        if (token) return `var(${token})`;
    }
    if (spacingProperties.has(property)) {
        return value.replace(/(?<![-\w.])(-?\d+px)\b/g, (raw) => spacingToken(raw) ?? raw);
    }
    if (property === "border-radius") {
        return value.replace(/(?<![-\w.])(\d+)(px|%)(?![\w.])/g, (raw, number, unit) => {
            if (unit === "%" && number === "50") return "var(--lv-r-circle)";
            if (unit !== "px") return raw;
            const token = radii.get(number);
            return token ? `var(${token})` : raw;
        });
    }
    if (property === "z-index") {
        const token = ({
            "0": "--lv-z-base", "1": "--lv-z-card-control", "10": "--lv-z-review-peek",
            "11": "--lv-z-review-help", "40": "--lv-z-host-overlay", "300": "--lv-z-drawer",
            "301": "--lv-z-drawer-content",
        })[value.trim()];
        if (token) return `var(${token})`;
    }
    if (colorProperties.has(property)) {
        if (property === "background" || property === "background-color") {
            value = value.replace(/color-mix\(in srgb, var\(--b3-theme-on-background\) 4%, transparent\)/g, "var(--lv-surface-hover)");
        }
        for (const [source, target] of themeColors) {
            value = value.replaceAll(`var(${source})`, `var(${target})`);
        }
    }
    if (property === "box-shadow") {
        value = value.replace("0 8px 28px color-mix(in srgb, black 5%, transparent)", "var(--lv-shadow-review-card)");
    }
    if (property === "animation") {
        value = value.replace(/\b1\.2s\b/g, "var(--lv-dur-shimmer)");
    }
    return value;
}

function transformDeclarations(source) {
    // Require a declaration boundary so pseudo selectors such as :hover and
    // :global(...) are never mistaken for CSS properties.
    return source.replace(/(^|[;{}\n])(\s*)([a-z][a-z-]*)\s*:\s*([^;{}]+)(;?)/gim, (whole, prefix, indent, rawProperty, rawValue, semicolon) => {
        const property = rawProperty.toLowerCase();
        // A selector can also appear at the beginning of a line (for example
        // `tr:last-child`). Only rewrite properties whose semantics are part
        // of this migration; leave every other declaration/selector byte for
        // byte intact.
        if (!declarationProperties.has(property)) return whole;
        const value = transformValue(property, rawValue);
        return `${prefix}${indent}${rawProperty}: ${value}${semicolon}`;
    });
}

function transformStyles(source) {
    let updated = source.replace(/\/\*[\s\S]*?\*\//g, (comment) => `\u0000${Buffer.from(comment).toString("base64")}\u0000`);
    // Keep Svelte style attributes (for example `global`/`module`) intact while
    // only rewriting the declaration body.  The previous implementation
    // replaced `<style global>` with a plain `<style>`, which changed scoping.
    updated = updated.replace(/<style(\s[^>]*)?>([\s\S]*?)<\/style>/g, (_, attributes = "", css) => `<style${attributes}>${transformDeclarations(css)}</style>`);
    updated = updated.replace(/style="([^"]*)"/g, (_, css) => `style="${transformDeclarations(css)}"`);
    updated = updated.replace(/style=\{`([^`]*?)`\}/gs, (_, css) => `style={\`${transformDeclarations(css)}\`}`);
    return updated.replace(/\u0000([A-Za-z0-9+/=]+)\u0000/g, (_, encoded) => Buffer.from(encoded, "base64").toString("utf8"));
}

for (const path of walk(ROOT)) {
    const original = readFileSync(path, "utf8");
    let updated = original;
    if (path.endsWith(".scss")) {
        const [tokens, shared = ""] = original.split("// ---- 共享组件类 ----");
        // index.scss is already a stylesheet (without a Svelte <style> tag),
        // so apply the declaration transformer directly to the shared block.
        updated = `${tokens}// ---- 共享组件类 ----${transformDeclarations(shared)}`;
    } else {
        updated = transformStyles(original);
    }
    if (updated !== original) writeFileSync(path, updated);
}
