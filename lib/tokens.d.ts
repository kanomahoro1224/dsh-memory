export declare function estimateStringTokens(text: string): number;
/**
 * Estimate the rendered footprint of an observation line as it appears in
 * summaries / pool listings: "[id] YYYY-MM-DD HH:MM [relevance] content".
 * Pool budgets that only count bare content undercount every line's
 * metadata overhead (id + timestamp + relevance tags), so the configured
 * pool target was reached later than the rendered memory actually allowed.
 */
export declare function observationLineTokenCount(observation: {
    id: string;
    timestamp: string;
    relevance: string;
    content: string;
}): number;
/**
 * Rough char/4 estimate of the model-facing footprint of one session event,
 * used for raw (fallback) consolidation progress. Only surface message events
 * count; log-only events contribute nothing.
 */
export declare function estimateEventTokens(event: {
    type: string;
    data: unknown;
}): number;
