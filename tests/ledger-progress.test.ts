import { describe, expect, it } from "vitest";
import { compactCheckpointSource } from "@deepseek-ai/dsh-compaction";
import {
	latestCompaction,
	latestCoverageSeq,
	latestFullFoldFirstKeptSeq,
	rawTokensSinceSurfaceAnchor,
	realTokensSinceAnchor,
} from "../src/ledger/progress.js";
import {
	assistantEvent,
	compactionRecord,
	makeObservation,
	makeReflection,
	observationsDropped,
	observationsRecorded,
	reflectionsRecorded,
	systemEvent,
	toolResultEvent,
	userEvent,
} from "./helpers/ledger.js";

// Each text block is 40 chars -> estimated at 10 tokens (chars/4).
const TEXT_40 = "x".repeat(40);

describe("latestCoverageSeq", () => {
	it("tracks the maximum coversUpToSeq per record type", () => {
		const records = [
			observationsRecorded([makeObservation({ id: "aaaaaaaaaaaa" })], 10),
			observationsRecorded([makeObservation({ id: "bbbbbbbbbbbb" })], 20),
			reflectionsRecorded([makeReflection({ id: "eeeeeeeeeeee" })], 15),
			observationsDropped(["aaaaaaaaaaaa"], 25),
		];

		expect(latestCoverageSeq(records, "om/observations/recorded")).toBe(20);
		expect(latestCoverageSeq(records, "om/reflections/recorded")).toBe(15);
	});

	it("returns undefined when no records of the type exist", () => {
		expect(latestCoverageSeq([], "om/observations/recorded")).toBeUndefined();
	});
});

describe("latestCompaction / latestFullFoldFirstKeptSeq", () => {
	it("returns the newest compaction record data", () => {
		const older = compactionRecord({ firstKeptSeq: 5, shadowedThroughSeq: 4, fullFold: false, observations: [], reflections: [] });
		const newer = compactionRecord({ firstKeptSeq: 9, shadowedThroughSeq: 8, fullFold: true, observations: [], reflections: [] });

		expect(latestCompaction([older, newer])).toEqual(newer.data);
		expect(latestFullFoldFirstKeptSeq([older, newer])).toBe(9);
	});

	it("skips non-full-fold compactions when looking for the maintenance boundary", () => {
		const partial = compactionRecord({ firstKeptSeq: 5, shadowedThroughSeq: 4, fullFold: false, observations: [], reflections: [] });
		expect(latestFullFoldFirstKeptSeq([partial])).toBeUndefined();
	});
});

describe("rawTokensSinceSurfaceAnchor", () => {
	it("counts source tokens after the anchor seq and skips system events", () => {
		const events = [
			userEvent(0, TEXT_40),
			systemEvent(1, TEXT_40),
			assistantEvent(2, TEXT_40),
			toolResultEvent(3, TEXT_40),
			userEvent(4, TEXT_40),
		];

		// Events after seq 1: three source events x 10 tokens.
		expect(rawTokensSinceSurfaceAnchor(events, 1)).toBe(30);
		// No anchor: everything counts except system.
		expect(rawTokensSinceSurfaceAnchor(events, undefined)).toBe(40);
		// Anchor at the tip: zero.
		expect(rawTokensSinceSurfaceAnchor(events, 4)).toBe(0);
	});

	it("stops at a compaction checkpoint user message regardless of the anchor", () => {
		const checkpoint = userEvent(3, TEXT_40, 1_000, compactCheckpointSource("cmp-1" as never));
		const events = [
			userEvent(0, TEXT_40),
			assistantEvent(1, TEXT_40),
			checkpoint,
			userEvent(4, TEXT_40),
		];

		// From the tip: only the event after the checkpoint counts.
		expect(rawTokensSinceSurfaceAnchor(events, undefined)).toBe(10);
		expect(rawTokensSinceSurfaceAnchor(events, 1)).toBe(10);
	});
});

describe("realTokensSinceAnchor", () => {
	it("measures metered growth since the anchor", () => {
		expect(realTokensSinceAnchor(1_500, 1_000)).toBe(500);
		expect(realTokensSinceAnchor(1_000, 1_000)).toBe(0);
	});

	it("is undefined without a baseline or when the basis changed (negative delta)", () => {
		expect(realTokensSinceAnchor(undefined, 1_000)).toBeUndefined();
		expect(realTokensSinceAnchor(1_000, undefined)).toBeUndefined();
		expect(realTokensSinceAnchor(500, 1_000)).toBeUndefined();
	});
});
