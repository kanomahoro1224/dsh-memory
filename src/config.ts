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

export const DEFAULTS: Config = {
	observeAfterTokens: 10_000,
	reflectAfterTokens: 20_000,
	thresholdRatio: 0.68,
	observationsPoolMaxTokens: 20_000,
	observationsPoolTargetTokens: 10_000,
	agentMaxTurns: 16,
	showWorkerNotifications: true,
	passive: false,
	debugLog: false,
};

/** Observer chunk cap used when no config is set and the model's context window is unknown. */
export const OBSERVER_CHUNK_FALLBACK_MAX_TOKENS = 60_000;

/** Smallest useful observer chunk: enough for labels, omission markers, and source context. */
export const OBSERVER_CHUNK_MIN_TOKENS = 256;

/**
 * Fraction of the memory model's context window used for the derived observer
 * chunk cap. Chunk sizes are estimated at ~4 chars/token, which can undercount
 * real tokens by up to ~4x on non-ASCII content, so 0.2 keeps even the worst
 * case at ~80% of the window with room left for the system prompt, prior
 * memory, and the response.
 */
export const OBSERVER_CHUNK_CONTEXT_RATIO = 0.2;

export function resolveObserverChunkMaxTokens(config: Config, contextWindow: number | undefined): number {
	if (config.observerChunkMaxTokens !== undefined && config.observerChunkMaxTokens > 0) {
		return Math.max(OBSERVER_CHUNK_MIN_TOKENS, config.observerChunkMaxTokens);
	}
	if (typeof contextWindow === "number" && Number.isFinite(contextWindow) && contextWindow > 0) {
		return Math.max(
			OBSERVER_CHUNK_MIN_TOKENS,
			Math.floor(contextWindow * OBSERVER_CHUNK_CONTEXT_RATIO),
		);
	}
	return OBSERVER_CHUNK_FALLBACK_MAX_TOKENS;
}

const PASSIVE_ENV = "DSH_OBSERVATIONAL_MEMORY_PASSIVE";

function positiveIntegerOrUndefined(value: unknown): number | undefined {
	return Number.isInteger(value) && typeof value === "number" && value > 0 ? value : undefined;
}

function validRatioOrUndefined(value: unknown): number | undefined {
	// A valid ratio is a finite number strictly between 0 and 1: 0 would never
	// trigger; >= 1 would compact at/after the full window with no room left
	// for the response.
	return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 1 ? value : undefined;
}

function validTargetOrUndefined(value: unknown, maxTokens: number): number | undefined {
	const target = positiveIntegerOrUndefined(value);
	return target !== undefined && target < maxTokens ? target : undefined;
}

function derivedObservationPoolTarget(maxTokens: number): number {
	return Math.floor(maxTokens / 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function nonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeModel(value: unknown): ConfiguredModel | undefined {
	if (!isRecord(value)) return undefined;
	const provider = nonEmptyString(value.provider);
	const model = nonEmptyString(value.model);
	if (!provider || !model) return undefined;
	const configured: ConfiguredModel = { provider, model };
	const effort = nonEmptyString(value.reasoningEffort);
	if (effort) configured.reasoningEffort = effort;
	return configured;
}

export function normalizeConfig(value: Record<string, unknown>): Partial<Config> {
	const normalized: Partial<Config> = {};
	const numberKeys = [
		"observeAfterTokens",
		"reflectAfterTokens",
		"observerChunkMaxTokens",
		"observationsPoolMaxTokens",
		"observationsPoolTargetTokens",
		"agentMaxTurns",
	] as const;
	for (const key of numberKeys) {
		const normalizedValue = positiveIntegerOrUndefined(value[key]);
		if (normalizedValue !== undefined) normalized[key] = normalizedValue;
	}
	const ratio = validRatioOrUndefined(value.thresholdRatio);
	if (ratio !== undefined) normalized.thresholdRatio = ratio;
	const retainRatio = validRatioOrUndefined(value.retainRatio);
	if (retainRatio !== undefined) normalized.retainRatio = retainRatio;
	const retainTokens = positiveIntegerOrUndefined(value.retainTokens);
	if (retainTokens !== undefined) normalized.retainTokens = retainTokens;
	const summarizationMaxTokens = positiveIntegerOrUndefined(value.summarizationMaxTokens);
	if (summarizationMaxTokens !== undefined) normalized.summarizationMaxTokens = summarizationMaxTokens;
	if (typeof value.showWorkerNotifications === "boolean") normalized.showWorkerNotifications = value.showWorkerNotifications;
	if (typeof value.passive === "boolean") normalized.passive = value.passive;
	if (typeof value.debugLog === "boolean") normalized.debugLog = value.debugLog;
	const model = normalizeModel(value.model);
	if (model) normalized.model = model;
	return normalized;
}

export function readEnvConfig(env: NodeJS.ProcessEnv = process.env): Partial<Config> {
	const rawPassive = env[PASSIVE_ENV];
	if (rawPassive === undefined) return {};
	const passive = rawPassive.trim().toLowerCase();
	if (["1", "true", "yes", "on"].includes(passive)) return { passive: true };
	if (["0", "false", "no", "off"].includes(passive)) return { passive: false };
	return {};
}

export function loadConfig(pluginConfig: unknown, env: NodeJS.ProcessEnv = process.env): Config {
	const fromPlugin = isRecord(pluginConfig) ? normalizeConfig(pluginConfig) : {};
	const envConfig = readEnvConfig(env);
	const merged = {
		...DEFAULTS,
		observationsPoolTargetTokens: undefined as number | undefined,
		...fromPlugin,
		...envConfig,
	};
	const maxTokens = positiveIntegerOrUndefined(merged.observationsPoolMaxTokens) ?? DEFAULTS.observationsPoolMaxTokens;
	const target = validTargetOrUndefined(merged.observationsPoolTargetTokens, maxTokens)
		?? derivedObservationPoolTarget(maxTokens);

	return {
		...(merged as unknown as Config),
		observationsPoolMaxTokens: maxTokens,
		observationsPoolTargetTokens: target,
	};
}
