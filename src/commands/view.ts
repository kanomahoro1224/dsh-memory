import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { CommandResult } from "@deepseek-ai/dsh-commands";
import type { Runtime } from "../runtime.js";
import { cwdOf } from "../consolidation-trigger.js";
import {
	fullProjection,
	loadLedger,
	observationToSummaryLine,
	reflectionToSummaryLine,
	visibleProjection,
	type Projection,
} from "../ledger/index.js";

function renderList<T>(items: T[], render: (item: T) => string, empty: string): string {
	return items.length > 0 ? items.map(render).join("\n") : empty;
}

function renderContentOnlyProjection(projection: Projection, emptyScope: "visible" | "recorded"): string {
	return [
		"── Reflections ──",
		renderList(projection.reflections, reflectionToSummaryLine, `No ${emptyScope} reflections.`),
		"",
		"── Observations ──",
		renderList(projection.observations, observationToSummaryLine, `No ${emptyScope} observations.`),
	].join("\n");
}

export function registerViewCommand(ctx: Context, runtime: Runtime): void {
	void runtime;
	ctx.commands.register({
		name: "om-view",
		description: "Print observational memory content (visible by default, full for recorded memory)",
		handler: ({ agent, rawInput }: { agent: Agent; rawInput: string }): CommandResult => {
			const ledger = loadLedger(cwdOf(agent), agent.session.id);
			const mode = rawInput.trim().split(/\s+/)[0] || "visible";

			if (mode === "full") {
				return {
					kind: "success",
					text: renderContentOnlyProjection(fullProjection(ledger.records), "recorded"),
				};
			}

			if (mode !== "visible") {
				return { kind: "error", text: "Usage: /om-view [full]" };
			}

			return {
				kind: "success",
				text: renderContentOnlyProjection(visibleProjection(ledger.records), "visible"),
			};
		},
	});
}
