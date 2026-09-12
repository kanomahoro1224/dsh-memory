import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pluginStateDir, safeDebugLogSessionId } from "../debug-log.js";
import { isLedgerRecord, type Ledger, type LedgerRecord } from "./types.js";

/**
 * Per-session JSON ledger store. The ledger lives beside the session, not
 * inside it: `Session.append()` cannot stamp third-party events with the
 * `ignorable` marker, so custom records in the session log would make the
 * persisted session unreloadable. Writes are atomic (tmp file + rename).
 */

const STORE_DIR_SEGMENTS = join("observational-memory", "sessions");

function ledgerPath(cwd: string, sessionId: string): string {
	const safe = safeDebugLogSessionId(sessionId);
	if (!safe) throw new Error(`observational memory: unusable session id for store path: ${JSON.stringify(sessionId)}`);
	return join(pluginStateDir(cwd), STORE_DIR_SEGMENTS, `${safe}.json`);
}

export function emptyLedger(sessionId: string): Ledger {
	return { version: 1, sessionId, records: [], anchors: {} };
}

function parseLedger(raw: unknown, sessionId: string): Ledger {
	if (!raw || typeof raw !== "object") return emptyLedger(sessionId);
	const value = raw as Record<string, unknown>;
	if (value.version !== 1 || typeof value.sessionId !== "string" || value.sessionId !== sessionId) {
		return emptyLedger(sessionId);
	}
	const records = Array.isArray(value.records) ? value.records.filter(isLedgerRecord) : [];
	const anchors = (value.anchors && typeof value.anchors === "object" ? value.anchors : {}) as Ledger["anchors"];
	return { version: 1, sessionId, records, anchors };
}

export function loadLedger(cwd: string, sessionId: string): Ledger {
	const path = ledgerPath(cwd, sessionId);
	if (!existsSync(path)) return emptyLedger(sessionId);
	try {
		return parseLedger(JSON.parse(readFileSync(path, "utf-8")), sessionId);
	} catch {
		// A corrupt ledger must never take the session down; restart from empty.
		return emptyLedger(sessionId);
	}
}

export function saveLedger(cwd: string, ledger: Ledger): void {
	const path = ledgerPath(cwd, ledger.sessionId);
	mkdirSync(dirname(path), { recursive: true });
	const tmp = `${path}.tmp-${process.pid}-${Math.random().toString(16).slice(2, 8)}`;
	writeFileSync(tmp, `${JSON.stringify(ledger, null, "\t")}\n`, "utf-8");
	renameSync(tmp, path);
}

export function appendRecord(cwd: string, ledger: Ledger, record: LedgerRecord): void {
	ledger.records.push(record);
	saveLedger(cwd, ledger);
}
