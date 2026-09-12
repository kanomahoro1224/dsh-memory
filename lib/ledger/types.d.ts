/**
 * Observational-memory ledger vocabulary, adapted from the pi extension to
 * DeepSeek Harness. The ledger is an append-only record log persisted by the
 * plugin (see ./store.ts); coverage anchors are session event seqs
 * (`coversUpToSeq`) instead of pi's custom-entry ids.
 */
export declare const OM_OBSERVATIONS_RECORDED = "om/observations/recorded";
export declare const OM_REFLECTIONS_RECORDED = "om/reflections/recorded";
export declare const OM_OBSERVATIONS_DROPPED = "om/observations/dropped";
export declare const OM_COMPACTION = "om/compaction";
export declare const RELEVANCE_VALUES: readonly ["low", "medium", "high", "critical"];
export type Relevance = (typeof RELEVANCE_VALUES)[number];
export declare const MEMORY_ID_PATTERN: RegExp;
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
export type LedgerRecordType = typeof OM_OBSERVATIONS_RECORDED | typeof OM_REFLECTIONS_RECORDED | typeof OM_OBSERVATIONS_DROPPED | typeof OM_COMPACTION;
export type LedgerRecord = {
    type: typeof OM_OBSERVATIONS_RECORDED;
    data: ObservationsRecordedData;
} | {
    type: typeof OM_REFLECTIONS_RECORDED;
    data: ReflectionsRecordedData;
} | {
    type: typeof OM_OBSERVATIONS_DROPPED;
    data: ObservationsDroppedData;
} | {
    type: typeof OM_COMPACTION;
    data: CompactionData;
};
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
        observations?: {
            atSeq: number;
            tokens: number;
        };
        reflections?: {
            atSeq: number;
            tokens: number;
        };
        compaction?: {
            atSeq: number;
            tokens: number;
        };
    };
};
export declare function isRelevance(value: unknown): value is Relevance;
export declare function isNonEmptyString(value: unknown): value is string;
export declare function isNonEmptyStringArray(value: unknown): value is string[];
export declare function isMemoryId(value: unknown): value is string;
export declare function isObservation(value: unknown): value is Observation;
export declare function isReflection(value: unknown): value is Reflection;
export declare function isObservationsRecordedData(value: unknown): value is ObservationsRecordedData;
export declare function isReflectionsRecordedData(value: unknown): value is ReflectionsRecordedData;
export declare function isObservationsDroppedData(value: unknown): value is ObservationsDroppedData;
export declare function isCompactionData(value: unknown): value is CompactionData;
export declare function isLedgerRecord(value: unknown): value is LedgerRecord;
export declare function buildObservationsRecordedData(observations: Observation[], coversUpToSeq: number): ObservationsRecordedData | undefined;
export declare function buildReflectionsRecordedData(reflections: Reflection[], coversUpToSeq: number): ReflectionsRecordedData | undefined;
export declare function buildObservationsDroppedData(observationIds: string[], coversUpToSeq: number): ObservationsDroppedData | undefined;
