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
export const RELEVANCE_VALUES = ["low", "medium", "high", "critical"];
export const MEMORY_ID_PATTERN = /^[a-f0-9]{12}$/;
export function isRelevance(value) {
    return typeof value === "string" && RELEVANCE_VALUES.includes(value);
}
export function isNonEmptyString(value) {
    return typeof value === "string" && value.length > 0;
}
export function isNonEmptyStringArray(value) {
    return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}
export function isMemoryId(value) {
    return typeof value === "string" && MEMORY_ID_PATTERN.test(value);
}
function isTokenCount(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function isSeq(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function isPlainRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
export function isObservation(value) {
    if (!isPlainRecord(value))
        return false;
    return (isMemoryId(value.id) &&
        isNonEmptyString(value.content) &&
        isNonEmptyString(value.timestamp) &&
        isRelevance(value.relevance) &&
        (Array.isArray(value.sourceEntrySeqs) && value.sourceEntrySeqs.every(isSeq)) &&
        isTokenCount(value.tokenCount));
}
export function isReflection(value) {
    if (!isPlainRecord(value))
        return false;
    return (isMemoryId(value.id) &&
        isNonEmptyString(value.content) &&
        !/\r|\n/.test(value.content) &&
        isNonEmptyStringArray(value.supportingObservationIds) &&
        isTokenCount(value.tokenCount));
}
export function isObservationsRecordedData(value) {
    if (!isPlainRecord(value))
        return false;
    return (Array.isArray(value.observations) &&
        value.observations.length > 0 &&
        value.observations.every(isObservation) &&
        isSeq(value.coversUpToSeq));
}
export function isReflectionsRecordedData(value) {
    if (!isPlainRecord(value))
        return false;
    return (Array.isArray(value.reflections) &&
        value.reflections.length > 0 &&
        value.reflections.every(isReflection) &&
        isSeq(value.coversUpToSeq));
}
export function isObservationsDroppedData(value) {
    if (!isPlainRecord(value))
        return false;
    return isNonEmptyStringArray(value.observationIds) && isSeq(value.coversUpToSeq);
}
export function isCompactionData(value) {
    if (!isPlainRecord(value))
        return false;
    return (isSeq(value.firstKeptSeq) &&
        isSeq(value.shadowedThroughSeq) &&
        typeof value.fullFold === "boolean" &&
        Array.isArray(value.observations) && value.observations.every(isObservation) &&
        Array.isArray(value.reflections) && value.reflections.every(isReflection));
}
export function isLedgerRecord(value) {
    if (!isPlainRecord(value))
        return false;
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
export function buildObservationsRecordedData(observations, coversUpToSeq) {
    if (observations.length === 0 || !isSeq(coversUpToSeq))
        return undefined;
    return { observations, coversUpToSeq };
}
export function buildReflectionsRecordedData(reflections, coversUpToSeq) {
    if (reflections.length === 0 || !isSeq(coversUpToSeq))
        return undefined;
    return { reflections, coversUpToSeq };
}
export function buildObservationsDroppedData(observationIds, coversUpToSeq) {
    if (observationIds.length === 0 || !isSeq(coversUpToSeq))
        return undefined;
    return { observationIds, coversUpToSeq };
}
//# sourceMappingURL=types.js.map