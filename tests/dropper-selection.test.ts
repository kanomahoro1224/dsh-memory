import { describe, expect, it } from "vitest";
import {
	REFLECTION_COVERAGE_DROP_RANK,
	coverageTierForObservation,
	observationToDropperLine,
	reflectionCoverageMap,
	summarizeCoverageByRelevance,
} from "../src/agents/dropper/coverage.js";
import { selectDropCandidates } from "../src/agents/dropper/agent.js";
import { maxDropCountForPool, observationPoolMetrics, observationTokenSum } from "../src/agents/dropper/pool.js";
import { makeObservation, makeReflection } from "./helpers/ledger.js";

describe("reflectionCoverageMap", () => {
	it("computes none/partial/strong tiers from supporting ids", () => {
		const obsA = makeObservation({ id: "aaaaaaaaaaaa" });
		const obsB = makeObservation({ id: "bbbbbbbbbbbb" });
		const obsC = makeObservation({ id: "cccccccccccc" });
		const observations = [obsA, obsB, obsC];
		const reflections = [
			makeReflection({ id: "eeeeeeeeeeee", supportingObservationIds: ["aaaaaaaaaaaa"] }),
			makeReflection({ id: "ffffffffff", supportingObservationIds: ["aaaaaaaaaaaa", "bbbbbbbbbbbb"] }),
		];

		const coverage = reflectionCoverageMap(observations, reflections);

		expect(coverageTierForObservation(obsA, coverage)).toBe("strong");
		expect(coverageTierForObservation(obsB, coverage)).toBe("partial");
		expect(coverageTierForObservation(obsC, coverage)).toBe("none");
	});
});

describe("selectDropCandidates", () => {
	it("ranks by coverage, then relevance, then age, and caps at maxDrops", () => {
		const old = makeObservation({ id: "aaaaaaaaaaaa", relevance: "low", timestamp: "2025-01-01 10:00" });
		const recentCritical = makeObservation({ id: "bbbbbbbbbbbb", relevance: "critical", timestamp: "2026-01-01 10:00" });
		const coveredLow = makeObservation({ id: "cccccccccccc", relevance: "medium", timestamp: "2025-06-01 10:00" });
		const observations = [recentCritical, old, coveredLow];
		const reflections = [makeReflection({ id: "eeeeeeeeeeee", supportingObservationIds: ["cccccccccccc"] })];

		const dropped = selectDropCandidates(["cccccccccccc", "aaaaaaaaaaaa", "bbbbbbbbbbbb"], observations, 2, reflections);

		// strong coverage first, then uncovered older/low; critical never within 2 slots here.
		expect(dropped).toEqual(["cccccccccccc", "aaaaaaaaaaaa"]);
	});

	it("ignores unknown ids and respects a zero budget", () => {
		const obs = makeObservation({ id: "aaaaaaaaaaaa" });
		expect(selectDropCandidates(["ffffffffffff"], [obs], 5)).toEqual([]);
		expect(selectDropCandidates(["aaaaaaaaaaaa"], [obs], 0)).toEqual([]);
	});
});

describe("pool metrics", () => {
	it("is not ready at or below target", () => {
		const metrics = observationPoolMetrics([makeObservation({ tokenCount: 10 })], 50);
		expect(metrics.ready).toBe(false);
		expect(metrics.overTarget).toBe(false);
	});

	it("allows drops sized to move the pool toward the target when over", () => {
		const observations = [makeObservation({ tokenCount: 30 }), makeObservation({ tokenCount: 30 })];
		// The pool counts full rendered lines (id + timestamp + relevance + content), not bare tokenCount.
		const tokens = observationTokenSum(observations);
		const metrics = observationPoolMetrics(observations, tokens - 5);
		expect(metrics.overTarget).toBe(true);
		expect(metrics.maxDropsAllowed).toBe(1);
		expect(metrics.ready).toBe(true);
	});

	it("computes max drops from the average observation size", () => {
		const observations = [
			makeObservation({ tokenCount: 10 }),
			makeObservation({ tokenCount: 10 }),
			makeObservation({ tokenCount: 10 }),
			makeObservation({ tokenCount: 10 }),
		];
		// 40 total, target 10: over by 30, avg 10 -> 3 drops.
		expect(maxDropCountForPool(observations, 40, 10)).toBe(3);
	});
});

describe("dropper line and ranks", () => {
	it("renders the dropper line with coverage", () => {
		const obs = makeObservation({ id: "aaaaaaaaaaaa", relevance: "high", content: "decided X" });
		const coverage = reflectionCoverageMap([obs], [makeReflection({ supportingObservationIds: ["aaaaaaaaaaaa"] })]);
		const line = observationToDropperLine(obs, coverageTierForObservation(obs, coverage));
		expect(line).toContain("[aaaaaaaaaaaa]");
		expect(line).toContain("[high]");
		expect(line).toContain("[coverage: partial]");
		expect(line).toContain("decided X");
		expect(REFLECTION_COVERAGE_DROP_RANK.strong).toBeLessThan(REFLECTION_COVERAGE_DROP_RANK.none);
	});

	it("summarizes coverage counts by relevance", () => {
		const obs = makeObservation({ relevance: "low" });
		const coverage = reflectionCoverageMap([obs], []);
		const summary = summarizeCoverageByRelevance([obs], coverage);
		expect(summary.low.none).toMatchObject({ count: 1 });
	});
});
