import { v } from "convex/values";
import { query } from "./_generated/server";
import { caller } from "./lib/owner";
import { usageFor } from "./lib/entitle";
import { FREE_CLIP_MS, FREE_MAX_BYTES, freeState, MSG, PRO_CLIP_MS, PRO_MAX_BYTES } from "./lib/limits";

/**
 * What the web shows before upload: is free open today, and which caps apply to this caller.
 * Reactive, so a paused day shows (and clears) live. No counts of other people's usage leave the server.
 */
export const status = query({
  args: { anonId: v.optional(v.string()) },
  handler: async (ctx, { anonId }) => {
    const who = await caller(ctx, anonId);
    const pro = (await usageFor(ctx, who)).plan !== "free";
    const s = await freeState(ctx);
    return {
      pro,
      /** free work is closed for today (flag or daily cap); Pro is never paused */
      paused: !pro && s.paused,
      message: !pro && s.paused ? MSG.paused : null,
      maxClipMs: pro ? PRO_CLIP_MS : FREE_CLIP_MS,
      maxBytes: pro ? PRO_MAX_BYTES : FREE_MAX_BYTES,
    };
  },
});
