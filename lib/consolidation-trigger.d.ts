import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { SessionEvent } from "@deepseek-ai/dsh-session";
import type { Runtime } from "./runtime.js";
import { OM_OBSERVATIONS_RECORDED, OM_REFLECTIONS_RECORDED, type Ledger } from "./ledger/index.js";
/**
 * The agent's visible surface in display order. Non-surface events (turn
 * boundaries, attempts) are excluded by construction.
 */
export declare function surfaceEventsOf(agent: Agent): readonly SessionEvent[];
export declare function meterTokens(ctx: Context, agent: Agent): number | undefined;
export declare function cwdOf(agent: Agent): string;
/**
 * Real (metered) growth since the anchor snapshot when measurable; otherwise
 * the raw surface estimate, which self-limits after coverage and cannot
 * over-fire or starve.
 */
export declare function stageProgress(ledger: Ledger, currentTokens: number | undefined, coverageType: typeof OM_OBSERVATIONS_RECORDED | typeof OM_REFLECTIONS_RECORDED, surfaceEvents: readonly SessionEvent[]): number;
export declare function registerConsolidationTrigger(ctx: Context, runtime: Runtime): void;
export declare function runConsolidationPipeline(ctx: Context, runtime: Runtime, agent: Agent, cwd: string, ledger: Ledger): Promise<void>;
