/**
 * Class-form plugin entry for the compaction-basic row replacement.
 *
 * A profile patch points the `compaction-basic` row at this module; the
 * loader instantiates the default-exported class with the row config and the
 * CompactionEngine base registers it as the `compaction` service.
 */
export { ObservationalMemoryEngine as default, resolveFirstKeptSeq } from "./engine.js";
//# sourceMappingURL=entry.js.map