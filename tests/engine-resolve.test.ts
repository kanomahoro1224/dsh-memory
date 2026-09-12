import { describe, expect, it } from "vitest";
import type { Session, SessionEvent } from "@deepseek-ai/dsh-session";
import { resolveFirstKeptSeq } from "../src/compaction/engine.js";
import { assistantEvent, userEvent } from "./helpers/ledger.js";

/** Stub a Session with only the members resolveFirstKeptSeq consumes. */
function stubSession(surfaceNodes: number[], events: Map<number, SessionEvent>, nextSeq: number): Session {
	return {
		surface: { nodes: surfaceNodes },
		eventAt: (seq: number) => events.get(seq),
		seq: nextSeq,
	} as unknown as Session;
}

describe("resolveFirstKeptSeq", () => {
	it("returns the surface node after the last shadowed node (matched by message id)", () => {
		const events = new Map<number, SessionEvent>([
			[0, userEvent(0, "one")],
			[1, assistantEvent(1, "two")],
			[2, userEvent(2, "three")],
			[3, userEvent(3, "kept")],
		]);
		const session = stubSession([0, 1, 2, 3], events, 4);
		const messages = [
			{ id: "user-0" },
			{ id: "assistant-1" },
			{ id: "user-2" },
		] as never[];

		expect(resolveFirstKeptSeq(session, messages)).toBe(3);
	});

	it("returns the next-seq sentinel when the shadowed span reaches the surface tip", () => {
		const events = new Map<number, SessionEvent>([[2, userEvent(2, "tip")]]);
		const session = stubSession([0, 1, 2], events, 9);
		expect(resolveFirstKeptSeq(session, [{ id: "user-2" }] as never)).toBe(9);
	});

	it("falls back to the sentinel when no message id matches the surface", () => {
		const events = new Map<number, SessionEvent>([[0, userEvent(0, "one")]]);
		const session = stubSession([0], events, 5);
		expect(resolveFirstKeptSeq(session, [{ id: "unknown" }] as never)).toBe(5);
	});

	it("ignores the system head when matching ids", () => {
		const system = {
			type: "system/message",
			seq: 0,
			time: 1,
			data: { message: { id: "system-0", role: "system", content: [] } },
		} as unknown as SessionEvent;
		const events = new Map<number, SessionEvent>([[0, system], [1, userEvent(1, "one")]]);
		const session = stubSession([0, 1], events, 2);
		// Only the system message id is present: no region correlation, full fold.
		expect(resolveFirstKeptSeq(session, [{ id: "system-0" }] as never)).toBe(2);
		expect(resolveFirstKeptSeq(session, [{ id: "system-0" }, { id: "user-1" }] as never)).toBe(2);
	});

	it("returns undefined on an empty surface", () => {
		const session = stubSession([], new Map(), 0);
		expect(resolveFirstKeptSeq(session, [{ id: "user-0" }] as never)).toBeUndefined();
	});
});
