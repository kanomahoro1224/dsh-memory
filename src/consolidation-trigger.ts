import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { SessionEvent } from "@deepseek-ai/dsh-session";
// Loads the cordis Context augmentation for `ctx.tokenMeter`.
import type {} from "@deepseek-ai/dsh-token-meter";
import { debugLog, withDebugLogContext } from "./debug-log.js";
import { resolveObserverChunkMaxTokens } from "./config.js";
import type { Runtime, RuntimeCtx } from "./runtime.js";
import type { LlmTarget } from "./llm/target.js";
import { resolveTarget } from "./llm/target.js";
import { serializeSourceAddressedEvents } from "./serialize.js";
import {
	OM_OBSERVATIONS_DROPPED,
	OM_OBSERVATIONS_RECORDED,
	OM_REFLECTIONS_RECORDED,
	buildObservationsDroppedData,
	buildObservationsRecordedData,
	buildReflectionsRecordedData,
	appendRecord,
	foldLedger,
	fullProjection,
	latestCoverageSeq,
	loadLedger,
	observationToSummaryLine,
	rawTokensSinceSurfaceAnchor,
	realTokensSinceAnchor,
	reflectionToSummaryLine,
	type Ledger,
	type Observation,
	type Reflection,
} from "./ledger/index.js";
import { runDropper } from "./agents/dropper/agent.js";
import { observationPoolMetrics } from "./agents/dropper/pool.js";
import { runObserver } from "./agents/observer/agent.js";
import { runReflector } from "./agents/reflector/agent.js";

type StageOutcome = "continue" | "abort";

type ReflectorStageResult = {
	outcome: StageOutcome;
	sameRunReflections: Reflection[];
	effectiveReflectionCoverageSeq?: number | undefined;
};

/**
 * The agent's visible surface in display order. Non-surface events (turn
 * boundaries, attempts) are excluded by construction.
 */
export function surfaceEventsOf(agent: Agent): readonly SessionEvent[] {
	const events = agent.session.snapshotEvents();
	const surface: SessionEvent[] = [];
	for (const seq of agent.session.surface.nodes) {
		const event = events[seq];
		if (event) surface.push(event);
	}
	return surface;
}

/**
 * Uncovered surface source events. Coverage anchors are surface-node seqs, so
 * a plain seq comparison handles compaction naturally: shadowed coverage
 * anchors simply fall below every retained surface event, and retained
 * pre-coverage events were covered when the anchor landed.
 */
function sourceEventsAfter(events: readonly SessionEvent[], afterSeq: number | undefined): SessionEvent[] {
	return events.filter((event) =>
		(event.type === "user/message" || event.type === "assistant/message" || event.type === "tool/result")
		&& (afterSeq === undefined || event.seq > afterSeq)
	);
}

function runtimeCtxOf(ctx: Context): RuntimeCtx {
	return {
		hasLogger: true,
		logger: {
			info: (message: string): void => ctx.logger.info(message),
			warn: (message: string): void => ctx.logger.warn(message),
		},
	};
}

export function meterTokens(ctx: Context, agent: Agent): number | undefined {
	try {
		const tokens = ctx.tokenMeter.measure(agent.session).totalTokens;
		return typeof tokens === "number" && Number.isFinite(tokens) ? tokens : undefined;
	} catch {
		return undefined;
	}
}

export function cwdOf(agent: Agent): string {
	return agent.session.header.cwd ?? process.cwd();
}

/**
 * Real (metered) growth since the anchor snapshot when measurable; otherwise
 * the raw surface estimate, which self-limits after coverage and cannot
 * over-fire or starve.
 */
export function stageProgress(
	ledger: Ledger,
	currentTokens: number | undefined,
	coverageType: typeof OM_OBSERVATIONS_RECORDED | typeof OM_REFLECTIONS_RECORDED,
	surfaceEvents: readonly SessionEvent[],
): number {
	const anchor = coverageType === OM_OBSERVATIONS_RECORDED ? ledger.anchors.observations : ledger.anchors.reflections;
	const real = realTokensSinceAnchor(currentTokens, anchor?.tokens);
	if (real !== undefined) return real;
	return rawTokensSinceSurfaceAnchor(surfaceEvents, latestCoverageSeq(ledger.records, coverageType));
}

function anyStageDue(ledger: Ledger, runtime: Runtime, currentTokens: number | undefined, surfaceEvents: readonly SessionEvent[]): boolean {
	return stageProgress(ledger, currentTokens, OM_OBSERVATIONS_RECORDED, surfaceEvents) >= runtime.config.observeAfterTokens
		|| stageProgress(ledger, currentTokens, OM_REFLECTIONS_RECORDED, surfaceEvents) >= runtime.config.reflectAfterTokens;
}

