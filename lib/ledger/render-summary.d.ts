import type { Observation, Reflection } from "./types.js";
export declare function observationToSummaryLine(observation: Observation): string;
export declare function reflectionToSummaryLine(reflection: Reflection): string;
export declare function renderSummary(reflections: Reflection[], observations: Observation[]): string;
