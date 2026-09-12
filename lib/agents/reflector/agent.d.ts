import type { Context } from "@deepseek-ai/cordis";
import type { LlmTarget } from "../../llm/target.js";
import { type Observation, type Reflection } from "../../ledger/index.js";
import { type ReflectionCoverageTier } from "../dropper/coverage.js";
interface RunReflectorArgs {
    ctx: Context;
    target: LlmTarget;
    reasoningEffort?: string;
    reflections: Reflection[];
    observations: Observation[];
    signal?: AbortSignal;
    maxTurns?: number;
    sessionId?: import("@deepseek-ai/dsh-session").SessionId;
}
export declare function observationToReflectorLine(observation: Observation, coverage: ReflectionCoverageTier): string;
export declare function summarizeSupportIdCounts(reflections: readonly Reflection[]): {
    reflectionCount: number;
    totalSupportIds: number;
    minSupportIds: number;
    maxSupportIds: number;
    averageSupportIds: number;
    histogram: Record<string, number>;
};
export declare function normalizeSupportingObservationIds(supportingObservationIds: readonly unknown[] | undefined, allowedObservationIds: readonly string[]): string[] | undefined;
export declare function runReflector(args: RunReflectorArgs): Promise<Reflection[] | undefined>;
export {};
