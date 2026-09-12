import { estimateStringTokens } from "./tokens.js";
function pad(n) {
    return n.toString().padStart(2, "0");
}
function fmtLocal(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function formatTimestamp(v) {
    if (v === undefined)
        return "????-??-?? ??:??";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? "????-??-?? ??:??" : fmtLocal(d);
}
export function nowTimestamp() {
    return fmtLocal(new Date());
}
export const MAX_RECORD_CONTENT_CHARS = 10_000;
export function truncateRecordContent(content) {
    if (content.length <= MAX_RECORD_CONTENT_CHARS)
        return content;
    const head = content.slice(0, MAX_RECORD_CONTENT_CHARS);
    const dropped = content.length - MAX_RECORD_CONTENT_CHARS;
    return `${head} … [truncated ${dropped} chars]`;
}
function textBlocksText(blocks) {
    return blocks
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n");
}
function textAndPlaceholders(blocks) {
    const parts = [];
    for (const block of blocks) {
        if (block.type === "text") {
            parts.push(block.text);
            continue;
        }
        if (block.type === "reasoning") {
            parts.push(`[thinking: ${block.text}]`);
            continue;
        }
        if (block.type === "tool-call") {
            parts.push(`[${block.name}(${block.arguments})]`);
            continue;
        }
        if (block.type === "tool-result") {
            parts.push(`[tool result ${block.toolCallId}: ${textBlocksText(block.content)}]`);
            continue;
        }
        parts.push("[non-text content omitted]");
    }
    return parts.join("\n");
}
function eventRoleLabel(event, toolNames) {
    const time = formatTimestamp(event.time);
    if (event.type === "user/message") {
        const message = event.data;
        const content = Array.isArray(message.content) ? message.content : [];
        const toolResult = content.find((block) => block.type === "tool-result");
        if (toolResult && content.every((block) => block.type === "tool-result")) {
            const name = toolNames.get(toolResult.toolCallId);
            return `[Tool result for ${name ?? "tool"} @ ${time}]`;
        }
        return `[User @ ${time}]`;
    }
    if (event.type === "assistant/message") {
        const message = event.data.message;
        const content = Array.isArray(message?.content) ? message.content : [];
        for (const block of content) {
            if (block.type === "tool-call")
                toolNames.set(block.id, block.name);
        }
        return `[Assistant @ ${time}]`;
    }
    if (event.type === "tool/result") {
        const message = event.data.message;
        const content = Array.isArray(message?.content) ? message.content : [];
        const toolResult = content.find((block) => block.type === "tool-result");
        if (toolResult) {
            const name = toolNames.get(toolResult.toolCallId);
            return `[Tool result for ${name ?? "tool"} @ ${time}]`;
        }
        return `[Tool result @ ${time}]`;
    }
    return null;
}
function eventBody(event) {
    if (event.type === "user/message") {
        const message = event.data;
        const content = Array.isArray(message.content) ? message.content : [];
        const isPureToolResult = content.length > 0 && content.every((block) => block.type === "tool-result");
        if (isPureToolResult) {
            const text = content
                .flatMap((block) => (block.type === "tool-result" ? textBlocksText(block.content) : ""))
                .filter(Boolean)
                .join("\n");
            return text || null;
        }
        const text = textBlocksText(content);
        return text || null;
    }
    if (event.type === "assistant/message") {
        const message = event.data.message;
        const content = Array.isArray(message?.content) ? message.content : [];
        const body = textAndPlaceholders(content)
            .split("\n")
            .filter(Boolean)
            .join("\n");
        return body || null;
    }
    if (event.type === "tool/result") {
        const message = event.data.message;
        const content = Array.isArray(message?.content) ? message.content : [];
        const text = content
            .flatMap((block) => (block.type === "tool-result" ? textBlocksText(block.content) : block.type === "text" ? block.text : ""))
            .filter(Boolean)
            .join("\n");
        return text || null;
    }
    return null;
}
/** Render one surface message event the way the observer chunk presents source content. */
export function renderSourceEvent(event, toolNames = new Map()) {
    const label = eventRoleLabel(event, toolNames);
    if (!label)
        return null;
    const body = eventBody(event);
    if (!body || !body.trim())
        return null;
    return `${label}: ${body}`;
}
const SOURCE_OMISSION_MARKER = "\n\n[… middle omitted: source exceeds observer input budget; original source remains in the session history …]\n\n";
function truncateSourceBlockToTokenBudget(label, rendered, maxTokens) {
    const required = `${label}\n${SOURCE_OMISSION_MARKER}`;
    if (estimateStringTokens(required) > maxTokens)
        return undefined;
    const full = `${label}\n${rendered}`;
    if (estimateStringTokens(full) <= maxTokens)
        return full;
    const maxChars = Math.max(1, maxTokens * 4);
    const fixed = `${label}\n${SOURCE_OMISSION_MARKER}`;
    const retainedChars = maxChars - fixed.length;
    const headChars = Math.ceil(retainedChars / 2);
    const tailChars = retainedChars - headChars;
    return `${label}\n${rendered.slice(0, headChars)}${SOURCE_OMISSION_MARKER}${tailChars > 0 ? rendered.slice(-tailChars) : ""}`;
}
/**
 * Serialize complete source events up to the token budget. If the first event
 * alone exceeds the budget, include a clearly marked head/tail excerpt so one
 * pathological tool result cannot permanently block observation coverage.
 * The original session events are never modified and remain recallable by seq.
 */
export function serializeSourceAddressedEvents(events, options = {}) {
    const toolNames = new Map();
    const blocks = [];
    const sourceEventSeqs = [];
    const truncatedSourceEventSeqs = [];
    let estimatedTokens = 0;
    for (const event of events) {
        if (event.type !== "user/message" && event.type !== "assistant/message" && event.type !== "tool/result")
            continue;
        const rendered = renderSourceEvent(event, toolNames);
        if (!rendered || !rendered.trim())
            continue;
        const label = `[Source event seq: ${event.seq}]`;
        const block = `${label}\n${rendered}`;
        const separator = blocks.length > 0 ? "\n\n" : "";
        const blockTokens = estimateStringTokens(`${separator}${block}`);
        const maxTokens = options.maxTokens;
        if (maxTokens !== undefined && estimatedTokens + blockTokens > maxTokens) {
            if (blocks.length > 0)
                break;
            const excerpt = truncateSourceBlockToTokenBudget(label, rendered, maxTokens);
            if (!excerpt)
                break;
            blocks.push(excerpt);
            sourceEventSeqs.push(event.seq);
            truncatedSourceEventSeqs.push(event.seq);
            estimatedTokens = estimateStringTokens(excerpt);
            break;
        }
        blocks.push(block);
        sourceEventSeqs.push(event.seq);
        estimatedTokens += blockTokens;
    }
    const text = blocks.join("\n\n");
    return { text, sourceEventSeqs, estimatedTokens: estimateStringTokens(text), truncatedSourceEventSeqs };
}
function renderRecallEvent(event, toolNames) {
    const label = eventRoleLabel(event, toolNames);
    if (!label)
        return null;
    const body = eventBody(event);
    if (!body || !body.trim())
        return null;
    return `${label}: ${body}`;
}
export function renderRecallSourceEvents(events) {
    const toolNames = new Map();
    return events
        .map((event) => renderRecallEvent(event, toolNames))
        .filter((block) => block !== null && block.trim().length > 0)
        .join("\n\n");
}
//# sourceMappingURL=serialize.js.map