import { isObservationsDroppedData, isObservationsRecordedData, isReflectionsRecordedData, OM_OBSERVATIONS_DROPPED, OM_OBSERVATIONS_RECORDED, OM_REFLECTIONS_RECORDED, } from "./types.js";
/**
 * Fold valid ledger records from the log root through the target index.
 *
 * Unknown record types, invalid shapes, and future records are ignored.
 * Observations and reflections use first-valid-record-wins semantics. Drops
 * are tombstones and are retained even when the dropped id is unknown at the
 * time of folding.
 */
export function foldLedger(records, options = {}) {
    const observationsById = new Map();
    const reflectionsById = new Map();
    const droppedObservationIds = new Set();
    const endIdx = options.upToIndex === undefined ? records.length - 1 : Math.min(options.upToIndex, records.length - 1);
    for (let i = 0; i <= endIdx; i++) {
        const record = records[i];
        if (!record)
            continue;
        if (record.type === OM_OBSERVATIONS_RECORDED) {
            if (!isObservationsRecordedData(record.data))
                continue;
            for (const observation of record.data.observations) {
                if (!observationsById.has(observation.id)) {
                    observationsById.set(observation.id, observation);
                }
            }
            continue;
        }
        if (record.type === OM_REFLECTIONS_RECORDED) {
            if (!isReflectionsRecordedData(record.data))
                continue;
            for (const reflection of record.data.reflections) {
                if (!reflectionsById.has(reflection.id)) {
                    reflectionsById.set(reflection.id, reflection);
                }
            }
            continue;
        }
        if (record.type === OM_OBSERVATIONS_DROPPED) {
            if (!isObservationsDroppedData(record.data))
                continue;
            for (const observationId of record.data.observationIds) {
                droppedObservationIds.add(observationId);
            }
        }
    }
    const observations = Array.from(observationsById.values());
    const activeObservations = observations.filter((observation) => !droppedObservationIds.has(observation.id));
    const reflections = Array.from(reflectionsById.values());
    return {
        observations,
        activeObservations,
        droppedObservationIds,
        reflections,
        observationsById,
        reflectionsById,
    };
}
//# sourceMappingURL=fold.js.map