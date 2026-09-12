import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { BasicCompactionEngine } from "@deepseek-ai/dsh-compaction-basic";
import type { CompactionResult, CompactionTrigger } from "@deepseek-ai/dsh-compaction";
import type { CommandId } from "@deepseek-ai/dsh-commands/brand";
import type { ContentBlock, Message, TokenUsage, ToolSchema } from "@deepseek-ai/dsh-llm";
import { type Session, type SessionSeq } from "@deepseek-ai/dsh-session";
import { type Config } from "../config.js";
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
} & ({
    rawOutput: ContentBlock[];
    llmStreamCall: true;
} | {
    rawOutput?: ContentBlock[];
    llmStreamCall?: never;
});
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
export declare function resolveFirstKeptSeq(session: Session, messages: readonly Message[]): number | undefined;
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
export declare class ObservationalMemoryEngine extends BasicCompactionEngine {
    /** Resolved observational-memory config; the plugin overlay reads this. */
    readonly omConfig: Config;
    constructor(ctx: Context, config?: Record<string, unknown>);
    protected summarize(input: SummarizationInput, agent: Agent, signal?: AbortSignal): Promise<SummaryResult>;
    compactIfNeeded(agent: Agent, trigger: CompactionTrigger, signal: AbortSignal): Promise<CompactionResult | null>;
    compactNow(agent: Agent, signal: AbortSignal, sourceCommandId?: CommandId): Promise<CompactionResult | null>;
    compactRegion(start: SessionSeq, end: SessionSeq, agent: Agent, signal?: AbortSignal): Promise<CompactionResult>;
    /**
     * Append the om/compaction ledger record after a successful compaction: the
     * retention boundary, whether the projection full-folded, and the exact
     * projection the summary carried (pi's `details`). Recomputed from the
     * ledger rather than stashed from summarize(), so concurrent compactions of
     * different sessions cannot cross wires.
     */
    private recordCompaction;
}
export default ObservationalMemoryEngine;
