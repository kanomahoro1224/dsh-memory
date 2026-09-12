import { describe, expect, it } from "vitest";
import type { Context } from "@deepseek-ai/cordis";
import type { GenerateOptions, StreamChunk } from "@deepseek-ai/dsh-llm";
import { runWorkerLoop, WorkerStreamError } from "../src/llm/worker-loop.js";

function toolCallChunks(index: number, id: string, name: string, args: unknown): StreamChunk[] {
	const block = { type: "tool-call", id, name, arguments: JSON.stringify(args) } as never;
	return [
		{ type: "block-start", index, blockType: "tool-call" },
		{ type: "tool-call-delta", index, id, name, argumentsDelta: JSON.stringify(args) },
		{ type: "block-end", index, block },
		{ type: "finish", reason: { kind: "stop" } },
	] as StreamChunk[];
}

function textChunks(index: number, text: string): StreamChunk[] {
	const block = { type: "text", text } as never;
	return [
		{ type: "block-start", index, blockType: "text" },
		{ type: "text-delta", index, text },
		{ type: "block-end", index, block },
		{ type: "finish", reason: { kind: "stop" } },
	] as StreamChunk[];
}

/** Build a fake cordis ctx exposing only what runWorkerLoop consumes: ctx.llm.stream. */
function fakeCtx(turns: Array<{ chunks: StreamChunk[]; capture?: (options: GenerateOptions) => void }>): Context {
	let turn = 0;
	return {
		llm: {
			async *stream(options: GenerateOptions) {
				const scripted = turns[turn];
				turn++;
				if (!scripted) throw new Error(`unexpected extra turn ${turn}`);
				scripted.capture?.(options);
				for (const chunk of scripted.chunks) yield chunk;
			},
		},
	} as unknown as Context;
}

describe("runWorkerLoop", () => {
	it("executes tool calls locally, feeds receipts back, and stops on a plain reply", async () => {
		const receipts: string[] = [];
		const calls: GenerateOptions[] = [];
		const ctx = fakeCtx([
			{
				chunks: toolCallChunks(0, "call-1", "record_observations", { observations: [{ content: "x" }] }),
				capture: (options) => calls.push(options),
			},
			{
				chunks: textChunks(0, "done"),
				capture: (options) => calls.push(options),
			},
		]);

		await runWorkerLoop({
			ctx,
			stage: "observer",
			target: { provider: "deepseek", model: "deepseek-chat" },
			systemPrompt: "system",
			userText: "user",
			maxTurns: 3,
			tools: [{
				name: "record_observations",
				description: "record",
				parameters: { type: "object" },
				execute: (raw) => {
					receipts.push(JSON.stringify(raw));
					return `Recorded 1 (${(raw as { observations: unknown[] }).observations.length}).`;
				},
			}],
		});

		expect(receipts).toEqual([JSON.stringify({ observations: [{ content: "x" }] })]);
		expect(calls).toHaveLength(2);
		// Second turn carries the assistant tool-call message plus the tool receipt.
		const followup = calls[1]?.messages ?? [];
		expect(followup).toHaveLength(3);
		expect(followup[1]?.role).toBe("assistant");
		expect(followup[2]?.role).toBe("user");
		expect(JSON.stringify(followup[2]?.content)).toContain("Recorded 1");
	});

	it("throws WorkerStreamError on error finishes and respects maxTurns", async () => {
		const errorCtx = fakeCtx([
			{
				chunks: [
					{ type: "finish", reason: { kind: "error", failure: { message: "boom", code: "E1" } } },
				] as StreamChunk[],
			},
		]);
		await expect(runWorkerLoop({
			ctx: errorCtx,
			stage: "observer",
			target: { provider: "p", model: "m" },
			systemPrompt: "s",
			userText: "u",
			tools: [],
		})).rejects.toBeInstanceOf(WorkerStreamError);

		let turns = 0;
		const loopCtx = fakeCtx([
			{ chunks: toolCallChunks(0, "c", "t", {}) },
			{ chunks: toolCallChunks(0, "c", "t", {}) },
			{ chunks: toolCallChunks(0, "c", "t", {}) },
		].map((entry) => ({ ...entry, capture: () => turns++ })));
		await runWorkerLoop({
			ctx: loopCtx,
			stage: "dropper",
			target: { provider: "p", model: "m" },
			systemPrompt: "s",
			userText: "u",
			maxTurns: 2,
			tools: [{ name: "t", description: "t", parameters: { type: "object" }, execute: () => "ok" }],
		});
		expect(turns).toBe(2);
	});
});
