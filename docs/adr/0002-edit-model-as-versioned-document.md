# 0002 · The edit model is one versioned JSON document, changed only by ops

**Status:** accepted · 2026-11-15

**Context.** The brief requires undo, explain-on-hover, pinning and live collaboration, and every AI operation must be a pure transformation that explains itself.

**Decision.** Each project has one `EditDoc` (zod schema in `packages/core`). Every change, from the user or an autopilot, is a `Change { ops[], reason, actor }` where each op is reversible (`set/insert/remove/move` with `prev`). Convex stores the head snapshot plus the append-only op log (`editOps`). Mutations apply ops with optimistic version checks (`baseVersion`), so concurrent editors rebase rather than overwrite. User changes add their paths to `pins`; `applyAutopilot` drops ops that touch pinned paths.

**Consequences.** Undo = invert the last change. Hover reason = latest change touching a path. AI never writes the UI directly; it proposes ops. Snapshots every N versions keep reads cheap.
