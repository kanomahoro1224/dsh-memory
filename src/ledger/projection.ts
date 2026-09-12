import {
	OM_COMPACTION,
	OM_OBSERVATIONS_DROPPED,
	OM_OBSERVATIONS_RECORDED,
	OM_REFLECTIONS_RECORDED,
	isCompactionData,
	isObservationsDroppedData,
	isObservationsRecordedData,
	isReflectionsRecordedData,
	type LedgerRecord,
	type Observation,
	type Reflection,
} from "./types.js";
import { latestFullFoldFirstKeptSeq } from "./progress.js";

export type Projection = {
	observations: Observation[];
	reflections: Reflection[];
};

export type ProjectionDiff = {
	observationsOnlyInFull: Observation[];
	reflectionsOnlyInFull: Reflection[];
	droppedOnlyInFull: Observation[];
};

export type CompactionProjectionConfig = {
	observationsPoolMaxTokens: number;
};

export type CompactionProjection = Projection & {
	fullFold: boolean;
};

function coverageSeq(record: LedgerRecord): number {
	if (record.type === OM_OBSERVATIONS_RECORDED && isObservationsRecordedData(record.data)) return record.data.coversUpToSeq;
	if (record.type === OM_REFLECTIONS_RECORDED && isReflectionsRecordedData(record.data)) return record.data.coversUpToSeq;
	if (record.type === OM_OBSERVATIONS_DROPPED && isObservationsDroppedData(record.data)) return record.data.coversUpToSeq;
	return -1;
}

type ProjectionBoundary = number | undefined;

function foldProjection(records: LedgerRecord[], boundaries: {
	observations: ProjectionBoundary;
	reflections: ProjectionBoundary;
	drops: ProjectionBoundary;
}): Projection {
	const observations: Observation[] = [];
	const reflections: Reflection[] = [];
	const observationsById = new Set<string>();
	const reflectionsById = new Set<string>();
	const droppedObservationIds = new Set<string>();

	// An undefined boundary is the tip: every record qualifies (pi's tipBoundary).
	const covered = (record: LedgerRecord, boundary: ProjectionBoundary): boolean =>
		boundary === undefined || (coverageSeq(record) >= 0 && coverageSeq(record) <= boundary);

	for (const record of records) {
		if (record.type === OM_OBSERVATIONS_RECORDED && isObservationsRecordedData(record.data) && covered(record, boundaries.observations)) {
			for (const observation of record.data.observations) {
				if (observationsById.has(observation.id)) continue;
				observationsById.add(observation.id);
				observations.push(observation);
			}
			continue;
		}

		if (record.type === OM_REFLECTIONS_RECORDED && isReflectionsRecordedData(record.data) && covered(record, boundaries.reflections)) {
			for (const reflection of record.data.reflections) {
				if (reflectionsById.has(reflection.id)) continue;
				reflectionsById.add(reflection.id);
				reflections.push(reflection);
			}
			continue;
		}

		if (record.type === OM_OBSERVATIONS_DROPPED && isObservationsDroppedData(record.data) && covered(record, boundaries.drops)) {
			for (const observationId of record.data.observationIds) droppedObservationIds.add(observationId);
		}
	}

	return {
		observations: observations.filter((observation) => !droppedObservationIds.has(observation.id)),
		reflections,
	};
}

export function fullProjection(records: LedgerRecord[], throughSeq?: number): Projection {
	return foldProjection(records, {
		observations: throughSeq,
		reflections: throughSeq,
		drops: throughSeq,
	});
}

/**
 * The memory currently visible in compressed context: the projection the LAST
 * compaction baked into its summary (pi reads the stored `details` of the last
 * compaction entry; here the om/compaction ledger record carries the same
 * lists). Empty until the first compaction.
 */
export function visibleProjection(records: LedgerRecord[]): Projection {
	for (let i = records.length - 1; i >= 0; i--) {
		const record = records[i];
		if (record?.type !== OM_COMPACTION || !isCompactionData(record.data)) continue;
		return { observations: [...record.data.observations], reflections: [...record.data.reflections] };
	}
	return { observations: [], reflections: [] };
}

/**
 * Build the projection a compaction summary must carry, reproducing pi's
 * tiered semantics: observations are included through the retention boundary,
 * while reflections and drops follow the latest full-fold maintenance
 * boundary (their durable state is carried forward by compaction summaries;
 * `fullFold` re-folds everything through the boundary when the active pool has
 * outgrown the summary budget).
 *
 * `firstKeptSeq` is pi's `firstKeptEntryId` analog: the first retained
 * surface-node seq of the pending compaction. Records anchored at or before it
 * describe shadowed content. `undefined` folds everything visible.
 */
export function buildCompactionProjection(
	records: LedgerRecord[],
	firstKeptSeq: number | undefined,
	config: CompactionProjectionConfig,
): CompactionProjection {
	// pi's noneBoundary: no real seq is negative, so -1 means "nothing qualifies".
	const NONE_BOUNDARY = -1;
	const maintenanceBoundary = latestFullFoldFirstKeptSeq(records);
	const normalProjection = foldProjection(records, {
		observations: firstKeptSeq,
		reflections: maintenanceBoundary ?? NONE_BOUNDARY,
		drops: maintenanceBoundary ?? NONE_BOUNDARY,
	});
	const observationTokens = normalProjection.observations.reduce(
		(total, observation) => total + observation.tokenCount,
		0,
	);
	const fullFold = observationTokens >= config.observationsPoolMaxTokens;
	const projection = fullFold
		? fullProjection(records, firstKeptSeq)
		: normalProjection;

	return {
		fullFold,
		observations: projection.observations,
		reflections: projection.reflections,
	};
}

export function diffProjection(visible: Projection, full: Projection): ProjectionDiff {
	const visibleObservationIds = new Set(visible.observations.map((observation) => observation.id));
	const fullObservationIds = new Set(full.observations.map((observation) => observation.id));
	const visibleReflectionIds = new Set(visible.reflections.map((reflection) => reflection.id));

	return {
		observationsOnlyInFull: full.observations.filter((observation) => !visibleObservationIds.has(observation.id)),
		reflectionsOnlyInFull: full.reflections.filter((reflection) => !visibleReflectionIds.has(reflection.id)),
		droppedOnlyInFull: visible.observations.filter((observation) => !fullObservationIds.has(observation.id)),
	};
}
