import { debugLog } from "../../debug-log.js";
import { runWorkerLoop } from "../../llm/worker-loop.js";
import { reflectionToSummaryLine } from "../../ledger/index.js";
import { DROPPER_SYSTEM } from "./prompts.js";
import { REFLECTION_COVERAGE_DROP_RANK, coverageTierForObservation, reflectionCoverageMap, summarizeCoverageByRelevance, summarizeCoverageByRelevanceForIds, observationToDropperLine, } from "./coverage.js";
import { observationPoolMetrics } from "./pool.js";
const RELEVANCE_DROP_RANK = {
    low: 0,
    medium: 1,
    high: 2,
    critical: 3,
};
function joinOrEmpty(items) {
    return items.length ? items.join("\n") : "(none yet)";
}
function relevanceCounts(observations) {
    return observations.reduce((counts, observation) => {
        counts[observation.relevance]++;
        return counts;
    }, { low: 0, medium: 0, high: 0, critical: 0 });
}
export function normalizeDropObservationIds(ids, observations) {
    if (!ids || ids.length === 0)
        return undefined;
    const allowed = new Map(observations.map((observation) => [observation.id, observation]));
    const result = [];
    const seen = new Set();
    for (const id of ids) {
        if (typeof id !== "string")
            continue;
        const observation = allowed.get(id);
        if (!observation)
            continue;
        if (seen.has(id))
            continue;
        seen.add(id);
        result.push(id);
    }
    return result.length > 0 ? result : undefined;
}
function timestampRank(timestamp) {
    const parsed = Date.parse(timestamp);
    return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}
