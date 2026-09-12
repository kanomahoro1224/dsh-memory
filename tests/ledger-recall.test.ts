import { describe, expect, it } from "vitest";
import { recallMemorySources } from "../src/ledger/recall.js";
import {
	assistantEvent,
	makeObservation,
	makeReflection,
	observationsDropped,
	observationsRecorded,
	reflectionsRecorded,
	userEvent,
} from "./helpers/ledger.js";

const events = [
	userEvent(0, "hello", 1_000),
	assistantEvent(1, "hi there", 2_000),
	userEvent(2, "second question", 3_000),
];

describe("recallMemorySources", () => {
	it("recalls an observation with its source events", () => {
		const obs = makeObservation({ id: "aaaaaaaaaaaa", sourceEntrySeqs: [0, 1] });
		const records = [observationsRecorded([obs], 1)];

		const result = recallMemorySources(records, events, "aaaaaaaaaaaa");

		expect(result.status).toBe("found");
		if (result.status !== "found") return;
		expect(result.kind).toBe("observation");
		expect(result.observations).toHaveLength(1);
		expect(result.observations[0]?.status).toBe("active");
		expect(result.observations[0]?.sourceEvents.map((event) => event.seq)).toEqual([0, 1]);
		expect(result.sourceEvents.map((event) => event.seq)).toEqual([0, 1]);
		expect(result.partial).toBe(false);
	});

	it("expands reflection matches through supporting observations", () => {
		const obs = makeObservation({ id: "aaaaaaaaaaaa", sourceEntrySeqs: [2] });
		const ref = makeReflection({ id: "eeeeeeeeeeee", supportingObservationIds: ["aaaaaaaaaaaa"] });
		const records = [
			observationsRecorded([obs], 2),
			reflectionsRecorded([ref], 2),
		];

		const result = recallMemorySources(records, events, "eeeeeeeeeeee");

		expect(result.status).toBe("found");
		if (result.status !== "found") return;
		expect(result.kind).toBe("reflection");
		expect(result.reflections.map(({ reflection }) => reflection.id)).toEqual(["eeeeeeeeeeee"]);
		expect(result.observations.map((match) => match.observation.id)).toEqual(["aaaaaaaaaaaa"]);
	});

	it("marks dropped observations and missing supporting observations", () => {
		const obs = makeObservation({ id: "aaaaaaaaaaaa", sourceEntrySeqs: [0] });
		const ghost = makeReflection({ id: "eeeeeeeeeeee", supportingObservationIds: ["dddddddddddd"] });
		const records = [
			observationsRecorded([obs], 0),
			observationsDropped(["aaaaaaaaaaaa"], 1),
			reflectionsRecorded([ghost], 1),
		];

		const droppedResult = recallMemorySources(records, events, "aaaaaaaaaaaa");
		expect(droppedResult.status).toBe("found");
		if (droppedResult.status === "found") {
			expect(droppedResult.observations[0]?.status).toBe("dropped");
		}

		const reflectionResult = recallMemorySources(records, events, "eeeeeeeeeeee");
		expect(reflectionResult.status).toBe("found");
		if (reflectionResult.status === "found") {
			expect(reflectionResult.missingSupportingObservationIds).toEqual(["dddddddddddd"]);
			expect(reflectionResult.partial).toBe(true);
		}
	});

	it("returns not_found for unknown ids", () => {
		expect(recallMemorySources([], events, "aaaaaaaaaaaa").status).toBe("not_found");
	});

	it("flags missing source seqs as partial", () => {
		const obs = makeObservation({ id: "aaaaaaaaaaaa", sourceEntrySeqs: [0, 99] });
		const records = [observationsRecorded([obs], 0)];

		const result = recallMemorySources(records, events, "aaaaaaaaaaaa");

		expect(result.status).toBe("found");
		if (result.status !== "found") return;
		expect(result.missingSourceEntrySeqs).toEqual([99]);
		expect(result.partial).toBe(true);
		expect(result.observations[0]?.sourceEvents.map((event) => event.seq)).toEqual([0]);
	});
});
