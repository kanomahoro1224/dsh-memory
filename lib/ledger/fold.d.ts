import { type LedgerRecord, type Observation, type Reflection } from "./types.js";
export type FoldLedgerOptions = {
    /** Fold records through the record at this index, inclusive. Omit to fold through the tip. */
    upToIndex?: number;
};
export type FoldedLedger = {
    /** All first-valid observation records encountered through the fold boundary, including dropped observations. */
    observations: Observation[];
    /** Observation records not tombstoned by a folded drop record. */
    activeObservations: Observation[];
    /** Tombstoned observation ids, including ids that may not have a corresponding folded observation. */
    droppedObservationIds: Set<string>;
    /** All first-valid reflection records encountered through the fold boundary. */
    reflections: Reflection[];
    /** All first-valid observation records by id, including dropped observations. */
    observationsById: Map<string, Observation>;
    /** All first-valid reflection records by id. */
    reflectionsById: Map<string, Reflection>;
};
/**
 * Fold valid ledger records from the log root through the target index.
 *
 * Unknown record types, invalid shapes, and future records are ignored.
 * Observations and reflections use first-valid-record-wins semantics. Drops
 * are tombstones and are retained even when the dropped id is unknown at the
 * time of folding.
 */
export declare function foldLedger(records: LedgerRecord[], options?: FoldLedgerOptions): FoldedLedger;
