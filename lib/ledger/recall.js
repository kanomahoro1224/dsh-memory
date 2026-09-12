import { isObservationsDroppedData, isObservationsRecordedData, isReflectionsRecordedData, OM_OBSERVATIONS_DROPPED, OM_OBSERVATIONS_RECORDED, OM_REFLECTIONS_RECORDED, } from "./types.js";
function uniqueBySeq(events) {
    const seen = new Set();
    const result = [];
    for (const event of events) {
        if (seen.has(event.seq))
            continue;
        seen.add(event.seq);
        result.push(event);
    }
    return result;
}
function uniqueStrings(values) {
    return Array.from(new Set(values));
}
function uniqueSeqs(values) {
    return Array.from(new Set(values));
}
function indexLedger(records) {
    const observations = [];
    const reflections = [];
    const droppedIds = new Set();
    for (let recordIndex = 0; recordIndex < records.length; recordIndex++) {
        const record = records[recordIndex];
        if (!record)
            continue;
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
            for (const id of record.data.observationIds)
                droppedIds.add(id);
        }
    }
    return { observations, reflections, droppedIds };
}
function resolveObservationSources(eventsBySeq, observation, location, droppedIds) {
    const sourceEntrySeqs = uniqueSeqs(observation.sourceEntrySeqs);
    const sourceEvents = [];
    const missingSourceEntrySeqs = [];
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
function notFound(memoryId) {
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
export function recallMemorySources(records, events, memoryId) {
    const eventsBySeq = new Map(events.map((event) => [event.seq, event]));
    const { observations: indexedObservations, reflections: indexedReflections, droppedIds } = indexLedger(records);
    const directObservationMatches = indexedObservations.filter(({ observation }) => observation.id === memoryId);
    const reflectionMatches = indexedReflections.filter(({ reflection }) => reflection.id === memoryId);
    if (directObservationMatches.length === 0 && reflectionMatches.length === 0)
        return notFound(memoryId);
    const observationsById = new Map();
    for (const indexed of indexedObservations) {
        if (!observationsById.has(indexed.observation.id))
            observationsById.set(indexed.observation.id, indexed);
    }
    const recalledByKey = new Map();
    const missingSupportingObservationIds = [];
    function addObservation(indexed) {
        const key = `${indexed.recordIndex}:${indexed.observationRecordIndex}`;
        if (recalledByKey.has(key))
            return;
        recalledByKey.set(key, resolveObservationSources(eventsBySeq, indexed.observation, indexed, droppedIds));
    }
    for (const match of directObservationMatches)
        addObservation(match);
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
    const recalledReflections = reflectionMatches.map(({ reflection, recordIndex, reflectionRecordIndex }) => ({
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
//# sourceMappingURL=recall.js.map