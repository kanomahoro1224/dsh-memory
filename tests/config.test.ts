import { describe, expect, it } from "vitest";
import { loadConfig, normalizeConfig, readEnvConfig, resolveObserverChunkMaxTokens } from "../src/config.js";

describe("loadConfig", () => {
	it("applies defaults", () => {
		const config = loadConfig(undefined);
		expect(config.observeAfterTokens).toBe(10_000);
		expect(config.reflectAfterTokens).toBe(20_000);
		expect(config.thresholdRatio).toBe(0.68);
		expect(config.observationsPoolMaxTokens).toBe(20_000);
		expect(config.observationsPoolTargetTokens).toBe(10_000);
		expect(config.agentMaxTurns).toBe(16);
		expect(config.showWorkerNotifications).toBe(true);
		expect(config.passive).toBe(false);
		expect(config.debugLog).toBe(false);
	});

	it("derives the pool target as half of the pool max", () => {
		const config = loadConfig({ observationsPoolMaxTokens: 8_000 });
		expect(config.observationsPoolMaxTokens).toBe(8_000);
		expect(config.observationsPoolTargetTokens).toBe(4_000);
	});

	it("keeps a valid explicit target below the pool max", () => {
		expect(loadConfig({ observationsPoolMaxTokens: 8_000, observationsPoolTargetTokens: 2_000 }).observationsPoolTargetTokens).toBe(2_000);
		expect(loadConfig({ observationsPoolMaxTokens: 8_000, observationsPoolTargetTokens: 9_000 }).observationsPoolTargetTokens).toBe(4_000);
	});

	it("rejects invalid ratios and non-positive integers", () => {
		const config = normalizeConfig({
			thresholdRatio: 1.5,
			retainRatio: -0.2,
			observeAfterTokens: 0,
			agentMaxTurns: "x",
		});
		expect(config).toEqual({});
	});

	it("normalizes the configured model", () => {
		const config = loadConfig({ model: { provider: "deepseek", model: "deepseek-chat", reasoningEffort: "high" } });
		expect(config.model).toEqual({ provider: "deepseek", model: "deepseek-chat", reasoningEffort: "high" });
		expect(loadConfig({ model: { provider: "", model: "x" } }).model).toBeUndefined();
	});
});

describe("readEnvConfig", () => {
	it("parses the passive env var", () => {
		expect(readEnvConfig({ DSH_OBSERVATIONAL_MEMORY_PASSIVE: "1" })).toEqual({ passive: true });
		expect(readEnvConfig({ DSH_OBSERVATIONAL_MEMORY_PASSIVE: "off" })).toEqual({ passive: false });
		expect(readEnvConfig({ DSH_OBSERVATIONAL_MEMORY_PASSIVE: "garbage" })).toEqual({});
		expect(readEnvConfig({})).toEqual({});
	});

	it("env overrides plugin config for passive", () => {
		expect(loadConfig({ passive: false }, { DSH_OBSERVATIONAL_MEMORY_PASSIVE: "true" }).passive).toBe(true);
	});
});

describe("resolveObserverChunkMaxTokens", () => {
	it("prefers the configured cap", () => {
		expect(resolveObserverChunkMaxTokens({ ...loadConfig(undefined), observerChunkMaxTokens: 1_000 }, 1_000_000)).toBe(1_000);
		expect(resolveObserverChunkMaxTokens({ ...loadConfig(undefined), observerChunkMaxTokens: 10 }, undefined)).toBe(256);
	});

	it("derives 0.2x the context window and falls back to 60k", () => {
		expect(resolveObserverChunkMaxTokens(loadConfig(undefined), 200_000)).toBe(40_000);
		expect(resolveObserverChunkMaxTokens(loadConfig(undefined), undefined)).toBe(60_000);
	});
});
