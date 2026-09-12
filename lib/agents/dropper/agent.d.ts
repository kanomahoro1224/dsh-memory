import type { Context } from "@deepseek-ai/cordis";
import type { LlmTarget } from "../../llm/target.js";
import { type Observation, type Reflection } from "../../ledger/index.js";
interface RunDropperArgs {
    ctx: Context;
    target: LlmTarget;
    reasoningEffort?: string;
    reflections: Reflection[];
    observations: Observation[];
    targetTokens: number;
    signal?: AbortSignal;
    maxTurns?: number;
    sessionId?: import("@deepseek-ai/dsh-session").SessionId;
}
export declare function normalizeDropObservationIds(ids: readonly unknown[] | undefined, observations: readonly Observation[]): string[] | undefined;
export declare function selectDropCandidates(ids: readonly string[], observations: readonly Observation[], maxDrops: number, reflections?: readonly Reflection[]): string[];
export declare function runDropper(args: RunDropperArgs): Promise<string[] | undefined>;
export {};
