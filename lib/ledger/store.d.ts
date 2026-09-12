import { type Ledger, type LedgerRecord } from "./types.js";
export declare function emptyLedger(sessionId: string): Ledger;
export declare function loadLedger(cwd: string, sessionId: string): Ledger;
export declare function saveLedger(cwd: string, ledger: Ledger): void;
export declare function appendRecord(cwd: string, ledger: Ledger, record: LedgerRecord): void;
