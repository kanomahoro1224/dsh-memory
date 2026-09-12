import { describe, expect, it } from "vitest";
import type { LedgerRecord } from "../src/ledger/types.js";
import { foldLedger } from "../src/ledger/fold.js";
import {
	makeObservation,
	makeReflection,
	observationsDropped,
	observationsRecorded,
	reflectionsRecorded,
} from "./helpers/ledger.js";

describe("foldLedger", () => {
	it("folds observations and reflections with first-valid-record-wins semantics", () => {
		const obs1 = makeObservation({ id: "aaaaaaaaaaaa", content: "first" });
		const obs2 = makeObservation({ id: "aaaaaaaaaaaa", content: "second" });
		const ref1 = makeReflection({ id: "eeeeeeeeeeee", content: "first" });
		const ref2 = makeReflection({ id: "eeeeeeeeeeee", content: "second" });
		const records = [
			observationsRecorded([obs1], 10),
			observationsRecorded([obs2], 12),
			reflectionsRecorded([ref1], 10),
			reflectionsRecorded([ref2], 12),
		];

		const folded = foldLedger(records);

		expect(folded.observations).toEqual([obs1]);
		expect(folded.reflections).toEqual([ref1]);
	});

	it("treats drops as tombstones even for unknown ids", () => {
		const obs1 = makeObservation({ id: "aaaaaaaaaaaa" });
		const records = [
			observationsRecorded([obs1], 10),
			observationsDropped(["bbbbbbbbbbbb"], 12),
		];

		const folded = foldLedger(records);

		expect(folded.activeObservations).toEqual([obs1]);
		expect(folded.observations).toEqual([obs1]);
		expect(folded.droppedObservationIds).toEqual(new Set(["bbbbbbbbbbbb"]));
	});

	it("ignores invalid records and respects upToIndex", () => {
		const obs1 = makeObservation({ id: "aaaaaaaaaaaa" });
		const obs2 = makeObservation({ id: "bbbbbbbbbbbb" });
		const records: LedgerRecord[] = [
			observationsRecorded([obs1], 10),
			{ type: "om/unknown", data: {} } as unknown as LedgerRecord,
			observationsRecorded([{ ...obs2, id: "nope" }], 12), // invalid id shape
			observationsRecorded([obs2], 14),
		];

		expect(foldLedger(records, { upToIndex: 0 }).observations).toEqual([obs1]);
		const folded = foldLedger(records);
		expect(folded.observations.map((observation) => observation.id)).toEqual(["aaaaaaaaaaaa", "bbbbbbbbbbbb"]);
	});
});
