export function estimateStringTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

/**
 * Estimate the rendered footprint of an observation line as it appears in
 * summaries / pool listings: "[id] YYYY-MM-DD HH:MM [relevance] content".
 * Pool budgets that only count bare content undercount every line's
 * metadata overhead (id + timestamp + relevance tags), so the configured
 * pool target was reached later than the rendered memory actually allowed.
 */
export function observationLineTokenCount(observation: {
	id: string;
	timestamp: string;
	relevance: string;
	content: string;
}): number {
	return estimateStringTokens(
		`[${observation.id}] ${observation.timestamp} [${observation.relevance}] ${observation.content}`,
	);
}

/**
 * Rough char/4 estimate of the model-facing footprint of one session event,
 * used for raw (fallback) consolidation progress. Only surface message events
 * count; log-only events contribute nothing.
 */
export function estimateEventTokens(event: { type: string; data: unknown }): number {
	const data = event.data as Record<string, unknown> | undefined;
	if (!data || typeof data !== "object") return 0;
	const message = (data as { message?: unknown }).message ?? (event.type === "user/message" ? data : undefined);
	if (!message || typeof message !== "object") return 0;
	const content = (message as { content?: unknown }).content;
	if (!Array.isArray(content)) return 0;
	let total = 0;
	for (const block of content) {
		if (!block || typeof block !== "object") continue;
		const type = (block as { type?: string }).type;
		if (type === "text") {
			const text = (block as { text?: unknown }).text;
			if (typeof text === "string") total += estimateStringTokens(text);
			continue;
		}
		if (type === "tool-result") {
			const nested = (block as { content?: unknown }).content;
			if (!Array.isArray(nested)) continue;
			for (const nestedBlock of nested) {
				if (nestedBlock && typeof nestedBlock === "object" && (nestedBlock as { type?: string }).type === "text") {
					const text = (nestedBlock as { text?: unknown }).text;
					if (typeof text === "string") total += estimateStringTokens(text);
				}
			}
		}
	}
	return total;
}
