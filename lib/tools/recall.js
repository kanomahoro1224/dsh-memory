import { cwdOf } from "../consolidation-trigger.js";
import { loadLedger, recallMemorySources, } from "../ledger/index.js";
import { renderRecallSourceEvents } from "../serialize.js";
export const RECALL_TOOL_NAME = "recall";
const MEMORY_ID_PATTERN = /^[a-f0-9]{12}$/;
function observationLine(observation, status) {
    const dropped = status === "dropped" ? " [dropped]" : "";
    return `[${observation.id}]${dropped} ${observation.timestamp} [${observation.relevance}] ${observation.content}`;
}
function directObservationMatches(result) {
    return result.observations.filter((match) => match.observation.id === result.memoryId);
}
function renderObservationOnlyText(result) {
    const sections = [];
    if (result.collision)
        sections.push(`Memory id ${result.memoryId} matched multiple observations; returning all matching source results.`);
    for (const match of directObservationMatches(result)) {
        if (match.status === "dropped")
            sections.push(`Observation ${match.observation.id} is dropped from active memory but remains recallable.`);
        if (match.missingSourceEntrySeqs.length > 0) {
            sections.push(`Observation ${match.observation.id} has source events associated, but some are unavailable in the session log (missing seqs: ${match.missingSourceEntrySeqs.join(", ")}).`);
            continue;
        }
        if (match.sourceEvents.length === 0) {
            sections.push(`Observation ${match.observation.id} has no source events associated with it.`);
            continue;
        }
        const sourceText = renderRecallSourceEvents(match.sourceEvents);
        sections.push(sourceText.trim() ? sourceText : `Observation ${match.observation.id} has source events associated, but they rendered no text content.`);
    }
    return sections.join("\n\n");
}
function renderMemoryText(result) {
    const sections = [];
    if (result.collision)
        sections.push(`Memory id ${result.memoryId} matched multiple observations/reflections; returning all available evidence.`);
    if (result.reflections.length > 0) {
        sections.push(`Reflections:\n${result.reflections.map(({ reflection }) => `[${reflection.id}] ${reflection.content}`).join("\n")}`);
    }
    if (result.observations.length > 0) {
        sections.push(`Observations:\n${result.observations.map((match) => observationLine(match.observation, match.status)).join("\n")}`);
    }
    if (result.missingSupportingObservationIds.length > 0) {
        sections.push(`Unavailable supporting observations:\n${result.missingSupportingObservationIds.map((id) => `- ${id}`).join("\n")}`);
    }
    if (result.missingSourceEntrySeqs.length > 0) {
        sections.push(`Unavailable source events (missing seqs): ${result.missingSourceEntrySeqs.join(", ")}`);
    }
    const sourceText = renderRecallSourceEvents(result.sourceEvents);
    if (sourceText.trim())
        sections.push(`Sources:\n${sourceText}`);
    if (sections.length === 0)
        sections.push(`Memory ${result.memoryId} was found, but no source evidence rendered.`);
    return sections.join("\n\n");
}
function foundValue(result) {
    return {
        status: result.partial ? "partial" : "ok",
        memoryId: result.memoryId,
        collision: result.collision,
        partial: result.partial,
        reflectionIds: result.reflections.map(({ reflection }) => reflection.id),
        observationIds: result.observations.map((match) => match.observation.id),
        missingSourceSeqs: result.missingSourceEntrySeqs,
        text: result.kind === "observation" ? renderObservationOnlyText(result) : renderMemoryText(result),
    };
}
export function registerRecallTool(ctx) {
    const tool = {
        name: RECALL_TOOL_NAME,
        description: "Recover exact evidence and source context behind a compacted observational-memory observation or reflection id. " +
            "Use when compressed memory is important and original source context is needed before acting.",
        parameters: {
            type: "object",
            properties: {
                id: {
                    type: "string",
                    pattern: "^[a-f0-9]{12}$",
                    description: "12-character lowercase hex observation or reflection id shown in compacted memory or an om-view listing. " +
                        "Must be a specific id; this tool does not search by topic.",
                },
            },
            required: ["id"],
        },
        output: {
            schema: {
                type: "object",
                properties: {
                    status: { type: "string", description: "ok, partial, invalid_id, or not_found" },
                    memoryId: { type: "string" },
                    collision: { type: "boolean" },
                    partial: { type: "boolean" },
                    reflectionIds: { type: "array", items: { type: "string" } },
                    observationIds: { type: "array", items: { type: "string" } },
                    missingSourceSeqs: { type: "array", items: { type: "integer" } },
                    text: { type: "string", description: "Model-facing rendering of the recalled evidence" },
                },
                required: ["status", "memoryId", "text"],
            },
            render: (_args, value) => {
                const text = value.text;
                return [{
                        type: "text",
                        text: typeof text === "string" && text.length > 0 ? text : "recall returned no content",
                    }];
            },
        },
        execute: async (args, exec) => {
            const memoryId = typeof args.id === "string" ? args.id : "";
            if (!MEMORY_ID_PATTERN.test(memoryId)) {
                return {
                    status: "invalid_id",
                    memoryId,
                    collision: false,
                    partial: false,
                    reflectionIds: [],
                    observationIds: [],
                    missingSourceSeqs: [],
                    text: `Memory id must be 12 lowercase hex characters. Received: ${memoryId}`,
                };
            }
            const agent = exec.agent;
            if (!agent) {
                return {
                    status: "no_agent",
                    memoryId,
                    collision: false,
                    partial: false,
                    reflectionIds: [],
                    observationIds: [],
                    missingSourceSeqs: [],
                    text: "recall requires an agent execution context.",
                };
            }
            const ledger = loadLedger(cwdOf(agent), agent.session.id);
            const events = agent.session.snapshotEvents();
            const result = recallMemorySources(ledger.records, events, memoryId);
            if (result.status === "not_found") {
                return {
                    status: "not_found",
                    memoryId,
                    collision: false,
                    partial: false,
                    reflectionIds: [],
                    observationIds: [],
                    missingSourceSeqs: [],
                    text: `No observation or reflection with id ${memoryId} was found in this session's memory.`,
                };
            }
            return foundValue(result);
        },
    };
    ctx.tools.register(tool);
}
//# sourceMappingURL=recall.js.map