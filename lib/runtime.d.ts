import type { Config } from "./config.js";
export type NotifyLevel = "info" | "warn";
export type ConsolidationPhase = "observer" | "reflector" | "dropper";
export interface RuntimeCtx {
    hasLogger: boolean;
    logger?: {
        info(message: string): void;
        warn(message: string): void;
    };
}
/**
 * Shared consolidation/compaction runtime state. Model resolution and auth
 * live in the harness LLM adapters, so this is bookkeeping only: config,
 * in-flight single-flight tracking, and worker-failure surfacing.
 */
export declare class Runtime {
    config: Config;
    consolidationInFlight: boolean;
    consolidationPromise: Promise<void> | null;
    consolidationPhase: ConsolidationPhase | undefined;
    lastObserverError: string | undefined;
    lastReflectorError: string | undefined;
    lastDropperError: string | undefined;
    /** Deliberate-empty backoff (#23): skip observer re-fires over the same span until enough new tokens arrive. */
    observerEmptyBackoff: {
        sessionIdentity: string | undefined;
        coverageSeq: number | undefined;
        tokensAtEmpty: number;
    } | undefined;
    constructor(config: Config);
    notify(ctx: RuntimeCtx, message: string, level?: NotifyLevel): void;
    launchConsolidationTask(ctx: RuntimeCtx, work: () => Promise<void>): Promise<void>;
    recordConsolidationStageError(ctx: RuntimeCtx, phase: ConsolidationPhase, error: unknown): string;
    private launchTrackedTask;
}
