import { readdirSync, readFileSync, statSync } from "node:fs";

const tokenProperties = new Set([
    "color", "background", "background-color", "border-color",
    "font-size", "line-height", "font-weight", "gap", "row-gap", "column-gap",
    "padding", "padding-block", "padding-inline", "padding-top", "padding-right", "padding-bottom", "padding-left",
    "margin", "margin-block", "margin-inline", "margin-top", "margin-right", "margin-bottom", "margin-left",
    "border-radius", "box-shadow", "z-index", "transition", "animation", "outline",
]);

function walk(directory) {
    return readdirSync(directory).flatMap((name) => {
        const path = `${directory}/${name}`;
        return statSync(path).isDirectory()
            ? walk(path)
            : path.endsWith(".svelte") ? [path] : [];
    });
}

const files = ["src/index.scss", ...walk("src/ui")];
const declarations = [];
for (const file of files) {
    const source = readFileSync(file, "utf8");
    const styles = file.endsWith(".svelte")
        ? [...source.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g)].map((match) => match[1])
        : [source];
    for (const style of styles) {
        const clean = style.replace(/\/\*[\s\S]*?\*\//g, "");
        for (const match of clean.matchAll(/(?:^|[;{}])\s*([a-z-]+)\s*:\s*([^;{}]+)\s*;?/gim)) {
            const property = match[1].toLowerCase();
            if (!tokenProperties.has(property)) continue;
            const value = match[2].trim();
            // Host theme variables are part of the shared semantic palette.
            // Count them together with plugin tokens so the before/after
            // measurement does not penalize existing theme-aware styles.
            declarations.push({ file, property, value, tokenized: /var\(\s*--(?:lv|b3)-/.test(value) });
        }
    }
}

const groups = new Map();
for (const declaration of declarations) {
    const group = groups.get(declaration.property) ?? { total: 0, tokenized: 0, values: new Map() };
    group.total++;
    group.tokenized += Number(declaration.tokenized);
    group.values.set(declaration.value, (group.values.get(declaration.value) ?? 0) + 1);
    groups.set(declaration.property, group);
}

const summary = Object.fromEntries([...groups].sort(([a], [b]) => a.localeCompare(b)).map(([property, group]) => [property, {
    declarations: group.total,
    tokenized: group.tokenized,
    coveragePercent: Number((100 * group.tokenized / group.total).toFixed(1)),
    distinctValues: group.values.size,
    literalValues: [...group.values.entries()].filter(([value]) => !/var\(\s*--(?:lv|b3)-/.test(value)).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count),
}]));

console.log(JSON.stringify({ files: files.length, declarations: declarations.length, tokenized: declarations.filter((item) => item.tokenized).length, coveragePercent: Number((100 * declarations.filter((item) => item.tokenized).length / declarations.length).toFixed(1)), summary }, null, 2));
