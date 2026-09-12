export interface ConfiguredModel {
    provider: string;
    model: string;
    reasoningEffort?: string;
}
export interface Config {
    observeAfterTokens: number;
    reflectAfterTokens: number;
    /**
     * Maximum estimated source tokens serialized into a single observer chunk.
     * Unset (default) derives the cap from the memory model's context window;
     * see {@link resolveObserverChunkMaxTokens}.
     */
    observerChunkMaxTokens?: number;
    /**
     * Fraction of the conversation model's context window at which automatic
     * compaction triggers (compaction-basic `thresholdRatio`). Replaces pi's
     * absolute `compactAfterTokens`; use `modelPolicies` for per-model tuning.
     */
    thresholdRatio: number;
    /** Recent context retained as a fraction of the window (compaction-basic `retainRatio`). */
    retainRatio?: number;
    /** Absolute recent-context budget (compaction-basic `retainTokens`); wins over `retainRatio`. */
    retainTokens?: number;
    /** Provider generation cap for the fallback checkpoint summarizer (compaction-basic `maxTokens`). */
    summarizationMaxTokens?: number;
    observationsPoolMaxTokens: number;
    observationsPoolTargetTokens: number;
    agentMaxTurns: number;
    /** Optional explicit worker/summarizer model; defaults to the conversation's routed target. */
    model?: ConfiguredModel;
    showWorkerNotifications: boolean;
    passive: boolean;
    debugLog: boolean;
}
export declare const DEFAULTS: Config;
/** Observer chunk cap used when no config is set and the model's context window is unknown. */
export declare const OBSERVER_CHUNK_FALLBACK_MAX_TOKENS = 60000;
/** Smallest useful observer chunk: enough for labels, omission markers, and source context. */
export declare const OBSERVER_CHUNK_MIN_TOKENS = 256;
/**
 * Fraction of the memory model's context window used for the derived observer
 * chunk cap. Chunk sizes are estimated at ~4 chars/token, which can undercount
 * real tokens by up to ~4x on non-ASCII content, so 0.2 keeps even the worst
 * case at ~80% of the window with room left for the system prompt, prior
 * memory, and the response.
 */
export declare const OBSERVER_CHUNK_CONTEXT_RATIO = 0.2;
export declare function resolveObserverChunkMaxTokens(config: Config, contextWindow: number | undefined): number;
export declare function normalizeConfig(value: Record<string, unknown>): Partial<Config>;
export declare function readEnvConfig(env?: NodeJS.ProcessEnv): Partial<Config>;
export declare function loadConfig(pluginConfig: unknown, env?: NodeJS.ProcessEnv): Config;
