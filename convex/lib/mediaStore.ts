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
    throw new Error("s3 provider not configured");
  },
};