export function registerConsolidationTrigger(ctx: Context, runtime: Runtime): void {
	const maybeLaunch = (agent: Agent): void => {
		if (agent.status !== "idle") return;
		void maybeLaunchConsolidation(ctx, runtime, agent);
	};

	// dsh `idle` transitions are the analog of pi's agent_start/turn_end:
	// consolidation runs between turns, never concurrently with one. Unlike pi,
	// this does not claim the agent's idle phase via runMaintenance — workers
	// only read immutable session snapshots and write the plugin-owned ledger,
	// so a turn that starts mid-run is safe and just becomes next run's backlog.
	ctx.on("agent/created", ({ agent }) => maybeLaunch(agent));
	ctx.on("agent/status", ({ agent, status }) => {
		if (status === "idle") maybeLaunch(agent);
	});
}

function maybeLaunchConsolidation(ctx: Context, runtime: Runtime, agent: Agent): void {
	if (runtime.config.passive) return;
	if (runtime.consolidationInFlight) return;

	const sessionId = agent.session.id;
	const cwd = cwdOf(agent);
	const ledger = loadLedger(cwd, sessionId);
	const surfaceEvents = surfaceEventsOf(agent);
	const currentTokens = meterTokens(ctx, agent);
	if (!anyStageDue(ledger, runtime, currentTokens, surfaceEvents)) return;

	const runId = `consolidation-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
	const runtimeCtx = runtimeCtxOf(ctx);
	void runtime.launchConsolidationTask(runtimeCtx, () => withDebugLogContext({
		enabled: runtime.config.debugLog === true,
		cwd,
		sessionId,
		runId,
	}, () => runConsolidationPipeline(ctx, runtime, agent, cwd, ledger)));
}

export async function runConsolidationPipeline(
	ctx: Context,
	runtime: Runtime,
	agent: Agent,
	cwd: string,
	ledger: Ledger,
): Promise<void> {
	const runtimeCtx = runtimeCtxOf(ctx);
	const resolveTargetOnce = (): LlmTarget | undefined => {
		const target = resolveTarget(runtime.config, agent);
		if (target) return target;
		debugLog("worker.model_unavailable", {
			reason: "no provider/model available (no config.model, no routed request, no agent options)",
		});
		runtime.notify(runtimeCtx, "Observational memory: worker skipped — no provider/model available", "warn");
		return undefined;
	};

	runtime.consolidationPhase = "observer";
	try {
		const observerOutcome = await runObserverStage(ctx, runtime, agent, cwd, ledger, resolveTargetOnce);
		if (observerOutcome === "abort") return;
	} catch (error) {
		debugLog("observer.error", { errorMessage: runtime.recordConsolidationStageError(runtimeCtx, "observer", error) });
		return;
	}

	runtime.consolidationPhase = "reflector";
	let reflectorResult: ReflectorStageResult;
	try {
		reflectorResult = await runReflectorStage(ctx, runtime, agent, cwd, ledger, resolveTargetOnce);
		if (reflectorResult.outcome === "abort") return;
	} catch (error) {
		debugLog("reflector.error", { errorMessage: runtime.recordConsolidationStageError(runtimeCtx, "reflector", error) });
		return;
	}

	runtime.consolidationPhase = "dropper";
	try {
		await runDropperStage(ctx, runtime, agent, cwd, ledger, resolveTargetOnce, reflectorResult.sameRunReflections, reflectorResult.effectiveReflectionCoverageSeq);
	} catch (error) {
		debugLog("dropper.error", { errorMessage: runtime.recordConsolidationStageError(runtimeCtx, "dropper", error) });
	}
}

async function runObserverStage(
	ctx: Context,
	runtime: Runtime,
	agent: Agent,
	cwd: string,
	ledger: Ledger,
	resolveTargetOnce: () => LlmTarget | undefined,
): Promise<StageOutcome> {
	const surfaceEvents = surfaceEventsOf(agent);
	const currentTokens = meterTokens(ctx, agent);
	const tokens = stageProgress(ledger, currentTokens, OM_OBSERVATIONS_RECORDED, surfaceEvents);
	if (tokens < runtime.config.observeAfterTokens) return "continue";

	const sessionId = agent.session.id;
	const coverageSeq = latestCoverageSeq(ledger.records, OM_OBSERVATIONS_RECORDED);

	// Deliberate-empty backoff (#23): an intentional "nothing to record" verdict
	// must not re-fire the observer every turn over the same span. Retry only
	// after another observeAfterTokens worth of new source tokens arrives, and
	// drop the backoff as soon as coverage advances.
	const backoff = runtime.observerEmptyBackoff;
	if (backoff) {
		if (
			backoff.sessionIdentity !== sessionId
			|| backoff.coverageSeq !== coverageSeq
			|| tokens >= backoff.tokensAtEmpty + runtime.config.observeAfterTokens
		) {
			runtime.observerEmptyBackoff = undefined;
		} else {
			debugLog("observer.empty_backoff", { tokens, resumeAtTokens: backoff.tokensAtEmpty + runtime.config.observeAfterTokens });
			return "continue";
		}
	}

	const target = resolveTargetOnce();
	if (!target) return "abort";

	const backlogEvents = sourceEventsAfter(surfaceEvents, coverageSeq);
	if (backlogEvents.length === 0) return "continue";

	// Budget the text that is actually sent to the observer, including source
	// labels and rendered message content. Complete events are kept intact.
	// Only a first event that cannot fit by itself is represented by a clearly
	// marked head/tail excerpt; the original session events remain untouched.
	const maxChunkTokens = resolveObserverChunkMaxTokens(runtime.config, undefined);
	const {
		text: chunk,
		sourceEventSeqs,
		estimatedTokens: chunkTokens,
		truncatedSourceEventSeqs,
	} = serializeSourceAddressedEvents(backlogEvents, { maxTokens: maxChunkTokens });
	if (!chunk.trim() || sourceEventSeqs.length === 0) return "continue";
	const coversUpToSeq = sourceEventSeqs.at(-1);
	if (coversUpToSeq === undefined) return "continue";

	if (sourceEventSeqs.length < backlogEvents.length || truncatedSourceEventSeqs.length > 0) {
		debugLog("observer.chunk_capped", {
			maxChunkTokens,
			backlogEvents: backlogEvents.length,
			backlogTokens: tokens,
			chunkEvents: sourceEventSeqs.length,
			chunkTokens,
			truncatedSourceEventSeqs,
		});
	}

	const memory = fullProjection(ledger.records);
	const priorReflections = memory.reflections.map(reflectionToSummaryLine);
	const priorObservations = memory.observations.map(observationToSummaryLine);

	const runtimeCtx = runtimeCtxOf(ctx);
	runtime.notify(runtimeCtx, `Observational memory: observer running on ~${chunkTokens.toLocaleString()}-token chunk`, "info");
	debugLog("observer.start", {
		tokens,
		chunkTokens,
		coversUpToSeq,
		sourceEventSeqs,
		sourceEventCount: sourceEventSeqs.length,
		priorReflections: priorReflections.length,
		priorObservations: priorObservations.length,
	});

	let observations: Observation[] | undefined;
	try {
		observations = await runObserver({
			ctx,
			target,
			reasoningEffort: runtime.config.model?.reasoningEffort,
			priorReflections,
			priorObservations,
			chunk,
			allowedSourceEventSeqs: sourceEventSeqs,
			maxTurns: runtime.config.agentMaxTurns,
			sessionId,
		});
	} catch (error) {
		// API/stream failure is not a clean empty (#32): surface it as a real
		// failure instead of the "no observations" path. Coverage stays put.
		runtime.recordConsolidationStageError(runtimeCtx, "observer", error);
		return "abort";
	}
	if (!observations || observations.length === 0) {
		// Deliberate empty: routine info, not a warning, and back off re-fires
		// over the same span (#23).
		debugLog("observer.empty", { coversUpToSeq });
		runtime.observerEmptyBackoff = { sessionIdentity: sessionId, coverageSeq, tokensAtEmpty: tokens };
		runtime.notify(runtimeCtx, "Observational memory: observer found nothing new in this chunk (coverage unchanged; will retry later)", "info");
		return "continue";
	}
	runtime.observerEmptyBackoff = undefined;

	const data = buildObservationsRecordedData(observations, coversUpToSeq);
	if (!data) return "continue";
	debugLog("observer.records", {
		count: observations.length,
		observationTokens: observations.reduce((sum, observation) => sum + observation.tokenCount, 0),
		coversUpToSeq,
	});
	if (currentTokens !== undefined) ledger.anchors.observations = { atSeq: agent.session.seq, tokens: currentTokens };
	appendRecord(cwd, ledger, { type: OM_OBSERVATIONS_RECORDED, data });
	debugLog("observer.appended", { count: observations.length, coversUpToSeq });
	runtime.notify(runtimeCtx, `Observational memory: ${observations.length} observation${observations.length === 1 ? "" : "s"} recorded`, "info");
	return "continue";
}

async function runReflectorStage(
	ctx: Context,
	runtime: Runtime,
	agent: Agent,
	cwd: string,
	ledger: Ledger,
	resolveTargetOnce: () => LlmTarget | undefined,
): Promise<ReflectorStageResult> {
	const surfaceEvents = surfaceEventsOf(agent);
	const currentTokens = meterTokens(ctx, agent);
	const reflectionTokens = stageProgress(ledger, currentTokens, OM_REFLECTIONS_RECORDED, surfaceEvents);
	if (reflectionTokens < runtime.config.reflectAfterTokens) return { outcome: "continue", sameRunReflections: [] };

	const observationCoverageSeq = latestCoverageSeq(ledger.records, OM_OBSERVATIONS_RECORDED);
	if (observationCoverageSeq === undefined) return { outcome: "continue", sameRunReflections: [] };

	const runtimeCtx = runtimeCtxOf(ctx);
	runtime.notify(runtimeCtx, `Observational memory: reflector running (~${reflectionTokens.toLocaleString()} tokens)`, "info");
	const target = resolveTargetOnce();
	if (!target) return { outcome: "abort", sameRunReflections: [] };

	const folded = foldLedger(ledger.records);
	const reflections = await runReflector({
		ctx,
		target,
		reasoningEffort: runtime.config.model?.reasoningEffort,
		reflections: folded.reflections,
		observations: folded.activeObservations,
		maxTurns: runtime.config.agentMaxTurns,
		sessionId: agent.session.id,
	});
	if (!reflections) return { outcome: "continue", sameRunReflections: [] };

	const data = buildReflectionsRecordedData(reflections, observationCoverageSeq);
	if (!data) return { outcome: "continue", sameRunReflections: [] };
	if (currentTokens !== undefined) ledger.anchors.reflections = { atSeq: agent.session.seq, tokens: currentTokens };
	appendRecord(cwd, ledger, { type: OM_REFLECTIONS_RECORDED, data });
	return {
		outcome: "continue",
		sameRunReflections: reflections,
		effectiveReflectionCoverageSeq: data.coversUpToSeq,
	};
}

async function runDropperStage(
	ctx: Context,
	runtime: Runtime,
	agent: Agent,
	cwd: string,
	ledger: Ledger,
	resolveTargetOnce: () => LlmTarget | undefined,
	sameRunReflections: Reflection[],
	sameRunReflectionCoverageSeq: number | undefined,
): Promise<StageOutcome> {
	if (sameRunReflectionCoverageSeq === undefined || sameRunReflections.length === 0) {
		debugLog("dropper.waiting_for_reflection", { sameRunReflections: sameRunReflections.length });
		return "continue";
	}

	const observationCoverageSeq = latestCoverageSeq(ledger.records, OM_OBSERVATIONS_RECORDED);
	if (observationCoverageSeq === undefined) return "continue";

	const folded = foldLedger(ledger.records);
	const metrics = observationPoolMetrics(folded.activeObservations, runtime.config.observationsPoolTargetTokens);
	if (!metrics.ready) {
		debugLog("dropper.not_ready", {
			observationTokens: metrics.observationTokens,
			targetTokens: metrics.targetTokens,
			tokensOverTarget: metrics.tokensOverTarget,
			fullness: metrics.fullness,
			activeObservationCount: metrics.activeObservationCount,
			droppableCount: metrics.droppableCount,
			maxDropsAllowed: metrics.maxDropsAllowed,
		});
		return "continue";
	}

	const runtimeCtx = runtimeCtxOf(ctx);
	runtime.notify(
		runtimeCtx,
		`Observational memory: dropper running after reflection — active observation pool ~${metrics.observationTokens.toLocaleString()} / ${metrics.targetTokens.toLocaleString()} target tokens (${Math.round(metrics.fullness * 100).toLocaleString()}%)`,
		"info",
	);
	const target = resolveTargetOnce();
	if (!target) return "abort";

	const reflectionsForDropper = mergeReflections(folded.reflections, sameRunReflections);
	const droppedIds = await runDropper({
		ctx,
		target,
		reasoningEffort: runtime.config.model?.reasoningEffort,
		reflections: reflectionsForDropper,
		observations: folded.activeObservations,
		targetTokens: runtime.config.observationsPoolTargetTokens,
		maxTurns: runtime.config.agentMaxTurns,
		sessionId: agent.session.id,
	});
	// A drop's coverage must not exceed either stage's progress this run.
	const coversUpToSeq = Math.min(observationCoverageSeq, sameRunReflectionCoverageSeq);
	const data = droppedIds ? buildObservationsDroppedData(droppedIds, coversUpToSeq) : undefined;
	debugLog("dropper.append", {
		droppedIdsCount: droppedIds?.length ?? 0,
		coversUpToSeq,
		dataBuilt: data !== undefined,
		appended: data !== undefined,
	});
	if (data) appendRecord(cwd, ledger, { type: OM_OBSERVATIONS_DROPPED, data });
	return "continue";
}

function mergeReflections(existing: Reflection[], additional: Reflection[]): Reflection[] {
	const seen = new Set(existing.map((reflection) => reflection.id));
	const merged = [...existing];
	for (const reflection of additional) {
		if (seen.has(reflection.id)) continue;
		seen.add(reflection.id);
		merged.push(reflection);
	}
	return merged;
}
