import type { SessionEvent } from "@deepseek-ai/dsh-session";
import { type LedgerRecord, type Observation, type Reflection } from "./types.js";
export type { Observation, Reflection };
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
export type RecallResult = {
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
} | {
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
/**
 * Recall the observations and reflections matching one memory id, together
 * with their supporting source session events.
 */
export declare function recallMemorySources(records: LedgerRecord[], events: readonly SessionEvent[], memoryId: string): RecallResult;
