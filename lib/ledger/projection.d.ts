import { type LedgerRecord, type Observation, type Reflection } from "./types.js";
export type Projection = {
    observations: Observation[];
    reflections: Reflection[];
};
export type ProjectionDiff = {
    observationsOnlyInFull: Observation[];
    reflectionsOnlyInFull: Reflection[];
    droppedOnlyInFull: Observation[];
};
export type CompactionProjectionConfig = {
    observationsPoolMaxTokens: number;
};
export type CompactionProjection = Projection & {
    fullFold: boolean;
};
export declare function fullProjection(records: LedgerRecord[], throughSeq?: number): Projection;
/**
 * The memory currently visible in compressed context: the projection the LAST
 * compaction baked into its summary (pi reads the stored `details` of the last
 * compaction entry; here the om/compaction ledger record carries the same
 * lists). Empty until the first compaction.
 */
export declare function visibleProjection(records: LedgerRecord[]): Projection;
/**
 * Build the projection a compaction summary must carry, reproducing pi's
 * tiered semantics: observations are included through the retention boundary,
 * while reflections and drops follow the latest full-fold maintenance
 * boundary (their durable state is carried forward by compaction summaries;
 * `fullFold` re-folds everything through the boundary when the active pool has
 * outgrown the summary budget).
 *
 * `firstKeptSeq` is pi's `firstKeptEntryId` analog: the first retained
 * surface-node seq of the pending compaction. Records anchored at or before it
 * describe shadowed content. `undefined` folds everything visible.
 */
export declare function buildCompactionProjection(records: LedgerRecord[], firstKeptSeq: number | undefined, config: CompactionProjectionConfig): CompactionProjection;
export declare function diffProjection(visible: Projection, full: Projection): ProjectionDiff;
