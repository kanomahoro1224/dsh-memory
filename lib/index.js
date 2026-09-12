import { ObservationalMemoryEngine } from "./compaction/engine.js";
import { loadConfig } from "./config.js";
import { Runtime } from "./runtime.js";
import { registerConsolidationTrigger } from "./consolidation-trigger.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerViewCommand } from "./commands/view.js";
import { registerRecallTool } from "./tools/recall.js";
export const name = "dsh-memory";
export const inject = ["compaction", "llm", "tokenMeter", "commands", "tools"];
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
export function apply(ctx, config = {}) {
    const engine = ctx.compaction;
    const engineConfig = engine instanceof ObservationalMemoryEngine ? engine.omConfig : undefined;
    if (!engineConfig) {
        ctx.logger.warn("observational memory: ctx.compaction is not ObservationalMemoryEngine — " +
            "compaction summaries will use the default backend. Disable the built-in compaction-basic row " +
            "and insert dsh-memory/engine instead (see README).");
    }
    const omConfig = loadConfig({ ...(engineConfig ?? {}), ...config });
    const runtime = new Runtime(omConfig);
    registerConsolidationTrigger(ctx, runtime);
    registerStatusCommand(ctx, runtime);
    registerViewCommand(ctx, runtime);
    registerRecallTool(ctx);
}
export { ObservationalMemoryEngine } from "./compaction/engine.js";
export { loadConfig } from "./config.js";
//# sourceMappingURL=index.js.map