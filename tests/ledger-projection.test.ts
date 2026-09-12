import { describe, expect, it } from "vitest";
import {
	buildCompactionProjection,
	diffProjection,
	fullProjection,
	visibleProjection,
} from "../src/ledger/projection.js";
import {
	compactionRecord,
	makeObservation,
	makeReflection,
	observationsDropped,
	observationsRecorded,
	reflectionsRecorded,
} from "./helpers/ledger.js";

describe("fullProjection", () => {
	it("folds everything through the tip when no boundary is given", () => {
		const obs1 = makeObservation({ id: "aaaaaaaaaaaa", tokenCount: 10 });
		const ref1 = makeReflection({ id: "eeeeeeeeeeee" });
		const records = [
			observationsRecorded([obs1], 10),
			reflectionsRecorded([ref1], 10),
		];

		expect(fullProjection(records)).toEqual({ observations: [obs1], reflections: [ref1] });
	});

	it("bounds records by coverage seq through the given boundary", () => {
		const obs1 = makeObservation({ id: "aaaaaaaaaaaa" });
		const obs2 = makeObservation({ id: "bbbbbbbbbbbb" });
		const records = [
			observationsRecorded([obs1], 10),
			observationsRecorded([obs2], 20),
		];

		expect(fullProjection(records, 10).observations.map((observation) => observation.id)).toEqual(["aaaaaaaaaaaa"]);
		expect(fullProjection(records, 20).observations.map((observation) => observation.id)).toEqual(["aaaaaaaaaaaa", "bbbbbbbbbbbb"]);
	});

	it("ignores dangling coverage markers above any real seq by bounding from the tip", () => {
		const obs1 = makeObservation({ id: "aaaaaaaaaaaa" });
		const records = [observationsRecorded([obs1], 10)];
		expect(fullProjection(records, 5)).toEqual({ observations: [], reflections: [] });
	});
});

describe("visibleProjection", () => {
	it("is empty before the first compaction", () => {
		const records = [observationsRecorded([makeObservation()], 10)];
		expect(visibleProjection(records)).toEqual({ observations: [], reflections: [] });
	});

	it("returns the projection stored in the latest compaction record", () => {
		const obs1 = makeObservation({ id: "aaaaaaaaaaaa" });
		const ref1 = makeReflection({ id: "eeeeeeeeeeee" });
		const records = [
			observationsRecorded([obs1], 10),
			compactionRecord({
				firstKeptSeq: 20,
				shadowedThroughSeq: 19,
				fullFold: false,
				observations: [obs1],
				reflections: [ref1],
			}),
			observationsRecorded([makeObservation({ id: "bbbbbbbbbbbb" })], 30),
		];

		expect(visibleProjection(records)).toEqual({ observations: [obs1], reflections: [ref1] });
	});
});

