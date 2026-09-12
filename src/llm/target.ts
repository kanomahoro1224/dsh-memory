import type { Agent } from "@deepseek-ai/dsh-agent";
import type { Session } from "@deepseek-ai/dsh-session";
import type { ConfiguredModel } from "../config.js";

export type LlmTarget = { provider: string; model: string };

/** The exact provider/model durably routed for the latest request, when present. */
export function routedTarget(session: Session): LlmTarget | undefined {
	const config = session.requestHeader()?.config;
	if (config === undefined || config.provider.length === 0 || config.model.length === 0) return undefined;
	return { provider: config.provider, model: config.model };
}

/**
 * Resolve the model target for one auxiliary (worker/summarizer) call:
 * configured override, then the conversation's durable routed target, then
 * the agent's own routing options.
 */
export function resolveTarget(
	config: { model?: ConfiguredModel },
	agent: Agent,
): LlmTarget | undefined {
	if (config.model) return { provider: config.model.provider, model: config.model.model };
	const routed = routedTarget(agent.session);
	if (routed !== undefined) return routed;
	if (
		agent.options.provider !== undefined && agent.options.provider.length > 0
		&& agent.options.model !== undefined && agent.options.model.length > 0
	) {
		return { provider: agent.options.provider, model: agent.options.model };
	}
	return undefined;
}
