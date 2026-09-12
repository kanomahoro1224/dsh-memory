import type { SessionEvent } from "@deepseek-ai/dsh-session";
import {
	isObservationsDroppedData,
	isObservationsRecordedData,
	isReflectionsRecordedData,
	OM_OBSERVATIONS_DROPPED,
	OM_OBSERVATIONS_RECORDED,
	OM_REFLECTIONS_RECORDED,
	type LedgerRecord,
	type Observation,
	type Reflection,
} from "./types.js";

export type { Observation, Reflection };

type ObservationLedgerLocation = {
	recordIndex: number;
	observationRecordIndex: number;
};

type ReflectionLedgerLocation = {
	recordIndex: number;
	reflectionRecordIndex: number;
};

export type RecalledObservation = {
	observation: Observation;
	observationRecordIndex: number;
	observationRecordPosition: number;
	status: "active" | "dropped";
	sourceEntrySeqs: number[];
	sourceEvents: SessionEvent[];
	missingSourceEntrySeqs: number[];
};

export type RecalledReflection = {
	reflection: Reflection;
	reflectionRecordPosition: number;
	reflectionRecordIndex: number;
};

export type RecallResult =
	| {
			status: "not_found";
			memoryId: string;
			kind: undefined;
			reflections: [];
			observations: [];
			sourceEvents: [];
			missingSourceEntrySeqs: [];
			missingSupportingObservationIds: [];
			collision: false;
			partial: false;
	  }
	| {
			status: "found";
			memoryId: string;
			kind: "observation" | "reflection" | "mixed";
			reflections: RecalledReflection[];
			observations: RecalledObservation[];
			sourceEvents: SessionEvent[];
			missingSourceEntrySeqs: number[];
			missingSupportingObservationIds: string[];
			collision: boolean;
			partial: boolean;
	  };

type IndexedObservation = ObservationLedgerLocation & { observation: Observation };
type IndexedReflection = ReflectionLedgerLocation & { reflection: Reflection };

function uniqueBySeq(events: SessionEvent[]): SessionEvent[] {
	const seen = new Set<number>();
	const result: SessionEvent[] = [];
	for (const event of events) {
		if (seen.has(event.seq)) continue;
		seen.add(event.seq);
		result.push(event);
	}
	return result;
}

function uniqueStrings(values: string[]): string[] {
	return Array.from(new Set(values));
}

function uniqueSeqs(values: number[]): number[] {
	return Array.from(new Set(values));
}

function indexLedger(records: LedgerRecord[]): {
	observations: IndexedObservation[];
	reflections: IndexedReflection[];
	droppedIds: Set<string>;
} {
	const observations: IndexedObservation[] = [];
	const reflections: IndexedReflection[] = [];
	const droppedIds = new Set<string>();

	for (let recordIndex = 0; recordIndex < records.length; recordIndex++) {
		const record = records[recordIndex];
		if (!record) continue;
		if (record.type === OM_OBSERVATIONS_RECORDED && isObservationsRecordedData(record.data)) {
			record.data.observations.forEach((observation, observationRecordIndex) => {
				observations.push({ observation, recordIndex, observationRecordIndex });
			});
			continue;
		}
		if (record.type === OM_REFLECTIONS_RECORDED && isReflectionsRecordedData(record.data)) {
			record.data.reflections.forEach((reflection, reflectionRecordIndex) => {
				reflections.push({ reflection, recordIndex, reflectionRecordIndex });
			});
			continue;
		}
		if (record.type === OM_OBSERVATIONS_DROPPED && isObservationsDroppedData(record.data)) {
			for (const id of record.data.observationIds) droppedIds.add(id);
		}
	}

	return { observations, reflections, droppedIds };
}

