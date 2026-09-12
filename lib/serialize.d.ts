import type { SessionEvent } from "@deepseek-ai/dsh-session";
export declare function nowTimestamp(): string;
export declare const MAX_RECORD_CONTENT_CHARS = 10000;
export declare function truncateRecordContent(content: string): string;
type ToolCallNames = Map<string, string>;
/** Render one surface message event the way the observer chunk presents source content. */
export declare function renderSourceEvent(event: SessionEvent, toolNames?: ToolCallNames): string | null;
export type SourceAddressedSerialization = {
    text: string;
    sourceEventSeqs: number[];
    estimatedTokens: number;
    truncatedSourceEventSeqs: number[];
};
export type SourceAddressedSerializationOptions = {
    /** Maximum estimated tokens in the final source-addressed text. */
    maxTokens?: number;
};
/**
 * Serialize complete source events up to the token budget. If the first event
 * alone exceeds the budget, include a clearly marked head/tail excerpt so one
 * pathological tool result cannot permanently block observation coverage.
 * The original session events are never modified and remain recallable by seq.
 */
export declare function serializeSourceAddressedEvents(events: SessionEvent[], options?: SourceAddressedSerializationOptions): SourceAddressedSerialization;
export declare function renderRecallSourceEvents(events: SessionEvent[]): string;
export {};
