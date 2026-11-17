import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";

/**
 * MediaStore (ADR 0005). The only place that knows where bytes live.
 * Provider "convex" = Convex file storage. "s3" is reserved for an S3-compatible store later.
 */
type Ctx = ActionCtx | MutationCtx | QueryCtx;

export const mediaStore = {
  async uploadUrl(ctx: ActionCtx | MutationCtx): Promise<string> {
    return await ctx.storage.generateUploadUrl();
  },
  async downloadUrl(ctx: Ctx, media: Pick<Doc<"media">, "storage">): Promise<string | null> {
    if (media.storage.provider === "convex") return await ctx.storage.getUrl(media.storage.key as Id<"_storage">);
    if (media.storage.provider === "device") return null; // only on the visitor's device
    throw new Error("s3 provider not configured");
  },
  /** Remove the stored bytes for good. A file that is already gone is not an error. */
  async delete(ctx: ActionCtx | MutationCtx, media: Pick<Doc<"media">, "storage">): Promise<void> {
    if (media.storage.provider === "device") return; // nothing stored server-side
    if (media.storage.provider !== "convex") throw new Error("s3 provider not configured");
    const key = media.storage.key as Id<"_storage">;
    if ((await ctx.storage.getUrl(key)) !== null) await ctx.storage.delete(key);
  },
};

/**
 * Media a job's output names (`mediaId`, `maskMediaId`, `mediaIds`…). Worker-registered media carries no projectId,
 * so this is the only link from a project to its renders and generated assets.
 */
export function mediaIdsIn(value: unknown, depth = 0): string[] {
  if (!value || typeof value !== "object" || depth > 4) return [];
  if (Array.isArray(value)) return value.flatMap((x) => mediaIdsIn(x, depth + 1));
  const out: string[] = [];
  for (const [k, x] of Object.entries(value)) {
    if (/mediaids?$/i.test(k)) out.push(...(Array.isArray(x) ? x : [x]).filter((y): y is string => typeof y === "string"));
    else out.push(...mediaIdsIn(x, depth + 1));
  }
  return out;
}
