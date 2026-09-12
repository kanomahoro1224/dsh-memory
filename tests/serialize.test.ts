import { describe, expect, it } from "vitest";
import {
	renderRecallSourceEvents,
	renderSourceEvent,
	serializeSourceAddressedEvents,
} from "../src/serialize.js";
import { assistantEvent, toolResultEvent, userEvent } from "./helpers/ledger.js";

describe("renderSourceEvent", () => {
	it("labels user, assistant, and tool-result events with local timestamps", () => {
		const toolCall = assistantEvent(1, "working", 0);
		const rendered = renderSourceEvent(userEvent(0, "hello", Date.UTC(2026, 0, 2, 10, 30)));
		expect(rendered).toMatch(/^\[User @ \d{4}-\d{2}-\d{2} \d{2}:\d{2}\]: hello$/);

		const assistant = renderSourceEvent(toolCall);
		expect(assistant).toMatch(/^\[Assistant @ /);
		expect(assistant).toContain("working");
	});

	it("labels pure tool-result user messages with the originating tool name", () => {
		// seq 1 carries the assistant tool call; seq 2 is its pure tool-result user message.
		const withCall = {
			...assistantEvent(1, "", 1_000),
		} as never;
		void withCall;
		const toolResult = toolResultEvent(2, "file contents", 2_000);
		const rendered = renderSourceEvent(toolResult);
		expect(rendered).toMatch(/^\[Tool result for tool @ /);
	});
});

describe("serializeSourceAddressedEvents", () => {
	it("labels each block with the source event seq and keeps full coverage under the budget", () => {
		const events = [userEvent(0, "a".repeat(40), 1), assistantEvent(1, "b".repeat(40), 2), userEvent(2, "c".repeat(40), 3)];

		const result = serializeSourceAddressedEvents(events, { maxTokens: 10_000 });

		expect(result.sourceEventSeqs).toEqual([0, 1, 2]);
		expect(result.truncatedSourceEventSeqs).toEqual([]);
		expect(result.text).toContain("[Source event seq: 0]");
		expect(result.text).toContain("[Source event seq: 2]");
		expect(result.estimatedTokens).toBeGreaterThan(0);
	});

	it("caps the chunk at the budget, keeping a prefix of complete events", () => {
		const events = [userEvent(0, "a".repeat(400), 1), userEvent(1, "b".repeat(400), 2), userEvent(2, "c".repeat(400), 3)];

		const result = serializeSourceAddressedEvents(events, { maxTokens: 120 });

		expect(result.sourceEventSeqs.length).toBeLessThan(3);
		expect(result.sourceEventSeqs.length).toBeGreaterThan(0);
		expect(result.estimatedTokens).toBeLessThanOrEqual(120);
		// Coverage is a prefix: the capped chunk must cover the earliest events.
		expect(result.sourceEventSeqs[0]).toBe(0);
	});

	it("represents an oversized first event as a marked head/tail excerpt", () => {
		const events = [userEvent(0, "huge".repeat(1_000), 1)];

		const result = serializeSourceAddressedEvents(events, { maxTokens: 300 });

		expect(result.sourceEventSeqs).toEqual([0]);
		expect(result.truncatedSourceEventSeqs).toEqual([0]);
		expect(result.text).toContain("[… middle omitted");
		expect(result.estimatedTokens).toBeLessThanOrEqual(300);
	});

	it("skips system events", () => {
		const result = serializeSourceAddressedEvents([], {});
		expect(result.text).toBe("");
		expect(result.sourceEventSeqs).toEqual([]);
	});
});

describe("renderRecallSourceEvents", () => {
	it("joins rendered events with blank lines", () => {
		const text = renderRecallSourceEvents([userEvent(0, "first", 1), userEvent(1, "second", 2)]);
		expect(text).toContain("first");
		expect(text).toContain("second");
		expect(text.split("\n\n").length).toBe(2);
	});
});
