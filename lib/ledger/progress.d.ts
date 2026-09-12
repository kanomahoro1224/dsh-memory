import type { SessionEvent } from "@deepseek-ai/dsh-session";
import { OM_OBSERVATIONS_RECORDED, OM_REFLECTIONS_RECORDED, type CompactionData, type LedgerRecord } from "./types.js";
export type ConsolidationCoverageType = typeof OM_OBSERVATIONS_RECORDED | typeof OM_REFLECTIONS_RECORDED;
export declare function latestCoverageSeq(records: LedgerRecord[], type: ConsolidationCoverageType): number | undefined;
export declare function latestCompaction(records: LedgerRecord[]): CompactionData | undefined;
export declare function latestFullFoldFirstKeptSeq(records: LedgerRecord[]): number | undefined;
/**
 * Raw estimated source tokens still visible on the surface from the later of
 * the coverage anchor and the last compaction checkpoint. Scans the visible
 * surface backwards from the tip and stops at the first anchor hit, so the
 * later anchor naturally wins (pi's `max(coverage, compaction)` semantics) and
 * shadowed anchors degrade to the checkpoint boundary.
 */
export declare function rawTokensSinceSurfaceAnchor(surfaceEvents: readonly SessionEvent[], anchorSeq: number | undefined): number;
/** Metered growth since an anchor snapshot; undefined when the basis changed (delta went negative). */
export declare function realTokensSinceAnchor(currentTokens: number | undefined, anchorTokens: number | undefined): number | undefined;
