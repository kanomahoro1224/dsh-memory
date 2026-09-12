import type { Agent } from "@deepseek-ai/dsh-agent";
import type { Session } from "@deepseek-ai/dsh-session";
import type { ConfiguredModel } from "../config.js";
export type LlmTarget = {
    provider: string;
    model: string;
};
/** The exact provider/model durably routed for the latest request, when present. */
export declare function routedTarget(session: Session): LlmTarget | undefined;
/**
 * Resolve the model target for one auxiliary (worker/summarizer) call:
 * configured override, then the conversation's durable routed target, then
 * the agent's own routing options.
 */
export declare function resolveTarget(config: {
    model?: ConfiguredModel;
}, agent: Agent): LlmTarget | undefined;
