import { describe, expect, it } from "vitest";
import { hashId } from "../src/ids.js";
import {
	estimateEventTokens,
	estimateStringTokens,
	observationLineTokenCount,
} from "../src/tokens.js";
import { normalizeSourceEventSeqs } from "../src/agents/observer/agent.js";
import { normalizeSupportingObservationIds } from "../src/agents/reflector/agent.js";
import { isLedgerRecord, isObservation, isReflection } from "../src/ledger/types.js";
import { makeObservation, makeReflection, observationsRecorded, userEvent } from "./helpers/ledger.js";

describe("hashId", () => {
	it("derives stable 12-hex ids from content", () => {
		expect(hashId("hello")).toMatch(/^[a-f0-9]{12}$/);
		expect(hashId("hello")).toBe(hashId("hello"));
		expect(hashId("hello")).not.toBe(hashId("world"));
	});
});

describe("token estimates", () => {
	it("estimates strings at chars/4", () => {
		expect(estimateStringTokens("x".repeat(40))).toBe(10);
	});

	it("counts the full rendered observation line", () => {
		const observation = makeObservation({ content: "x".repeat(40), id: "aaaaaaaaaaaa", timestamp: "2026-01-01 10:00", relevance: "high" });
		const bare = estimateStringTokens("x".repeat(40));
		const line = observationLineTokenCount(observation);
		expect(line).toBeGreaterThan(bare);
	});

	it("estimates surface message events from their text blocks", () => {
		expect(estimateEventTokens(userEvent(0, "x".repeat(40)))).toBe(10);
		expect(estimateEventTokens(userEvent(0, ""))).toBe(0);
	});
});

describe("worker input normalization", () => {
	it("keeps only allowed seqs, deduplicates, and orders by the chunk", () => {
		expect(normalizeSourceEventSeqs([3, 1, 3], [1, 2, 3])).toEqual([1, 3]);
		expect(normalizeSourceEventSeqs([4], [1, 2, 3])).toBeUndefined();
		expect(normalizeSourceEventSeqs([], [1])).toBeUndefined();
		expect(normalizeSourceEventSeqs(undefined, [1])).toBeUndefined();
		expect(normalizeSourceEventSeqs(["1"], [1])).toBeUndefined();
	});

	it("normalizes supporting observation ids against the allowed list", () => {
		expect(normalizeSupportingObservationIds(["b", "a", "a"], ["a", "b"])).toEqual(["a", "b"]);
		expect(normalizeSupportingObservationIds(["c"], ["a", "b"])).toBeUndefined();
	});
});

describe("record validators", () => {
	it("accepts well-formed records and rejects malformed ones", () => {
		expect(isObservation(makeObservation())).toBe(true);
		expect(isObservation({ ...makeObservation(), id: "nope" })).toBe(false);
		expect(isObservation({ ...makeObservation(), relevance: "urgent" })).toBe(false);

		expect(isReflection(makeReflection())).toBe(true);
		expect(isReflection({ ...makeReflection(), content: "two\nlines" })).toBe(false);

		const record = observationsRecorded([makeObservation()], 5);
		expect(isLedgerRecord(record)).toBe(true);
		expect(isLedgerRecord({ type: "om/compaction", data: { firstKeptSeq: 1 } })).toBe(false);
		expect(isLedgerRecord({ type: "om/unknown", data: {} })).toBe(false);
	});
});
