import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { mediaStore } from "./lib/mediaStore";

export const registerFromWorker = internalMutation({
  args: {
    storageId: v.string(),
    contentType: v.string(),
    kind: v.union(v.literal("generated"), v.literal("render"), v.literal("preview"), v.literal("proxy")),
  },
  handler: async (ctx, a) => {
    const sid = ctx.db.system.normalizeId("_storage", a.storageId);
    if (!sid) throw new Error("unknown storage id");
    const meta = await ctx.db.system.get(sid);
    return await ctx.db.insert("media", {
      kind: a.kind,
      storage: { provider: "convex", key: sid },
      contentType: a.contentType,
      bytes: meta?.size,
      createdAt: Date.now(),
    });
  },
});

export const downloadUrl = internalQuery({
  args: { mediaId: v.string() },
  handler: async (ctx, { mediaId }) => {
    const id = ctx.db.normalizeId("media", mediaId);
    if (!id) return null;
    const m = await ctx.db.get(id);
    return m ? await mediaStore.downloadUrl(ctx, m) : null;
  },
});
