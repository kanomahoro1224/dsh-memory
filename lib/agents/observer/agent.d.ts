import type { Context } from "@deepseek-ai/cordis";
import type { LlmTarget } from "../../llm/target.js";
import type { Observation } from "../../ledger/index.js";
interface RunObserverArgs {
    ctx: Context;
    target: LlmTarget;
    reasoningEffort?: string;
    priorReflections: string[];
    priorObservations: string[];
    chunk: string;
    allowedSourceEventSeqs: number[];
    signal?: AbortSignal;
    maxTurns?: number;
    sessionId?: import("@deepseek-ai/dsh-session").SessionId;
}
export declare function normalizeSourceEventSeqs(sourceEventSeqs: readonly unknown[] | undefined, allowedSourceEventSeqs: readonly number[]): number[] | undefined;
export declare function runObserver(args: RunObserverArgs): Promise<Observation[] | undefined>;
export {};
