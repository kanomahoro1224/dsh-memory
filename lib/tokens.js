export function estimateStringTokens(text) {
    return Math.ceil(text.length / 4);
}
/**
 * Estimate the rendered footprint of an observation line as it appears in
 * summaries / pool listings: "[id] YYYY-MM-DD HH:MM [relevance] content".
 * Pool budgets that only count bare content undercount every line's
 * metadata overhead (id + timestamp + relevance tags), so the configured
 * pool target was reached later than the rendered memory actually allowed.
 */
export function observationLineTokenCount(observation) {
    return estimateStringTokens(`[${observation.id}] ${observation.timestamp} [${observation.relevance}] ${observation.content}`);
}
/**
 * Rough char/4 estimate of the model-facing footprint of one session event,
 * used for raw (fallback) consolidation progress. Only surface message events
 * count; log-only events contribute nothing.
 */
export function estimateEventTokens(event) {
    const data = event.data;
    if (!data || typeof data !== "object")
        return 0;
    const message = data.message ?? (event.type === "user/message" ? data : undefined);
    if (!message || typeof message !== "object")
        return 0;
    const content = message.content;
    if (!Array.isArray(content))
        return 0;
    let total = 0;
    for (const block of content) {
        if (!block || typeof block !== "object")
            continue;
        const type = block.type;
        if (type === "text") {
            const text = block.text;
            if (typeof text === "string")
                total += estimateStringTokens(text);
            continue;
        }
        if (type === "tool-result") {
            const nested = block.content;
            if (!Array.isArray(nested))
                continue;
            for (const nestedBlock of nested) {
                if (nestedBlock && typeof nestedBlock === "object" && nestedBlock.type === "text") {
                    const text = nestedBlock.text;
                    if (typeof text === "string")
                        total += estimateStringTokens(text);
                }
            }
        }
    }
    return total;
}
//# sourceMappingURL=tokens.js.map