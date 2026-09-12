export const REFLECTION_COVERAGE_TIERS = ["none", "partial", "strong"];
export const REFLECTION_COVERAGE_DROP_RANK = {
    strong: 0,
    partial: 1,
    none: 2,
};
export function reflectionSupportCounts(reflections) {
    const counts = new Map();
    for (const reflection of reflections) {
        const uniqueIds = new Set(reflection.supportingObservationIds);
        for (const id of uniqueIds)
            counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
}
export function reflectionCoverageTierForCount(count) {
    if (count <= 0)
        return "none";
    if (count === 1)
        return "partial";
    return "strong";
}
export function reflectionCoverageMap(observations, reflections) {
    const counts = reflectionSupportCounts(reflections);
    return new Map(observations.map((observation) => [
        observation.id,
        reflectionCoverageTierForCount(counts.get(observation.id) ?? 0),
    ]));
}
function emptyCoverageBucket() {
    return {
        none: { count: 0, tokens: 0 },
        partial: { count: 0, tokens: 0 },
        strong: { count: 0, tokens: 0 },
    };
}
export function emptyCoverageSummaryByRelevance() {
    return {
        low: emptyCoverageBucket(),
        medium: emptyCoverageBucket(),
        high: emptyCoverageBucket(),
        critical: emptyCoverageBucket(),
    };
}
export function summarizeCoverageByRelevance(observations, coverageById) {
    const summary = emptyCoverageSummaryByRelevance();
    for (const observation of observations) {
        const tier = coverageById.get(observation.id) ?? "none";
        const bucket = summary[observation.relevance][tier];
        bucket.count++;
        bucket.tokens += observation.tokenCount;
    }
    return summary;
}
export function summarizeCoverageByRelevanceForIds(ids, observations, coverageById) {
    const byId = new Map(observations.map((observation) => [observation.id, observation]));
    const selected = ids.flatMap((id) => {
        const observation = byId.get(id);
        return observation ? [observation] : [];
    });
    return summarizeCoverageByRelevance(selected, coverageById);
}
export function summarizeCoverageTransitionsByRelevance(observations, beforeCoverageById, afterCoverageById) {
    const summary = {
        low: {},
        medium: {},
        high: {},
        critical: {},
    };
    for (const observation of observations) {
        const before = beforeCoverageById.get(observation.id) ?? "none";
        const after = afterCoverageById.get(observation.id) ?? "none";
        if (before === after)
            continue;
        const key = `${before}->${after}`;
        const bucket = summary[observation.relevance][key] ?? { count: 0, tokens: 0 };
        bucket.count++;
        bucket.tokens += observation.tokenCount;
        summary[observation.relevance][key] = bucket;
    }
    return summary;
}
export function observationToDropperLine(observation, coverage) {
    return `[${observation.id}] ${observation.timestamp} [${observation.relevance}] [coverage: ${coverage}] ${observation.content}`;
}
export function coverageTierForObservation(observation, coverageById) {
    return coverageById.get(observation.id) ?? "none";
}
//# sourceMappingURL=coverage.js.map