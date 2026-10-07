/**
 * Run read-only chunk queries with a bounded amount of concurrency.
 *
 * Results are returned in input order even when a later chunk completes first.
 * Keeping the order makes callers that fold rows into Maps retain the same
 * last-write-wins behavior as the previous sequential implementation.
 */
export async function mapChunksOrdered<TChunk, TResult>(
    chunks: readonly TChunk[],
    query: (chunk: TChunk, index: number) => Promise<TResult>,
    concurrency = 3,
): Promise<TResult[]> {
    if (chunks.length === 0) return [];

    const limit = Math.max(1, Math.min(chunks.length, Math.floor(concurrency) || 1));
    const results = new Array<TResult>(chunks.length);
    let nextIndex = 0;

    const worker = async (): Promise<void> => {
        while (true) {
            const index = nextIndex++;
            if (index >= chunks.length) return;
            results[index] = await query(chunks[index], index);
        }
    };

    await Promise.all(Array.from({ length: limit }, () => worker()));
    return results;
}