describe("buildCompactionProjection", () => {
	it("first normal compaction includes observations by coverage and excludes maintenance streams", () => {
		const obs1 = makeObservation({ id: "aaaaaaaaaaaa", sourceEntrySeqs: [2], tokenCount: 10 });
		const ref1 = makeReflection({ id: "eeeeeeeeeeee", supportingObservationIds: ["aaaaaaaaaaaa"] });
		const records = [
			observationsRecorded([obs1], 2),
			reflectionsRecorded([ref1], 2),
			observationsDropped(["aaaaaaaaaaaa"], 2),
		];

		const result = buildCompactionProjection(records, 2, { observationsPoolMaxTokens: 100 });

		expect(result.fullFold).toBe(false);
		expect(result.observations.map((observation) => observation.id)).toEqual(["aaaaaaaaaaaa"]);
		expect(result.reflections).toEqual([]);
	});

	it("normal compaction keeps reflections and drops at the latest full-fold boundary", () => {
		const obs1 = makeObservation({ id: "aaaaaaaaaaaa", tokenCount: 5 });
		const obs2 = makeObservation({ id: "bbbbbbbbbbbb", tokenCount: 5 });
		const ref1 = makeReflection({ id: "eeeeeeeeeeee", supportingObservationIds: ["aaaaaaaaaaaa"] });
		const ref2 = makeReflection({ id: "ffffffffffff", supportingObservationIds: ["bbbbbbbbbbbb"] });
		const records = [
			observationsRecorded([obs1], 1),
			reflectionsRecorded([ref1], 1),
			compactionRecord({
				firstKeptSeq: 1,
				shadowedThroughSeq: 0,
				fullFold: true,
				observations: [obs1],
				reflections: [ref1],
			}),
			observationsRecorded([obs2], 2),
			reflectionsRecorded([ref2], 2),
			observationsDropped(["aaaaaaaaaaaa"], 2),
		];

		const result = buildCompactionProjection(records, 2, { observationsPoolMaxTokens: 100 });

		expect(result.fullFold).toBe(false);
		expect(result.observations.map((observation) => observation.id)).toEqual(["aaaaaaaaaaaa", "bbbbbbbbbbbb"]);
		expect(result.reflections.map((reflection) => reflection.id)).toEqual(["eeeeeeeeeeee"]);
	});

	it("full-fold projection applies reflections and drops through the current boundary by coverage", () => {
		const obs1 = makeObservation({ id: "aaaaaaaaaaaa", tokenCount: 80 });
		const obs2 = makeObservation({ id: "bbbbbbbbbbbb", tokenCount: 30 });
		const ref1 = makeReflection({ id: "eeeeeeeeeeee", supportingObservationIds: ["aaaaaaaaaaaa"] });
		const ref2 = makeReflection({ id: "ffffffffffff", supportingObservationIds: ["bbbbbbbbbbbb"] });
		const records = [
			observationsRecorded([obs1], 1),
			reflectionsRecorded([ref1], 1),
			compactionRecord({
				firstKeptSeq: 1,
				shadowedThroughSeq: 0,
				fullFold: true,
				observations: [obs1],
				reflections: [ref1],
			}),
			observationsRecorded([obs2], 2),
			reflectionsRecorded([ref2], 2),
			observationsDropped(["aaaaaaaaaaaa"], 2),
		];

		const result = buildCompactionProjection(records, 2, { observationsPoolMaxTokens: 100 });

		expect(result.fullFold).toBe(true);
		expect(result.observations.map((observation) => observation.id)).toEqual(["bbbbbbbbbbbb"]);
		expect(result.reflections.map((reflection) => reflection.id)).toEqual(["eeeeeeeeeeee", "ffffffffffff"]);
	});

	it("uses >= observationsPoolMaxTokens for full-fold pressure", () => {
		const obs1 = makeObservation({ id: "aaaaaaaaaaaa", tokenCount: 50 });
		const records = [observationsRecorded([obs1], 1)];

		expect(buildCompactionProjection(records, 1, { observationsPoolMaxTokens: 50 }).fullFold).toBe(true);
		expect(buildCompactionProjection(records, 1, { observationsPoolMaxTokens: 51 }).fullFold).toBe(false);
	});
});

describe("diffProjection", () => {
	it("reports visible/full drift", () => {
		const visible = { observations: [makeObservation({ id: "aaaaaaaaaaaa" })], reflections: [] };
		const full = {
			observations: [makeObservation({ id: "aaaaaaaaaaaa" }), makeObservation({ id: "bbbbbbbbbbbb" })],
			reflections: [makeReflection({ id: "eeeeeeeeeeee" })],
		};

		const drift = diffProjection(visible, full);

		expect(drift.observationsOnlyInFull.map((observation) => observation.id)).toEqual(["bbbbbbbbbbbb"]);
		expect(drift.reflectionsOnlyInFull.map((reflection) => reflection.id)).toEqual(["eeeeeeeeeeee"]);
		expect(drift.droppedOnlyInFull).toEqual([]);
	});
});
