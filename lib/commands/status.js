import { observationPoolMetrics } from "../agents/dropper/pool.js";
import { cwdOf, meterTokens, stageProgress, surfaceEventsOf } from "../consolidation-trigger.js";
import { diffProjection, foldLedger, fullProjection, loadLedger, OM_OBSERVATIONS_RECORDED, OM_REFLECTIONS_RECORDED, rawTokensSinceSurfaceAnchor, realTokensSinceAnchor, visibleProjection, } from "../ledger/index.js";
function pct(current, total) {
    return total > 0 ? Math.round((current / total) * 100) : 0;
}
function tokenSum(items) {
    return items.reduce((sum, item) => sum + item.tokenCount, 0);
}
function addedSuffix(count) {
    return count > 0 ? `+${count.toLocaleString()}` : undefined;
}
function removedSuffix(count) {
    return count > 0 ? `-${count.toLocaleString()}` : undefined;
}
function appendSuffixes(line, suffixes) {
    const rendered = suffixes.filter((suffix) => suffix !== undefined);
    return rendered.length > 0 ? `${line} ${rendered.join(" ")}` : line;
}
export function registerStatusCommand(ctx, runtime) {
    ctx.commands.register({
        name: "om-status",
        description: "Show observational memory status",
        handler: ({ agent }) => {
            const cwd = cwdOf(agent);
            const ledger = loadLedger(cwd, agent.session.id);
            const records = ledger.records;
            const surfaceEvents = surfaceEventsOf(agent);
            const currentTokens = meterTokens(ctx, agent);
            const folded = foldLedger(records);
            const visible = visibleProjection(records);
            const full = fullProjection(records);
            const drift = diffProjection(visible, full);
            const visibleObservationTokens = tokenSum(visible.observations);
            const visibleReflectionTokens = tokenSum(visible.reflections);
            const activeObservationPool = observationPoolMetrics(folded.activeObservations, runtime.config.observationsPoolTargetTokens);
            const observationLine = appendSuffixes(`Observations: ${folded.observations.length} recorded / ${folded.droppedObservationIds.size} dropped / ${folded.activeObservations.length} active / ${visible.observations.length} visible`, [
                addedSuffix(drift.observationsOnlyInFull.length),
                removedSuffix(drift.droppedOnlyInFull.length),
            ]);
            const reflectionLine = appendSuffixes(`Reflections:  ${folded.reflections.length} recorded / ${visible.reflections.length} visible`, [addedSuffix(drift.reflectionsOnlyInFull.length)]);
            const obsProgress = stageProgress(ledger, currentTokens, OM_OBSERVATIONS_RECORDED, surfaceEvents);
            const reflectionProgress = stageProgress(ledger, currentTokens, OM_REFLECTIONS_RECORDED, surfaceEvents);
            // Compaction progress: metered growth since the last compaction anchor
            // when measurable, else source tokens still visible above the newest
            // compaction checkpoint. The absolute threshold lives in the compaction
            // engine (thresholdRatio x model context window), which is not
            // observable from here, so only the ratio is shown.
            const compactionAnchor = realTokensSinceAnchor(currentTokens, ledger.anchors.compaction?.tokens);
            const compactionProgress = compactionAnchor ?? rawTokensSinceSurfaceAnchor(surfaceEvents, undefined);
            const thresholdPercent = Math.round(runtime.config.thresholdRatio * 100);
            const passiveLines = runtime.config.passive
                ? [
                    "── Mode ──",
                    "Passive: automatic memory workers and auto-compaction disabled; manual compaction, commands, and recall remain active",
                    "",
                ]
                : [];
            const lines = [
                ...passiveLines,
                "── Memory ──",
                observationLine,
                reflectionLine,
                "",
                "── Activity ──",
                `Next observation: ~${obsProgress.toLocaleString()} / ${runtime.config.observeAfterTokens.toLocaleString()} tokens (${pct(obsProgress, runtime.config.observeAfterTokens)}%)`,
                `Next reflection:  ~${reflectionProgress.toLocaleString()} / ${runtime.config.reflectAfterTokens.toLocaleString()} tokens (${pct(reflectionProgress, runtime.config.reflectAfterTokens)}%)`,
                `Next compaction:  ~${compactionProgress.toLocaleString()} tokens since last checkpoint (automatic at ~${thresholdPercent}% of the model context window)`,
                `Visible observation pool: ~${visibleObservationTokens.toLocaleString()} / ${runtime.config.observationsPoolMaxTokens.toLocaleString()} tokens (${pct(visibleObservationTokens, runtime.config.observationsPoolMaxTokens)}%)`,
                `Active observation pool: ~${activeObservationPool.observationTokens.toLocaleString()} / ${runtime.config.observationsPoolTargetTokens.toLocaleString()} target tokens (${pct(activeObservationPool.observationTokens, runtime.config.observationsPoolTargetTokens)}%)`,
                `Reflection pool:         ~${visibleReflectionTokens.toLocaleString()} tokens`,
            ];
            if (runtime.consolidationInFlight) {
                const phase = runtime.consolidationPhase ? ` (${runtime.consolidationPhase})` : "";
                lines.push("", "── In flight ──", `Consolidation: running${phase}`);
            }
            if (runtime.lastObserverError || runtime.lastReflectorError || runtime.lastDropperError) {
                lines.push("", "── Last error ──");
                if (runtime.lastObserverError)
                    lines.push(`Observer: ${runtime.lastObserverError}`);
                if (runtime.lastReflectorError)
                    lines.push(`Reflector: ${runtime.lastReflectorError}`);
                if (runtime.lastDropperError)
                    lines.push(`Dropper: ${runtime.lastDropperError}`);
            }
            return { kind: "success", text: lines.join("\n") };
        },
    });
}
//# sourceMappingURL=status.js.map