import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { randomToken, sha256Hex } from "./lib/workerAuth";

/**
 * Register a worker and print its token ONCE. Run:
 *   npx convex run workers:register '{"name":"colab-1","provider":"colab"}'
 * Store the token as EYELORE_WORKER_TOKEN in the worker's secret store. Only the hash is kept.
 */
export const register = internalMutation({
  args: { name: v.string(), provider: v.string() },
  handler: async (ctx, { name, provider }) => {
    const token = randomToken();
    await ctx.db.insert("workers", { name, provider, tokenHash: await sha256Hex(token), disabled: false, createdAt: Date.now() });
    return { token, note: "shown once — store it as EYELORE_WORKER_TOKEN" };
  },
});

export const disable = internalMutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const all = await ctx.db.query("workers").take(500);
    for (const w of all.filter((w) => w.name === name)) await ctx.db.patch(w._id, { disabled: true });
  },
});

export const touch = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const w = await ctx.db.query("workers").withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash)).unique();
    if (!w || w.disabled) return null;
    await ctx.db.patch(w._id, { lastSeenAt: Date.now() });
    return w._id;
  },
});
