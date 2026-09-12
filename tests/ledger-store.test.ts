import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	appendRecord,
	emptyLedger,
	loadLedger,
	saveLedger,
} from "../src/ledger/store.js";
import { makeObservation, observationsRecorded } from "./helpers/ledger.js";

const dirs: string[] = [];

function tempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "om-store-"));
	dirs.push(dir);
	return dir;
}

afterEach(() => {
	while (dirs.length > 0) {
		const dir = dirs.pop();
		if (dir) rmSync(dir, { recursive: true, force: true });
	}
});

describe("ledger store", () => {
	it("saves, loads, and appends records atomically per session", () => {
		const cwd = tempDir();
		const sessionId = "session/abc-123";
		const ledger = emptyLedger(sessionId);

		const obs = makeObservation({ id: "aaaaaaaaaaaa" });
		appendRecord(cwd, ledger, observationsRecorded([obs], 7));

		const loaded = loadLedger(cwd, sessionId);
		expect(loaded.sessionId).toBe(sessionId);
		expect(loaded.records).toHaveLength(1);
		expect(loaded.records[0]).toEqual(observationsRecorded([obs], 7));
	});

	it("keeps separate sessions in separate files", () => {
		const cwd = tempDir();
		const a = emptyLedger("session-a");
		const b = emptyLedger("session-b");
		appendRecord(cwd, a, observationsRecorded([makeObservation({ id: "aaaaaaaaaaaa" })], 1));

		expect(loadLedger(cwd, "session-a").records).toHaveLength(1);
		expect(loadLedger(cwd, "session-b").records).toHaveLength(0);
		void b;
	});

	it("restarts from an empty ledger when the file is corrupt", () => {
		const cwd = tempDir();
		const sessionId = "s1";
		saveLedger(cwd, emptyLedger(sessionId));
		const path = join(cwd, ".dsh", "observational-memory", "sessions", "s1.json");
		const raw = readFileSync(path, "utf-8");
		const corrupt = raw.replace(`"sessionId": "${sessionId}"`, '"sessionId": "other"');
		writeFileSync(path, corrupt);

		const loaded = loadLedger(cwd, sessionId);
		expect(loaded.records).toHaveLength(0);
		expect(loaded.sessionId).toBe(sessionId);
	});

	it("round-trips compaction anchors and full compaction details", () => {
		const cwd = tempDir();
		const ledger = emptyLedger("s2");
		ledger.anchors.compaction = { atSeq: 42, tokens: 1234 };
		const obs = makeObservation({ id: "aaaaaaaaaaaa" });
		appendRecord(cwd, ledger, {
			type: "om/compaction",
			data: { firstKeptSeq: 10, shadowedThroughSeq: 9, fullFold: true, observations: [obs], reflections: [] },
		});

		const loaded = loadLedger(cwd, "s2");
		expect(loaded.anchors.compaction).toEqual({ atSeq: 42, tokens: 1234 });
		expect(loaded.records[0]?.type).toBe("om/compaction");
	});
});
