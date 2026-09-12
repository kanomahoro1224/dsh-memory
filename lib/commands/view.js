import { cwdOf } from "../consolidation-trigger.js";
import { fullProjection, loadLedger, observationToSummaryLine, reflectionToSummaryLine, visibleProjection, } from "../ledger/index.js";
function renderList(items, render, empty) {
    return items.length > 0 ? items.map(render).join("\n") : empty;
}
function renderContentOnlyProjection(projection, emptyScope) {
    return [
        "── Reflections ──",
        renderList(projection.reflections, reflectionToSummaryLine, `No ${emptyScope} reflections.`),
        "",
        "── Observations ──",
        renderList(projection.observations, observationToSummaryLine, `No ${emptyScope} observations.`),
    ].join("\n");
}
export function registerViewCommand(ctx, runtime) {
    void runtime;
    ctx.commands.register({
        name: "om-view",
        description: "Print observational memory content (visible by default, full for recorded memory)",
        handler: ({ agent, rawInput }) => {
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
//# sourceMappingURL=view.js.map