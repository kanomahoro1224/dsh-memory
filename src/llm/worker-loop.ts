import type { Context } from "@deepseek-ai/cordis";
import {
	BlockAssembler,
	createToolResultMessage,
	createUserMessage,
	ReasoningEffortId,
} from "@deepseek-ai/dsh-llm";
import type { ContentBlock, GenerateOptions, Message, ToolSchema } from "@deepseek-ai/dsh-llm";
import type { SessionId } from "@deepseek-ai/dsh-session";
import { debugLog } from "../debug-log.js";

/**
 * Multi-turn tool-calling loop over `ctx.llm.stream()` for background memory
 * workers. This replaces the pi extension's `agentLoop` workers: each turn
 * streams one auxiliary assistant response, executes the recognized tool
 * calls locally, feeds the tool receipts back as user-role tool-result
 * messages, and stops when the model answers without tool calls or the turn
 * budget is exhausted.
 */

export const WORKER_PLUGIN_ID = "dsh-memory";
export const WORKER_MAX_TOKENS = 32_000;

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
	target: { provider: string; model: string };
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
export class WorkerStreamError extends Error {
	readonly kind: "error" | "aborted";
	readonly code: string | undefined;
	constructor(kind: "error" | "aborted", message: string, code?: string) {
		super(message);
		this.name = "WorkerStreamError";
		this.kind = kind;
		this.code = code;
	}
}

export async function runWorkerLoop(args: RunWorkerLoopArgs): Promise<void> {
	const { ctx, stage, target, signal } = args;
	const pluginMessageSource = { kind: "plugin" as const, plugin: WORKER_PLUGIN_ID };
	const tools: ToolSchema[] = args.tools.map((tool) => ({
		name: tool.name,
		description: tool.description,
		parameters: tool.parameters,
	}));

	const messages: Message[] = [
		createUserMessage({
			content: [{ type: "text", text: args.userText }],
			source: pluginMessageSource,
		}),
	];

	const maxTurns = args.maxTurns !== undefined && args.maxTurns > 0 ? args.maxTurns : 1;
	for (let turn = 0; turn < maxTurns; turn++) {
		const options: GenerateOptions = {
			provider: target.provider,
			model: target.model,
			messages,
			system: args.systemPrompt,
			tools,
			maxTokens: args.maxTokens ?? WORKER_MAX_TOKENS,
			...(args.sessionId !== undefined ? { sessionId: args.sessionId } : {}),
			...(args.reasoningEffort !== undefined ? { reasoningEffort: ReasoningEffortId(args.reasoningEffort) } : {}),
			...(signal !== undefined ? { signal } : {}),
		};

		const assembler = new BlockAssembler();
		for await (const chunk of ctx.llm.stream(options)) assembler.push(chunk);
		const finish = assembler.finish;
		if (finish.kind === "error" || finish.kind === "aborted") {
			throw new WorkerStreamError(finish.kind, finish.failure.message, finish.failure.code);
		}

		const blocks: ContentBlock[] = assembler.blocks();
		const toolCalls = blocks.filter(
			(block): block is Extract<ContentBlock, { type: "tool-call" }> => block.type === "tool-call",
		);
		if (toolCalls.length === 0) return;

		messages.push(assembler.message(pluginMessageSource));
		for (const call of toolCalls) {
			let receipt: string;
			try {
				const parsed: unknown = call.arguments.length > 0 ? JSON.parse(call.arguments) : {};
				const tool = args.tools.find((candidate) => candidate.name === call.name);
				if (!tool) {
					receipt = `Unknown tool "${call.name}".`;
					debugLog(`${stage}.worker_unknown_tool`, { name: call.name });
				} else {
					receipt = tool.execute(parsed);
				}
			} catch (error) {
				receipt = `Tool call failed: ${error instanceof Error ? error.message : String(error)}`;
				debugLog(`${stage}.worker_tool_error`, { name: call.name, error: receipt });
			}
			messages.push(createToolResultMessage({
				callId: call.id,
				content: [{ type: "text", text: receipt }],
				isError: false,
			}));
		}
	}
}
