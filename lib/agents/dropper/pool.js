import { observationLineTokenCount } from "../../tokens.js";
export function observationTokenSum(observations) {
    // Count the full rendered line (id + timestamp + relevance + content), not
    // bare content: the pool budget caps how much observation text is re-rendered
    // into future contexts, and every line carries metadata overhead.
    return observations.reduce((sum, observation) => sum + observationLineTokenCount(observation), 0);
}
export function observationPoolFullness(observationTokens, targetTokens) {
    if (!Number.isFinite(observationTokens) || observationTokens <= 0)
        return 0;
    if (!Number.isFinite(targetTokens) || targetTokens <= 0)
        return 0;
    return observationTokens / targetTokens;
}
export function maxDropCountForPool(observations, observationTokens, targetTokens) {
    const activeObservationCount = observations.length;
    if (activeObservationCount === 0)
        return 0;
    if (!Number.isFinite(observationTokens) || observationTokens <= 0)
        return 0;
    if (!Number.isFinite(targetTokens) || targetTokens < 0)
        return 0;
    const tokensOverTarget = observationTokens - targetTokens;
    if (tokensOverTarget <= 0)
        return 0;
    const averageObservationTokens = observationTokens / activeObservationCount;
    if (!Number.isFinite(averageObservationTokens) || averageObservationTokens <= 0)
        return 0;
    const estimatedDrops = Math.ceil(tokensOverTarget / averageObservationTokens);
    return Math.min(activeObservationCount, Math.max(1, estimatedDrops));
}
export function observationPoolMetrics(observations, targetTokens) {
    const observationTokens = observationTokenSum(observations);
    const fullness = observationPoolFullness(observationTokens, targetTokens);
    const activeObservationCount = observations.length;
    const tokensOverTarget = Math.max(0, observationTokens - targetTokens);
    const maxDropsAllowed = maxDropCountForPool(observations, observationTokens, targetTokens);
    const overTarget = Number.isFinite(targetTokens) && targetTokens >= 0 && observationTokens > targetTokens;
    return {
        observationTokens,
        targetTokens,
        tokensOverTarget,
        fullness,
        activeObservationCount,
        droppableCount: activeObservationCount,
        maxDropsAllowed,
        overTarget,
        ready: overTarget && maxDropsAllowed > 0,
    };
}
//# sourceMappingURL=pool.js.map