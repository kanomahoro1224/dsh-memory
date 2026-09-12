import type { Context } from "@deepseek-ai/cordis";
export declare const name = "dsh-memory";
export declare const inject: string[];
/**
 * Observational-memory plugin for DeepSeek Harness. Pair this plugin row with
 * the `compaction-basic` row replacement (see ./compaction/entry.ts): the
 * engine turns compaction summaries into ledger projections, this plugin runs
 * the observer/reflector/dropper workers and exposes the commands and recall
 * tool.
 *
 * Config precedence: this row's config overlays the engine row's resolved
 * config, so setting everything on this row and leaving the engine row bare
 * works; the engine's own row config is the fallback when the plugin row omits
 * fields.
 */
export declare function apply(ctx: Context, config?: Record<string, unknown>): void;
export { ObservationalMemoryEngine } from "./compaction/engine.js";
export { loadConfig, type Config } from "./config.js";
