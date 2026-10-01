/**
 * 复习日志 CSV 导入解析（M10·FR1）：与 revlogToCsv 导出格式对齐。
 * 列：date,ts,cardID,deckID,blockID,rating,source（带引号转义容错）。
 */

export interface CsvRow {
    ts: number;
    cardID: string;
    deckID: string;
    blockID: string;
    rating: number;
    source: "native" | "plugin";
}

export function parseRevlogCsv(text: string): { entries: CsvRow[] } {
    const lines = text.replace(/^\ufeff/, "").split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) {
        throw new Error("empty csv");
    }
    // 简单 CSV 分行（引号内逗号不切分）
    const splitLine = (line: string): string[] => {
        const out: string[] = [];
        let cur = "";
        let inQ = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else { inQ = !inQ; }
            } else if (ch === "," && !inQ) {
                out.push(cur); cur = "";
            } else {
                cur += ch;
            }
        }
        out.push(cur);
        return out;
    };
    const header = splitLine(lines[0]).map(h => h.trim());
    const idx = (name: string) => header.indexOf(name);
    const iTs = idx("ts"), iCard = idx("cardID"), iDeck = idx("deckID"), iBlock = idx("blockID"), iRating = idx("rating"), iSource = idx("source");
    if (iTs < 0 || iCard < 0 || iRating < 0) {
        throw new Error("csv missing ts/cardID/rating columns");
    }
    const entries: CsvRow[] = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = splitLine(lines[i]);
        const ts = Number(cols[iTs]);
        const cardID = (cols[iCard] ?? "").trim();
        const rating = Number(cols[iRating]);
        if (!Number.isFinite(ts) || !cardID || !Number.isInteger(rating) || rating < 0 || rating > 4) {
            continue;
        }
        entries.push({
            ts,
            cardID,
            deckID: iDeck >= 0 ? (cols[iDeck] ?? "").trim() : "",
            blockID: iBlock >= 0 ? (cols[iBlock] ?? "").trim() : "",
            rating,
            source: iSource >= 0 && cols[iSource] === "native" ? "native" : "plugin",
        });
    }
    return { entries };
}
