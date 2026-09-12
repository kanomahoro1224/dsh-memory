import type { Context } from "@deepseek-ai/cordis";
import type { SessionId } from "@deepseek-ai/dsh-session";
/**
 * Multi-turn tool-calling loop over `ctx.llm.stream()` for background memory
 * workers. This replaces the pi extension's `agentLoop` workers: each turn
 * streams one auxiliary assistant response, executes the recognized tool
 * calls locally, feeds the tool receipts back as user-role tool-result
 * messages, and stops when the model answers without tool calls or the turn
 * budget is exhausted.
 */
export declare const WORKER_PLUGIN_ID = "dsh-memory";
export declare const WORKER_MAX_TOKENS = 32000;
export interface WorkerTool {
    name: string;
    description: string;
    /** JSON Schema object for the arguments. */
    parameters: Record<string, unknown>;
    /** Execute one parsed call and return the plain-text receipt fed back to the model. */
    execute(args: unknown): string;
}
export interface RunWorkerLoopArgs {
    ctx: Context;
    stage: "observer" | "reflector" | "dropper";
    target: {
        provider: string;
        model: string;
    };
    systemPrompt: string;
    userText: string;
    tools: WorkerTool[];
    maxTurns?: number;
    maxTokens?: number;
    reasoningEffort?: string;
    sessionId?: SessionId;
    signal?: AbortSignal;
}
/** Thrown when an auxiliary worker stream ends with an API/abort failure without producing usable work. */
export declare class WorkerStreamError extends Error {
    readonly kind: "error" | "aborted";
    readonly code: string | undefined;
    constructor(kind: "error" | "aborted", message: string, code?: string);
}
export declare function runWorkerLoop(args: RunWorkerLoopArgs): Promise<void>;
