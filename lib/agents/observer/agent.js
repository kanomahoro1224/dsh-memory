import { debugLog } from "../../debug-log.js";
import { hashId } from "../../ids.js";
import { runWorkerLoop } from "../../llm/worker-loop.js";
import { nowTimestamp, truncateRecordContent } from "../../serialize.js";
import { observationLineTokenCount } from "../../tokens.js";
import { OBSERVER_SYSTEM } from "./prompts.js";
const RELEVANCE_VALUES = ["low", "medium", "high", "critical"];
export function normalizeSourceEventSeqs(sourceEventSeqs, allowedSourceEventSeqs) {
    if (!sourceEventSeqs || sourceEventSeqs.length === 0)
        return undefined;
    const allowedOrder = new Map();
    for (let i = 0; i < allowedSourceEventSeqs.length; i++)
        allowedOrder.set(allowedSourceEventSeqs[i], i);
    const seen = new Set();
    for (const value of sourceEventSeqs) {
        if (typeof value !== "number" || !Number.isSafeInteger(value) || !allowedOrder.has(value))
            return undefined;
        seen.add(value);
    }
    if (seen.size === 0)
        return undefined;
    return Array.from(seen).sort((a, b) => (allowedOrder.get(a) ?? 0) - (allowedOrder.get(b) ?? 0));
}
export async function runObserver(args) {
    const { ctx, target, priorReflections, priorObservations, chunk, allowedSourceEventSeqs, signal } = args;
    const conversation = chunk.trim();
    if (!conversation)
        return undefined;
    const accumulated = new Map();
    const recordObservations = {
        name: "record_observations",
        description: "Record a batch of new observations distilled from the conversation chunk. " +
            "Call this multiple times as you work through the chunk. Stop calling when coverage is complete, " +
            "then emit a short plain-text confirmation to end the run.",
        parameters: {
            type: "object",
            properties: {
                observations: {
                    type: "array",
                    description: "Batch of new observations. May be empty only if the tool is not called at all.",
                    items: {
                        type: "object",
                        properties: {
                            timestamp: {
                                type: "string",
                                description: "Observation time in local 'YYYY-MM-DD HH:MM' format.",
                            },
                            content: {
                                type: "string",
                                minLength: 1,
                                description: "Single-line plain prose. No markdown, no tags, no embedded timestamp.",
                            },
                            relevance: { type: "string", enum: [...RELEVANCE_VALUES] },
                            sourceEntrySeqs: {
                                type: "array",
                                minItems: 1,
                                items: { type: "integer" },
                                description: "Exact source event seqs from the chunk that directly support this observation. " +
                                    "Use only seqs shown in '[Source event seq: ...]' labels; never invent seqs.",
                            },
                        },
                        required: ["timestamp", "content", "relevance", "sourceEntrySeqs"],
                    },
                },
            },
            required: ["observations"],
        },
        execute: (raw) => {
            const params = (raw ?? {});
            let added = 0;
            let duplicates = 0;
            let rejected = 0;
            for (const proposal of params.observations ?? []) {
                const sourceEventSeqs = normalizeSourceEventSeqs(proposal.sourceEventSeqs, allowedSourceEventSeqs);
                if (!sourceEventSeqs || typeof proposal.content !== "string" || proposal.content.length === 0
                    || typeof proposal.timestamp !== "string" || proposal.timestamp.length === 0
                    || typeof proposal.relevance !== "string" || !RELEVANCE_VALUES.includes(proposal.relevance)) {
                    rejected++;
                    continue;
                }
                const content = truncateRecordContent(proposal.content);
                const id = hashId(content);
                if (accumulated.has(id)) {
                    duplicates++;
                    continue;
                }
                accumulated.set(id, {
                    id,
                    content,
                    timestamp: proposal.timestamp,
                    relevance: proposal.relevance,
                    sourceEntrySeqs: sourceEventSeqs,
                    tokenCount: observationLineTokenCount({
                        id,
                        timestamp: proposal.timestamp,
                        relevance: proposal.relevance,
                        content,
                    }),
                });
                added++;
            }
            const rejectedPart = rejected > 0
                ? ` ${rejected} observation${rejected === 1 ? "" : "s"} rejected for missing or invalid sourceEventSeqs.`
                : "";
            return (`Recorded ${added} new observation${added === 1 ? "" : "s"} ` +
                (duplicates > 0 ? `(${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped).` : ".") +
                rejectedPart +
                ` Total so far this run: ${accumulated.size}. ` +
                `Continue if the chunk still has uncovered content; otherwise stop calling the tool and emit a short plain-text confirmation.`);
        },
    };
    const now = nowTimestamp();
    const joinOrEmpty = (items) => (items.length ? items.join("\n") : "(none yet)");
    const userText = `Current local time: ${now}

CURRENT REFLECTIONS:
${joinOrEmpty(priorReflections)}

CURRENT OBSERVATIONS:
${joinOrEmpty(priorObservations)}

Compress the following new conversation chunk into observations by calling record_observations one or more times. Do not restate facts already present in current reflections or current observations. Prefer inline conversation timestamps when assigning times; fall back to the current local time above only if no message timestamp applies. Stop calling the tool and reply with a short plain-text confirmation once the chunk is fully covered.

NEW CONVERSATION CHUNK:
${conversation}`;
    await runWorkerLoop({
        ctx,
        stage: "observer",
        target,
        systemPrompt: OBSERVER_SYSTEM,
        userText,
        tools: [recordObservations],
        maxTurns: args.maxTurns,
        reasoningEffort: args.reasoningEffort,
        sessionId: args.sessionId,
        signal,
    });
    if (accumulated.size === 0)
        return undefined;
    return Array.from(accumulated.values());
}
//# sourceMappingURL=agent.js.map