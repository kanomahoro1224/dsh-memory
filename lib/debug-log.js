import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, mkdirSync, renameSync, statSync, unlinkSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
export const DEBUG_LOG_MAX_BYTES = 10 * 1024 * 1024;
export const DEBUG_LOG_RELATIVE_PATH = join("observational-memory", "debug.ndjson");
export const DEBUG_LOG_SESSION_DIR_RELATIVE_PATH = join("observational-memory", "debug");
const storage = new AsyncLocalStorage();
export function withDebugLogContext(context, fn) {
    const parent = storage.getStore();
    return storage.run({ ...parent, ...context }, fn);
}
export function safeDebugLogSessionId(sessionId) {
    const trimmed = sessionId?.trim();
    if (!trimmed)
        return undefined;
    const sanitized = trimmed
        .replace(/[^A-Za-z0-9._-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 128);
    if (!/[A-Za-z0-9]/.test(sanitized))
        return undefined;
    return sanitized;
}
/** Filesystem root for plugin state (ledger store + debug log): `<cwd>/.dsh`. */
export function pluginStateDir(cwd) {
    return join(cwd, ".dsh");
}
export function debugLogRelativePath(context) {
    const safeSessionId = safeDebugLogSessionId(context.sessionId);
    return safeSessionId
        ? join(DEBUG_LOG_SESSION_DIR_RELATIVE_PATH, `${safeSessionId}.ndjson`)
        : DEBUG_LOG_RELATIVE_PATH;
}
export function debugLog(event, data = {}) {
    const context = storage.getStore();
    if (context?.enabled !== true || !context.cwd)
        return;
    try {
        const path = join(pluginStateDir(context.cwd), debugLogRelativePath(context));
        mkdirSync(dirname(path), { recursive: true });
        rotateIfNeeded(path);
        const payload = {
            ts: new Date().toISOString(),
            event,
            cwd: context.cwd,
            sessionId: context.sessionId,
            runId: context.runId,
            data,
        };
        appendFileSync(path, `${JSON.stringify(payload)}\n`, "utf-8");
    }
    catch {
        // Debug logging must never affect memory behavior.
    }
}
function rotateIfNeeded(path) {
    if (!existsSync(path))
        return;
    if (statSync(path).size < DEBUG_LOG_MAX_BYTES)
        return;
    const backupPath = `${path}.1`;
    if (existsSync(backupPath))
        unlinkSync(backupPath);
    renameSync(path, backupPath);
}
//# sourceMappingURL=debug-log.js.map