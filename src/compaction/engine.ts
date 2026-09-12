import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { BasicCompactionEngine } from "@deepseek-ai/dsh-compaction-basic";
import type { BasicCompactionConfig } from "@deepseek-ai/dsh-compaction-basic";
import type { CompactionResult, CompactionTrigger } from "@deepseek-ai/dsh-compaction";
import type { CommandId } from "@deepseek-ai/dsh-commands/brand";
import type { ContentBlock, Message, TokenUsage, ToolSchema } from "@deepseek-ai/dsh-llm";
import { deriveEventMessage, type Session, type SessionSeq } from "@deepseek-ai/dsh-session";
// Loads the cordis Context augmentation for `ctx.tokenMeter`.
import type {} from "@deepseek-ai/dsh-token-meter";
import { loadConfig, type Config } from "../config.js";
import {
	OM_COMPACTION,
	appendRecord,
	buildCompactionProjection,
	loadLedger,
	renderSummary,
} from "../ledger/index.js";
import { resolveTarget } from "../llm/target.js";

/** Provider label for the projection summary when no model target is resolvable. */
const OM_PROVIDER = "observational-memory";

/**
 * Structural copies of `dsh-compaction-basic/summarizer` types. The package
 * does not export them, and the `summarize()` hook is its documented subclass
 * seam; identical structures satisfy the override check.
 */
interface SummarizationInput {
	readonly tools?: readonly ToolSchema[];
	readonly messages: readonly Message[];
}

type SummaryResult = {
	summary: ContentBlock[];
	provider: string;
	model: string;
	maxTokens?: number;
	usage?: TokenUsage;
} & (
	| { rawOutput: ContentBlock[]; llmStreamCall: true }
	| { rawOutput?: ContentBlock[]; llmStreamCall?: never }
);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Map the observational-memory config onto the basic engine's vocabulary. */
function basicConfigFrom(config: Record<string, unknown>): BasicCompactionConfig {
	const om = loadConfig(config);
	const basic: BasicCompactionConfig = {
		thresholdRatio: om.thresholdRatio,
		// Passive mode keeps manual /compact (and this summarize hook) active
		// while disabling the automatic pressure/overflow listeners.
		auto: !om.passive,
	};
	if (om.retainTokens !== undefined) basic.retainTokens = om.retainTokens;
	else if (om.retainRatio !== undefined) basic.retainRatio = om.retainRatio;
	if (om.summarizationMaxTokens !== undefined) basic.maxTokens = om.summarizationMaxTokens;
	if (om.model) {
		basic.summarizationProvider = om.model.provider;
		basic.summarizationModel = om.model.model;
	}
	if (Array.isArray(config.modelPolicies)) basic.modelPolicies = config.modelPolicies as BasicCompactionConfig["modelPolicies"];
	if (typeof config.compactionRetries === "number") basic.compactionRetries = config.compactionRetries;
	if (typeof config.maxOverflowRetries === "number") basic.maxOverflowRetries = config.maxOverflowRetries;
	return basic;
}

/**
 * Resolve the retention boundary of the pending compaction: the surface node
 * that follows the shadowed span (pi's `firstKeptEntryId` analog).
 *
 * The shadowed span's last node is the surface node whose derived message id
 * matches the LAST message of the replayed summarization input (ids are
 * preserved by `deriveEventMessage`). `undefined` (nothing yet on the surface)
 * means fold everything; the session's next-seq sentinel means the shadowed
 * region reaches the surface tip, so everything visible folds too.
 */
export function resolveFirstKeptSeq(session: Session, messages: readonly Message[]): number | undefined {
	const surfaceNodes = session.surface.nodes;
	if (surfaceNodes.length === 0) return undefined;
	const idToSeq = new Map<string, SessionSeq>();
	for (const seq of surfaceNodes) {
		const event = session.eventAt(seq);
		if (!event || event.type === "system/message") continue;
		const message = deriveEventMessage(event);
		if (message) idToSeq.set(message.id, seq);
	}
	for (let i = messages.length - 1; i >= 0; i--) {
		const seq = idToSeq.get(messages[i].id);
		if (seq === undefined) continue;
		const idx = surfaceNodes.indexOf(seq);
		if (idx >= 0 && idx + 1 < surfaceNodes.length) return surfaceNodes[idx + 1];
		return session.seq;
	}
	return session.seq;
}

