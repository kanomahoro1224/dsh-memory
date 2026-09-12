export declare const DEBUG_LOG_MAX_BYTES: number;
export declare const DEBUG_LOG_RELATIVE_PATH: string;
export declare const DEBUG_LOG_SESSION_DIR_RELATIVE_PATH: string;
export interface DebugLogContext {
    enabled: boolean;
    cwd?: string;
    sessionId?: string;
    runId?: string;
}
export declare function withDebugLogContext<T>(context: DebugLogContext, fn: () => T): T;
export declare function safeDebugLogSessionId(sessionId: string | undefined): string | undefined;
/** Filesystem root for plugin state (ledger store + debug log): `<cwd>/.dsh`. */
export declare function pluginStateDir(cwd: string): string;
export declare function debugLogRelativePath(context: Pick<DebugLogContext, "sessionId">): string;
export declare function debugLog(event: string, data?: Record<string, unknown>): void;
