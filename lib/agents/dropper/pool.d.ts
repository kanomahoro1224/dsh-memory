import type { Observation } from "../../ledger/index.js";
export type ObservationPoolMetrics = {
    observationTokens: number;
    targetTokens: number;
    tokensOverTarget: number;
    fullness: number;
    activeObservationCount: number;
    droppableCount: number;
    maxDropsAllowed: number;
    overTarget: boolean;
    ready: boolean;
};
export declare function observationTokenSum(observations: readonly Observation[]): number;
export declare function observationPoolFullness(observationTokens: number, targetTokens: number): number;
export declare function maxDropCountForPool(observations: readonly Observation[], observationTokens: number, targetTokens: number): number;
export declare function observationPoolMetrics(observations: readonly Observation[], targetTokens: number): ObservationPoolMetrics;
