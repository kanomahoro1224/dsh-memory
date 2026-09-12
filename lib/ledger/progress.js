import { isCompactCheckpointSource } from "@deepseek-ai/dsh-compaction";
import { estimateEventTokens } from "../tokens.js";
import { isObservationsDroppedData, isObservationsRecordedData, isReflectionsRecordedData, OM_COMPACTION, OM_OBSERVATIONS_DROPPED, OM_OBSERVATIONS_RECORDED, OM_REFLECTIONS_RECORDED, } from "./types.js";
/** Session event types the consolidation progress clock counts as source content. */
function isSourceEvent(event) {
    return event.type === "user/message" || event.type === "assistant/message" || event.type === "tool/result";
}
function coverageSeq(record) {
    if (record.type === OM_OBSERVATIONS_RECORDED && isObservationsRecordedData(record.data))
        return record.data.coversUpToSeq;
    if (record.type === OM_REFLECTIONS_RECORDED && isReflectionsRecordedData(record.data))
        return record.data.coversUpToSeq;
    if (record.type === OM_OBSERVATIONS_DROPPED && isObservationsDroppedData(record.data))
        return record.data.coversUpToSeq;
    return undefined;
}
export function latestCoverageSeq(records, type) {
    let latest;
    for (const record of records) {
        if (record.type !== type)
            continue;
        const seq = coverageSeq(record);
        if (seq === undefined)
            continue;
        if (latest === undefined || seq > latest)
            latest = seq;
    }
    return latest;
}
export function latestCompaction(records) {
    for (let i = records.length - 1; i >= 0; i--) {
        const record = records[i];
        if (record?.type === OM_COMPACTION)
            return record.data;
    }
    return undefined;
}
export function latestFullFoldFirstKeptSeq(records) {
    for (let i = records.length - 1; i >= 0; i--) {
        const record = records[i];
        if (record?.type === OM_COMPACTION && record.data.fullFold)
            return record.data.firstKeptSeq;
    }
    return undefined;
}
/**
 * Raw estimated source tokens still visible on the surface from the later of
 * the coverage anchor and the last compaction checkpoint. Scans the visible
 * surface backwards from the tip and stops at the first anchor hit, so the
 * later anchor naturally wins (pi's `max(coverage, compaction)` semantics) and
 * shadowed anchors degrade to the checkpoint boundary.
 */
export function rawTokensSinceSurfaceAnchor(surfaceEvents, anchorSeq) {
    let total = 0;
    for (let i = surfaceEvents.length - 1; i >= 0; i--) {
        const event = surfaceEvents[i];
        if (!event)
            continue;
        if (anchorSeq !== undefined && event.seq === anchorSeq)
            break;
        if (event.type === "system/message")
            continue;
        if (event.type === "user/message") {
            const message = event.data.source;
            if (message !== undefined && isCompactCheckpointSource(message)) {
                break;
            }
        }
        if (isSourceEvent(event))
            total += estimateEventTokens(event);
    }
    return total;
}
/** Metered growth since an anchor snapshot; undefined when the basis changed (delta went negative). */
export function realTokensSinceAnchor(currentTokens, anchorTokens) {
    if (currentTokens === undefined || anchorTokens === undefined)
        return undefined;
    const delta = currentTokens - anchorTokens;
    return delta >= 0 ? delta : undefined;
}
//# sourceMappingURL=progress.js.map