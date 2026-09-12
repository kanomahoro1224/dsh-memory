import type { SessionEvent } from "@deepseek-ai/dsh-session";
import type { ContentBlock, ToolCallId } from "@deepseek-ai/dsh-llm";
import {
	OM_COMPACTION,
	OM_OBSERVATIONS_DROPPED,
	OM_OBSERVATIONS_RECORDED,
	OM_REFLECTIONS_RECORDED,
	type CompactionData,
	type LedgerRecord,
	type Observation,
	type ObservationsDroppedData,
	type ObservationsRecordedData,
	type Reflection,
	type ReflectionsRecordedData,
} from "../../src/ledger/index.js";

let idCounter = 0;

export function makeObservation(overrides: Partial<Observation> = {}): Observation {
	idCounter++;
	return {
		id: overrides.id ?? `aaaa${String(idCounter).padStart(8, "0")}`,
		content: overrides.content ?? `observation ${idCounter}`,
		timestamp: overrides.timestamp ?? "2026-01-01 10:00",
		relevance: overrides.relevance ?? "medium",
		sourceEntrySeqs: overrides.sourceEntrySeqs ?? [1],
		tokenCount: overrides.tokenCount ?? 5,
	};
}

export function makeReflection(overrides: Partial<Reflection> = {}): Reflection {
	idCounter++;
	return {
		id: overrides.id ?? `eeee${String(idCounter).padStart(8, "0")}`,
		content: overrides.content ?? `reflection ${idCounter}`,
		supportingObservationIds: overrides.supportingObservationIds ?? ["aaaaaaaaaaaa"],
		tokenCount: overrides.tokenCount ?? 8,
	};
}

export function observationsRecorded(
	observations: Observation[],
	coversUpToSeq: number,
): LedgerRecord {
	const data: ObservationsRecordedData = { observations, coversUpToSeq };
	return { type: OM_OBSERVATIONS_RECORDED, data };
}

export function reflectionsRecorded(
	reflections: Reflection[],
	coversUpToSeq: number,
): LedgerRecord {
	const data: ReflectionsRecordedData = { reflections, coversUpToSeq };
	return { type: OM_REFLECTIONS_RECORDED, data };
}

export function observationsDropped(observationIds: string[], coversUpToSeq: number): LedgerRecord {
	const data: ObservationsDroppedData = { observationIds, coversUpToSeq };
	return { type: OM_OBSERVATIONS_DROPPED, data };
}

export function compactionRecord(data: CompactionData): LedgerRecord {
	return { type: OM_COMPACTION, data };
}

/** A user message surface event with text content; token estimates are predictable (chars/4). */
export function userEvent(seq: number, text: string, time = 1_000, source: unknown = { kind: "user" }): SessionEvent {
	const data = {
		id: `user-${seq}`,
		role: "user",
		content: [{ type: "text", text }] satisfies ContentBlock[],
		source,
	};
	return { type: "user/message", seq, time, data } as unknown as SessionEvent;
}

export function assistantEvent(seq: number, text: string, time = 1_000): SessionEvent {
	const data = {
		message: {
			id: `assistant-${seq}`,
			role: "assistant",
			content: [{ type: "text", text }] satisfies ContentBlock[],
			source: { kind: "model" },
		},
	};
	return { type: "assistant/message", seq, time, data } as unknown as SessionEvent;
}

export function toolResultEvent(seq: number, text: string, time = 1_000): SessionEvent {
	const data = {
		message: {
			id: `tool-${seq}`,
			role: "user",
			content: [{
				type: "tool-result",
				toolCallId: `call-${seq}` as ToolCallId,
				content: [{ type: "text", text }] satisfies ContentBlock[],
			}] satisfies ContentBlock[],
			source: { kind: "tool" },
		},
	};
	return { type: "tool/result", seq, time, data } as unknown as SessionEvent;
}

export function systemEvent(seq: number, text: string, time = 1_000): SessionEvent {
	const data = {
		message: {
			id: `system-${seq}`,
			role: "system",
			content: [{ type: "text", text }] satisfies ContentBlock[],
			source: { kind: "system" },
		},
	};
	return { type: "system/message", seq, time, data } as unknown as SessionEvent;
}
