import type { Observation, Reflection } from "../../ledger/index.js";
export declare const REFLECTION_COVERAGE_TIERS: readonly ["none", "partial", "strong"];
export type ReflectionCoverageTier = typeof REFLECTION_COVERAGE_TIERS[number];
type Relevance = Observation["relevance"];
type CoverageBucket = Record<ReflectionCoverageTier, {
    count: number;
    tokens: number;
}>;
export type CoverageSummaryByRelevance = Record<Relevance, CoverageBucket>;
export type CoverageTransitionSummaryByRelevance = Record<Relevance, Record<string, {
    count: number;
    tokens: number;
}>>;
export declare const REFLECTION_COVERAGE_DROP_RANK: Record<ReflectionCoverageTier, number>;
export declare function reflectionSupportCounts(reflections: readonly Reflection[]): Map<string, number>;
export declare function reflectionCoverageTierForCount(count: number): ReflectionCoverageTier;
export declare function reflectionCoverageMap(observations: readonly Observation[], reflections: readonly Reflection[]): Map<string, ReflectionCoverageTier>;
export declare function emptyCoverageSummaryByRelevance(): CoverageSummaryByRelevance;
export declare function summarizeCoverageByRelevance(observations: readonly Observation[], coverageById: ReadonlyMap<string, ReflectionCoverageTier>): CoverageSummaryByRelevance;
export declare function summarizeCoverageByRelevanceForIds(ids: readonly string[], observations: readonly Observation[], coverageById: ReadonlyMap<string, ReflectionCoverageTier>): CoverageSummaryByRelevance;
export declare function summarizeCoverageTransitionsByRelevance(observations: readonly Observation[], beforeCoverageById: ReadonlyMap<string, ReflectionCoverageTier>, afterCoverageById: ReadonlyMap<string, ReflectionCoverageTier>): CoverageTransitionSummaryByRelevance;
export declare function observationToDropperLine(observation: Observation, coverage: ReflectionCoverageTier): string;
export declare function coverageTierForObservation(observation: Observation, coverageById: ReadonlyMap<string, ReflectionCoverageTier>): ReflectionCoverageTier;
export {};
