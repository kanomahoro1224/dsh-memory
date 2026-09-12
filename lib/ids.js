import { createHash } from "node:crypto";
export function hashId(content) {
    return createHash("sha256").update(content).digest("hex").slice(0, 12);
}
//# sourceMappingURL=ids.js.map