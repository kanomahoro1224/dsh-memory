import { debugLog } from "./debug-log.js";
/**
 * Shared consolidation/compaction runtime state. Model resolution and auth
 * live in the harness LLM adapters, so this is bookkeeping only: config,
 * in-flight single-flight tracking, and worker-failure surfacing.
 */
export class Runtime {
    config;
    consolidationInFlight = false;
    consolidationPromise = null;
    consolidationPhase;
    lastObserverError;
    lastReflectorError;
    lastDropperError;
    /** Deliberate-empty backoff (#23): skip observer re-fires over the same span until enough new tokens arrive. */
    observerEmptyBackoff;
    constructor(config) {
        this.config = config;
    }
    notify(ctx, message, level = "info") {
        if (!this.config.showWorkerNotifications)
            return;
        if (!ctx.hasLogger || !ctx.logger)
            return;
        if (level === "warn")
            ctx.logger.warn(message);
        else
            ctx.logger.info(message);
    }
    launchConsolidationTask(ctx, work) {
        this.consolidationInFlight = true;
        this.consolidationPhase = undefined;
        this.lastObserverError = undefined;
        this.lastReflectorError = undefined;
        this.lastDropperError = undefined;
        const promise = this.launchTrackedTask(ctx, "consolidation", work, () => {
            this.consolidationInFlight = false;
            this.consolidationPhase = undefined;
            if (this.consolidationPromise === promise)
                this.consolidationPromise = null;
        });
        this.consolidationPromise = promise;
        return promise;
    }
    recordConsolidationStageError(ctx, phase, error) {
        const message = error instanceof Error ? error.message : String(error);
        if (phase === "observer")
            this.lastObserverError = message;
        if (phase === "reflector")
            this.lastReflectorError = message;
        if (phase === "dropper")
            this.lastDropperError = message;
        this.notify(ctx, `Observational memory: ${phase} failed: ${message}`, "warn");
        debugLog("stage.error", { phase, message });
        return message;
    }
    launchTrackedTask(ctx, label, work, onFinally) {
        const { hasLogger, logger } = ctx;
        return (async () => {
            let errorMessage;
            try {
                await work();
            }
            catch (error) {
                errorMessage = error instanceof Error ? error.message : String(error);
                if (hasLogger && logger)
                    logger.warn(`Observational memory: ${label} failed: ${errorMessage}`);
            }
            finally {
                onFinally(errorMessage);
            }
        })();
    }
}
//# sourceMappingURL=runtime.js.map