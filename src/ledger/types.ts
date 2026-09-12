/**
 * Observational-memory ledger vocabulary, adapted from the pi extension to
 * DeepSeek Harness. The ledger is an append-only record log persisted by the
 * plugin (see ./store.ts); coverage anchors are session event seqs
 * (`coversUpToSeq`) instead of pi's custom-entry ids.
 */

export const OM_OBSERVATIONS_RECORDED = "om/observations/recorded";
export const OM_REFLECTIONS_RECORDED = "om/reflections/recorded";
export const OM_OBSERVATIONS_DROPPED = "om/observations/dropped";
export const OM_COMPACTION = "om/compaction";

export const RELEVANCE_VALUES = ["low", "medium", "high", "critical"] as const;
export type Relevance = (typeof RELEVANCE_VALUES)[number];

export const MEMORY_ID_PATTERN = /^[a-f0-9]{12}$/;

export type Observation = {
	id: string;
	content: string;
	timestamp: string;
	relevance: Relevance;
	/** Session event seqs of the source messages that directly support this observation. */
	sourceEntrySeqs: number[];
	tokenCount: number;
};

export type Reflection = {
	id: string;
	content: string;
	supportingObservationIds: string[];
	tokenCount: number;
};

export type ObservationsRecordedData = {
	observations: Observation[];
	coversUpToSeq: number;
};

export type ReflectionsRecordedData = {
	reflections: Reflection[];
	coversUpToSeq: number;
};

export type ObservationsDroppedData = {
	observationIds: string[];
	coversUpToSeq: number;
};

/**
 * Bookkeeping written by the compaction engine after each successful
 * compaction, so the projection can reproduce pi's full-fold maintenance
 * boundary without reading the session log. Like pi's `om.folded` compaction
 * details, it stores the exact projection the summary carried, which is what
 * `visibleProjection` reports as the memory currently visible in compressed
 * context.
 */
export type CompactionData = {
	/** First retained surface-node seq (pi's `firstKeptEntryId` analog). */
	firstKeptSeq: number;
	/** Last shadowed surface-node seq. */
	shadowedThroughSeq: number;
	fullFold: boolean;
	/** The projection the summary carried (pi's `details`). */
	observations: Observation[];
	reflections: Reflection[];
};

export type LedgerRecordType =
	| typeof OM_OBSERVATIONS_RECORDED
	| typeof OM_REFLECTIONS_RECORDED
	| typeof OM_OBSERVATIONS_DROPPED
	| typeof OM_COMPACTION;

export type LedgerRecord =
	| { type: typeof OM_OBSERVATIONS_RECORDED; data: ObservationsRecordedData }
	| { type: typeof OM_REFLECTIONS_RECORDED; data: ReflectionsRecordedData }
	| { type: typeof OM_OBSERVATIONS_DROPPED; data: ObservationsDroppedData }
	| { type: typeof OM_COMPACTION; data: CompactionData };

/** Persisted per-session ledger file shape. */
export type Ledger = {
	version: 1;
	sessionId: string;
	records: LedgerRecord[];
	/**
	 * Provider/meter context-token snapshots taken when each coverage record
	 * landed, keyed by record type. Enables the real (metered) progress clock;
	 * missing entries fall back to the raw estimate.
	 */
	anchors: {
		observations?: { atSeq: number; tokens: number };
		reflections?: { atSeq: number; tokens: number };
		compaction?: { atSeq: number; tokens: number };
	};
};

export function isRelevance(value: unknown): value is Relevance {
	return typeof value === "string" && (RELEVANCE_VALUES as readonly string[]).includes(value);
}

export function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

export function isNonEmptyStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

export function isMemoryId(value: unknown): value is string {
	return typeof value === "string" && MEMORY_ID_PATTERN.test(value);
}

function isTokenCount(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isSeq(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

export function isObservation(value: unknown): value is Observation {
	if (!isPlainRecord(value)) return false;
	return (
		isMemoryId(value.id) &&
		isNonEmptyString(value.content) &&
		isNonEmptyString(value.timestamp) &&
		isRelevance(value.relevance) &&
		(Array.isArray(value.sourceEntrySeqs) && value.sourceEntrySeqs.every(isSeq)) &&
		isTokenCount(value.tokenCount)
	);
}

export function isReflection(value: unknown): value is Reflection {
	if (!isPlainRecord(value)) return false;
	return (
		isMemoryId(value.id) &&
		isNonEmptyString(value.content) &&
		!/\r|\n/.test(value.content) &&
		isNonEmptyStringArray(value.supportingObservationIds) &&
		isTokenCount(value.tokenCount)
	);
}

export function isObservationsRecordedData(value: unknown): value is ObservationsRecordedData {
	if (!isPlainRecord(value)) return false;
	return (
		Array.isArray(value.observations) &&
		value.observations.length > 0 &&
		value.observations.every(isObservation) &&
		isSeq(value.coversUpToSeq)
	);
}

export function isReflectionsRecordedData(value: unknown): value is ReflectionsRecordedData {
	if (!isPlainRecord(value)) return false;
	return (
		Array.isArray(value.reflections) &&
		value.reflections.length > 0 &&
		value.reflections.every(isReflection) &&
		isSeq(value.coversUpToSeq)
	);
}

export function isObservationsDroppedData(value: unknown): value is ObservationsDroppedData {
	if (!isPlainRecord(value)) return false;
	return isNonEmptyStringArray(value.observationIds) && isSeq(value.coversUpToSeq);
}

export function isCompactionData(value: unknown): value is CompactionData {
	if (!isPlainRecord(value)) return false;
	return (
		isSeq(value.firstKeptSeq) &&
		isSeq(value.shadowedThroughSeq) &&
		typeof value.fullFold === "boolean" &&
		Array.isArray(value.observations) && value.observations.every(isObservation) &&
		Array.isArray(value.reflections) && value.reflections.every(isReflection)
	);
}

export function isLedgerRecord(value: unknown): value is LedgerRecord {
	if (!isPlainRecord(value)) return false;
	switch (value.type) {
		case OM_OBSERVATIONS_RECORDED:
			return isObservationsRecordedData(value.data);
		case OM_REFLECTIONS_RECORDED:
			return isReflectionsRecordedData(value.data);
		case OM_OBSERVATIONS_DROPPED:
			return isObservationsDroppedData(value.data);
		case OM_COMPACTION:
			return isCompactionData(value.data);
		default:
			return false;
	}
}

export function buildObservationsRecordedData(
	observations: Observation[],
	coversUpToSeq: number,
): ObservationsRecordedData | undefined {
	if (observations.length === 0 || !isSeq(coversUpToSeq)) return undefined;
	return { observations, coversUpToSeq };
}

export function buildReflectionsRecordedData(
	reflections: Reflection[],
	coversUpToSeq: number,
): ReflectionsRecordedData | undefined {
	if (reflections.length === 0 || !isSeq(coversUpToSeq)) return undefined;
	return { reflections, coversUpToSeq };
}

export function buildObservationsDroppedData(
	observationIds: string[],
	coversUpToSeq: number,
): ObservationsDroppedData | undefined {
	if (observationIds.length === 0 || !isSeq(coversUpToSeq)) return undefined;
	return { observationIds, coversUpToSeq };
}