function meterTokens(ctx: Context, agent: Agent): number | undefined {
	try {
		const tokens = ctx.tokenMeter.measure(agent.session).totalTokens;
		return typeof tokens === "number" && Number.isFinite(tokens) ? tokens : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Observational-memory compaction backend: a BasicCompactionEngine whose
 * summaries are projections of the observational-memory ledger (reflections +
 * observations) instead of a native model summary. Loading it REPLACES the
 * built-in compaction-basic row: point the profile's `compaction-basic` row at
 * this module, or insert it after disabling that row.
 *
 * When the ledger has nothing shadowable, `summarize()` falls back to
 * `super.summarize()` (pi's "decline ownership"), so fresh sessions compact
 * exactly like stock basic. The replay/retention/lock machinery is inherited
 * unchanged.
 */
export class ObservationalMemoryEngine extends BasicCompactionEngine {
	/** Resolved observational-memory config; the plugin overlay reads this. */
	readonly omConfig: Config;

	constructor(ctx: Context, config: Record<string, unknown> = {}) {
		super(ctx, basicConfigFrom(config));
		this.omConfig = loadConfig(config);
	}

	protected override async summarize(input: SummarizationInput, agent: Agent, signal?: AbortSignal): Promise<SummaryResult> {
		void signal;
		const cwd = agent.session.header.cwd ?? process.cwd();
		const ledger = loadLedger(cwd, agent.session.id);
		if (ledger.records.length > 0) {
			const firstKeptSeq = resolveFirstKeptSeq(agent.session, input.messages);
			const projection = buildCompactionProjection(ledger.records, firstKeptSeq, {
				observationsPoolMaxTokens: this.omConfig.observationsPoolMaxTokens,
			});
			const text = renderSummary(projection.reflections, projection.observations);
			if (text) {
				// Unmarked template summarizer: no llmStreamCall, no usage — the
				// projection is built locally, and the transaction frames it.
				const target = resolveTarget(this.omConfig, agent) ?? { provider: OM_PROVIDER, model: "projection" };
				return { summary: [{ type: "text", text }], provider: target.provider, model: target.model };
			}
		}
		// Decline ownership so the default summarizer preserves the pre-cut context.
		return super.summarize(input, agent, signal);
	}

	override async compactIfNeeded(agent: Agent, trigger: CompactionTrigger, signal: AbortSignal): Promise<CompactionResult | null> {
		const preNodes = [...agent.session.surface.nodes];
		const result = await super.compactIfNeeded(agent, trigger, signal);
		if (result) this.recordCompaction(agent, result, preNodes);
		return result;
	}

	override async compactNow(agent: Agent, signal: AbortSignal, sourceCommandId?: CommandId): Promise<CompactionResult | null> {
		const preNodes = [...agent.session.surface.nodes];
		const result = await super.compactNow(agent, signal, sourceCommandId);
		if (result) this.recordCompaction(agent, result, preNodes);
		return result;
	}

	override async compactRegion(start: SessionSeq, end: SessionSeq, agent: Agent, signal?: AbortSignal): Promise<CompactionResult> {
		const preNodes = [...agent.session.surface.nodes];
		const result = await super.compactRegion(start, end, agent, signal);
		this.recordCompaction(agent, result, preNodes);
		return result;
	}

	/**
	 * Append the om/compaction ledger record after a successful compaction: the
	 * retention boundary, whether the projection full-folded, and the exact
	 * projection the summary carried (pi's `details`). Recomputed from the
	 * ledger rather than stashed from summarize(), so concurrent compactions of
	 * different sessions cannot cross wires.
	 */
	private recordCompaction(agent: Agent, result: CompactionResult, preNodes: readonly SessionSeq[]): void {
		try {
			const cwd = agent.session.header.cwd ?? process.cwd();
			const ledger = loadLedger(cwd, agent.session.id);
			// compactIfNeeded may commit several retry attempts internally; only
			// the latest result is observable. Its later retention boundary covers
			// every marker an earlier attempt shadowed, so recording it alone is
			// correct for future projections.
			const endIdx = preNodes.indexOf(result.shadowedRange.end);
			const firstKeptSeq = endIdx >= 0 && endIdx + 1 < preNodes.length ? preNodes[endIdx + 1] : agent.session.seq;
			const projection = buildCompactionProjection(ledger.records, firstKeptSeq, {
				observationsPoolMaxTokens: this.omConfig.observationsPoolMaxTokens,
			});
			const tokens = meterTokens(this.ctx, agent);
			if (tokens !== undefined) ledger.anchors.compaction = { atSeq: agent.session.seq, tokens };
			appendRecord(cwd, ledger, {
				type: OM_COMPACTION,
				data: {
					firstKeptSeq,
					shadowedThroughSeq: result.shadowedRange.end,
					fullFold: projection.fullFold,
					observations: projection.observations,
					reflections: projection.reflections,
				},
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.ctx.logger.warn(`observational memory: failed to record compaction bookkeeping: ${message}`);
		}
	}
}

// Class-form row loader expects a default export; entry.js re-exports it too,
// and the package "./engine" subpath points here.
export default ObservationalMemoryEngine;