export function selectDropCandidates(ids, observations, maxDrops, reflections = []) {
    if (maxDrops <= 0 || ids.length === 0)
        return [];
    const byId = new Map(observations.map((observation) => [observation.id, observation]));
    const coverageById = reflectionCoverageMap(observations, reflections);
    const firstProposalIndex = new Map();
    for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        if (!firstProposalIndex.has(id))
            firstProposalIndex.set(id, i);
    }
    return Array.from(firstProposalIndex.entries())
        .map(([id, index]) => ({ id, index, observation: byId.get(id) }))
        .filter((candidate) => candidate.observation !== undefined)
        .sort((a, b) => {
        const coverageDelta = REFLECTION_COVERAGE_DROP_RANK[coverageTierForObservation(a.observation, coverageById)]
            - REFLECTION_COVERAGE_DROP_RANK[coverageTierForObservation(b.observation, coverageById)];
        const relevanceDelta = RELEVANCE_DROP_RANK[a.observation.relevance] - RELEVANCE_DROP_RANK[b.observation.relevance];
        const ageDelta = timestampRank(a.observation.timestamp) - timestampRank(b.observation.timestamp);
        return coverageDelta || relevanceDelta || ageDelta || a.index - b.index;
    })
        .slice(0, maxDrops)
        .map((candidate) => candidate.id);
}
export async function runDropper(args) {
    const { ctx, target, reflections, observations, targetTokens, signal } = args;
    if (observations.length === 0)
        return undefined;
    const metrics = observationPoolMetrics(observations, targetTokens);
    const { observationTokens, fullness, tokensOverTarget, maxDropsAllowed } = metrics;
    const coverageById = reflectionCoverageMap(observations, reflections);
    const coverageSummaryByRelevance = summarizeCoverageByRelevance(observations, coverageById);
    debugLog("dropper.agent_start", {
        activeObservationCount: observations.length,
        reflectionCount: reflections.length,
        observationTokens,
        targetTokens,
        tokensOverTarget,
        fullness,
        maxDropsAllowed,
        relevanceCounts: relevanceCounts(observations),
        coverageSummaryByRelevance,
    });
    if (maxDropsAllowed <= 0) {
        debugLog("dropper.result", {
            reason: "not_over_target",
            toolCallCount: 0,
            acceptedCandidateCount: 0,
            selectedDropsCount: 0,
            selectedCoverageSummaryByRelevance: summarizeCoverageByRelevanceForIds([], observations, coverageById),
            maxDropsAllowed,
        });
        return undefined;
    }
    const proposedDropIds = [];
    const proposed = new Set();
    const allowed = new Map(observations.map((observation) => [observation.id, observation]));
    let toolCallCount = 0;
    let rawRequestedIdsCount = 0;
    const dropObservations = {
        name: "drop_observations",
        description: "Propose active observation ids that are safe to remove from compacted memory.",
        parameters: {
            type: "object",
            properties: {
                ids: { type: "array", minItems: 1, items: { type: "string" } },
                reason: { type: "string" },
            },
            required: ["ids"],
        },
        execute: (raw) => {
            toolCallCount++;
            const params = (raw ?? {});
            const ids = Array.isArray(params.ids) ? params.ids : [];
            rawRequestedIdsCount += ids.length;
            const seenInRequest = new Set();
            let added = 0;
            for (const id of ids) {
                if (typeof id !== "string")
                    continue;
                const observation = allowed.get(id);
                if (!observation)
                    continue;
                if (seenInRequest.has(id))
                    continue;
                seenInRequest.add(id);
                if (proposed.has(id))
                    continue;
                proposed.add(id);
                proposedDropIds.push(id);
                added++;
            }
            return `Queued ${added} drop candidate${added === 1 ? "" : "s"}. Candidates this run: ${proposedDropIds.length}. Maximum drops allowed: ${maxDropsAllowed}.`;
        },
    };
    const fullnessPercent = Math.round(fullness * 100);
    const userText = `CURRENT REFLECTIONS:\n${joinOrEmpty(reflections.map(reflectionToSummaryLine))}\n\nCURRENT OBSERVATIONS:\n${joinOrEmpty(observations.map((observation) => observationToDropperLine(observation, coverageTierForObservation(observation, coverageById))))}\n\nActive observation pool: ~${observationTokens.toLocaleString()} tokens; target: ~${targetTokens.toLocaleString()} tokens; fullness against target: ~${fullnessPercent.toLocaleString()}%; over target by ~${tokensOverTarget.toLocaleString()} tokens.\nMaximum drops allowed this run: ${maxDropsAllowed.toLocaleString()} observation${maxDropsAllowed === 1 ? "" : "s"}. This maximum is sized to move the active pool toward the target if every proposed drop is clearly safe.\nThis maximum is a hard upper bound, not a target. Drop fewer or none if fewer observations are clearly safe.`;
    await runWorkerLoop({
        ctx,
        stage: "dropper",
        target,
        systemPrompt: DROPPER_SYSTEM,
        userText,
        tools: [dropObservations],
        maxTurns: args.maxTurns,
        reasoningEffort: args.reasoningEffort,
        sessionId: args.sessionId,
        signal,
    });
    const droppedIds = selectDropCandidates(proposedDropIds, observations, maxDropsAllowed, reflections);
    const reason = droppedIds.length > 0
        ? "selected_nonempty"
        : toolCallCount === 0
            ? "no_tool_call"
            : proposedDropIds.length === 0
                ? "all_filtered"
                : "selected_empty";
    const selectedDropTokens = droppedIds.reduce((sum, id) => sum + (allowed.get(id)?.tokenCount ?? 0), 0);
    debugLog("dropper.result", {
        reason,
        toolCallCount,
        rawRequestedIdsCount,
        acceptedCandidateCount: proposedDropIds.length,
        selectedDropsCount: droppedIds.length,
        selectedDropTokens,
        selectedCoverageSummaryByRelevance: summarizeCoverageByRelevanceForIds(droppedIds, observations, coverageById),
        maxDropsAllowed,
    });
    return droppedIds.length > 0 ? droppedIds : undefined;
}
//# sourceMappingURL=agent.js.map