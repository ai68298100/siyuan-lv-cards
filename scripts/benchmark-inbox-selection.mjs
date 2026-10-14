import { performance } from "node:perf_hooks";

const SAMPLE_COUNT = 9;
const WARMUP_COUNT = 3;
let sink = 0;

function median(values) {
    return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
}

function measure(operation) {
    for (let i = 0; i < WARMUP_COUNT; i++) sink ^= Number(operation());
    const samples = [];
    for (let i = 0; i < SAMPLE_COUNT; i++) {
        const start = performance.now();
        sink ^= Number(operation());
        samples.push(performance.now() - start);
    }
    return Number(median(samples).toFixed(3));
}

const results = [5_000, 10_000].map((count) => {
    const rows = Array.from({ length: count }, (_, index) => ({ id: String(index) }));
    const checked = rows.map((row) => row.id);
    const includesScan = () => rows.every((row) => checked.includes(row.id));
    const setScan = () => {
        const checkedSet = new Set(checked);
        return rows.every((row) => checkedSet.has(row.id));
    };

    return {
        count,
        includesMs: measure(includesScan),
        setBuildAndScanMs: measure(setScan),
    };
});

console.log(JSON.stringify({ node: process.version, sampleCount: SAMPLE_COUNT, warmupCount: WARMUP_COUNT, results }, null, 2));
