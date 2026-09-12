import { debugLog } from "../../debug-log.js";
import { hashId } from "../../ids.js";
import { runWorkerLoop } from "../../llm/worker-loop.js";
import { truncateRecordContent } from "../../serialize.js";
import { estimateStringTokens } from "../../tokens.js";
import { reflectionToSummaryLine } from "../../ledger/index.js";
import { REFLECTOR_SYSTEM } from "./prompts.js";
import { coverageTierForObservation, reflectionCoverageMap, summarizeCoverageByRelevance, summarizeCoverageTransitionsByRelevance, } from "../dropper/coverage.js";
export function observationToReflectorLine(observation, coverage) {
    return `[${observation.id}] ${observation.timestamp} [${observation.relevance}] [coverage: ${coverage}] ${observation.content}`;
}
export function summarizeSupportIdCounts(reflections) {
    if (reflections.length === 0) {
        return { reflectionCount: 0, totalSupportIds: 0, minSupportIds: 0, maxSupportIds: 0, averageSupportIds: 0, histogram: {} };
    }
    const counts = reflections.map((reflection) => reflection.supportingObservationIds.length);
    const totalSupportIds = counts.reduce((sum, count) => sum + count, 0);
    const histogram = {};
    for (const count of counts)
        histogram[String(count)] = (histogram[String(count)] ?? 0) + 1;
    return {
        reflectionCount: reflections.length,
        totalSupportIds,
        minSupportIds: Math.min(...counts),
        maxSupportIds: Math.max(...counts),
        averageSupportIds: totalSupportIds / reflections.length,
        histogram,
    };
}
export function normalizeSupportingObservationIds(supportingObservationIds, allowedObservationIds) {
    if (!supportingObservationIds || supportingObservationIds.length === 0)
        return undefined;
    const allowedOrder = new Map();
    for (let i = 0; i < allowedObservationIds.length; i++) {
        if (!allowedOrder.has(allowedObservationIds[i]))
            allowedOrder.set(allowedObservationIds[i], i);
    }
    const seen = new Set();
    for (const id of supportingObservationIds) {
        if (typeof id !== "string" || !allowedOrder.has(id))
            return undefined;
        seen.add(id);
    }
    if (seen.size === 0)
        return undefined;
    return Array.from(seen).sort((a, b) => (allowedOrder.get(a) ?? 0) - (allowedOrder.get(b) ?? 0));
}
function normalizeReflectionContent(content) {
    if (typeof content !== "string")
        return undefined;
    const normalized = truncateRecordContent(content.trim());
    if (!normalized || /\r|\n/.test(normalized))
        return undefined;
    return normalized;
}
export async function runReflector(args) {
    const { ctx, target, reflections, observations, signal } = args;
    if (observations.length === 0)
        return undefined;
    const coverageById = reflectionCoverageMap(observations, reflections);
    debugLog("reflector.agent_start", {
        activeObservationCount: observations.length,
        reflectionCount: reflections.length,
        coverageSummaryByRelevance: summarizeCoverageByRelevance(observations, coverageById),
    });
    const allowedObservationIds = observations.map((observation) => observation.id);
    const existingReflectionIds = new Set(reflections.map((reflection) => reflection.id));
    const accumulated = new Map();
    let toolCallCount = 0;
    let rawProposedReflectionCount = 0;
    let acceptedReflectionCount = 0;
    let duplicateReflectionCount = 0;
    let rejectedReflectionCount = 0;
    const recordReflections = {
        name: "record_reflections",
        description: "Record new durable reflections with supporting observation ids.",
        parameters: {
            type: "object",
            properties: {
                reflections: {
                    type: "array",
                    minItems: 1,
                    items: {
                        type: "object",
                        properties: {
                            content: { type: "string", minLength: 1 },
                            supportingObservationIds: { type: "array", minItems: 1, items: { type: "string" } },
                        },
                        required: ["content", "supportingObservationIds"],
                    },
                },
            },
            required: ["reflections"],
        },
        execute: (raw) => {
            toolCallCount++;
            const params = (raw ?? {});
            const proposals = Array.isArray(params.reflections) ? params.reflections : [];
            rawProposedReflectionCount += proposals.length;
            let added = 0;
            let duplicates = 0;
            let rejected = 0;
            for (const proposal of proposals) {
                const content = normalizeReflectionContent(proposal.content);
                const supportingObservationIds = normalizeSupportingObservationIds(proposal.supportingObservationIds, allowedObservationIds);
                if (!content || !supportingObservationIds) {
                    rejected++;
                    continue;
                }
                const id = hashId(content);
                if (existingReflectionIds.has(id) || accumulated.has(id)) {
                    duplicates++;
                    continue;
                }
                accumulated.set(id, {
                    id,
                    content,
                    supportingObservationIds,
                    tokenCount: estimateStringTokens(content),
                });
                added++;
            }
            acceptedReflectionCount += added;
            duplicateReflectionCount += duplicates;
            rejectedReflectionCount += rejected;
            return `Recorded ${added} reflection${added === 1 ? "" : "s"}; ${duplicates} duplicate${duplicates === 1 ? "" : "s"}; ${rejected} rejected. Total this run: ${accumulated.size}.`;
        },
    };
    const joinOrEmpty = (items) => (items.length ? items.join("\n") : "(none yet)");
    const userText = `CURRENT REFLECTIONS:\n${joinOrEmpty(reflections.map(reflectionToSummaryLine))}\n\nCURRENT OBSERVATIONS:\n${joinOrEmpty(observations.map((observation) => observationToReflectorLine(observation, coverageTierForObservation(observation, coverageById))))}\n\nCrystallize any missing durable facts or patterns into new reflections. If nothing is stable enough, do not call the tool.`;
    await runWorkerLoop({
        ctx,
        stage: "reflector",
        target,
        systemPrompt: REFLECTOR_SYSTEM,
        userText,
        tools: [recordReflections],
        maxTurns: args.maxTurns,
        reasoningEffort: args.reasoningEffort,
        sessionId: args.sessionId,
        signal,
    });
    const acceptedReflections = Array.from(accumulated.values());
    const afterCoverageById = reflectionCoverageMap(observations, [...reflections, ...acceptedReflections]);
    debugLog("reflector.result", {
        reason: acceptedReflections.length > 0 ? "accepted_nonempty" : toolCallCount === 0 ? "no_tool_call" : "all_filtered",
        toolCallCount,
        rawProposedReflectionCount,
        acceptedReflectionCount,
        duplicateReflectionCount,
        rejectedReflectionCount,
        acceptedSupportIdCounts: summarizeSupportIdCounts(acceptedReflections),
        coverageTransitionsByRelevance: summarizeCoverageTransitionsByRelevance(observations, coverageById, afterCoverageById),
    });
    return acceptedReflections.length > 0 ? acceptedReflections : undefined;
}
//# sourceMappingURL=agent.js.map