function resolveObservationSources(
	eventsBySeq: Map<number, SessionEvent>,
	observation: Observation,
	location: ObservationLedgerLocation,
	droppedIds: Set<string>,
): RecalledObservation {
	const sourceEntrySeqs = uniqueSeqs(observation.sourceEntrySeqs);
	const sourceEvents: SessionEvent[] = [];
	const missingSourceEntrySeqs: number[] = [];

	for (const seq of sourceEntrySeqs) {
		const event = eventsBySeq.get(seq);
		if (!event) {
			missingSourceEntrySeqs.push(seq);
			continue;
		}
		sourceEvents.push(event);
	}

	return {
		observation,
		observationRecordIndex: location.observationRecordIndex,
		observationRecordPosition: location.recordIndex,
		status: droppedIds.has(observation.id) ? "dropped" : "active",
		sourceEntrySeqs,
		sourceEvents,
		missingSourceEntrySeqs,
	};
}

function notFound(memoryId: string): RecallResult {
	return {
		status: "not_found",
		memoryId,
		kind: undefined,
		reflections: [],
		observations: [],
		sourceEvents: [],
		missingSourceEntrySeqs: [],
		missingSupportingObservationIds: [],
		collision: false,
		partial: false,
	};
}

/**
 * Recall the observations and reflections matching one memory id, together
 * with their supporting source session events.
 */
export function recallMemorySources(records: LedgerRecord[], events: readonly SessionEvent[], memoryId: string): RecallResult {
	const eventsBySeq = new Map(events.map((event) => [event.seq, event]));
	const { observations: indexedObservations, reflections: indexedReflections, droppedIds } = indexLedger(records);
	const directObservationMatches = indexedObservations.filter(({ observation }) => observation.id === memoryId);
	const reflectionMatches = indexedReflections.filter(({ reflection }) => reflection.id === memoryId);

	if (directObservationMatches.length === 0 && reflectionMatches.length === 0) return notFound(memoryId);

	const observationsById = new Map<string, IndexedObservation>();
	for (const indexed of indexedObservations) {
		if (!observationsById.has(indexed.observation.id)) observationsById.set(indexed.observation.id, indexed);
	}

	const recalledByKey = new Map<string, RecalledObservation>();
	const missingSupportingObservationIds: string[] = [];

	function addObservation(indexed: IndexedObservation): void {
		const key = `${indexed.recordIndex}:${indexed.observationRecordIndex}`;
		if (recalledByKey.has(key)) return;
		recalledByKey.set(
			key,
			resolveObservationSources(eventsBySeq, indexed.observation, indexed, droppedIds),
		);
	}

	for (const match of directObservationMatches) addObservation(match);

	for (const { reflection } of reflectionMatches) {
		for (const observationId of uniqueStrings(reflection.supportingObservationIds)) {
			const indexed = observationsById.get(observationId);
			if (!indexed) {
				missingSupportingObservationIds.push(observationId);
				continue;
			}
			addObservation(indexed);
		}
	}

	const recalledObservations = Array.from(recalledByKey.values());
	const recalledReflections: RecalledReflection[] = reflectionMatches.map(({ reflection, recordIndex, reflectionRecordIndex }) => ({
		reflection,
		reflectionRecordPosition: recordIndex,
		reflectionRecordIndex,
	}));
	const sourceEvents = uniqueBySeq(recalledObservations.flatMap((match) => match.sourceEvents));
	const missingSourceEntrySeqs = uniqueSeqs(recalledObservations.flatMap((match) => match.missingSourceEntrySeqs));
	const uniqueMissingSupportingObservationIds = uniqueStrings(missingSupportingObservationIds);
	const matchCount = directObservationMatches.length + reflectionMatches.length;

	return {
		status: "found",
		memoryId,
		kind: directObservationMatches.length > 0 && reflectionMatches.length > 0
			? "mixed"
			: reflectionMatches.length > 0
				? "reflection"
				: "observation",
		reflections: recalledReflections,
		observations: recalledObservations,
		sourceEvents,
		missingSourceEntrySeqs,
		missingSupportingObservationIds: uniqueMissingSupportingObservationIds,
		collision: matchCount > 1,
		partial: missingSourceEntrySeqs.length > 0 || uniqueMissingSupportingObservationIds.length > 0,
	};
}
