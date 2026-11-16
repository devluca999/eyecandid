# 0005 · Media behind a MediaStore interface

**Status:** accepted · 2026-11-15

**Decision.** All media is addressed by `mediaId`. The `media` row holds `storage: { provider: "convex" | "s3", key }`. Server code reaches bytes only through `convex/lib/mediaStore.ts` (`uploadUrl`, `downloadUrl`, `delete`). Convex file storage is the only provider now; an S3-compatible provider can be added without touching apps or the worker.

**Consequences.** Large-file limits are a provider concern, not an app concern. Workers never see paths, only signed URLs.
