import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { caller } from "./lib/owner";
import { sha256Hex } from "./lib/workerAuth";

const DAY_MS = 24 * 60 * 60 * 1000;
/** at most this many requests per email and per anonymous session in any 24 hours */
export const ACCESS_REQUESTS_PER_DAY = 3;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validates and normalises a request; returns a user-facing message on the first problem. */
export function cleanAccessRequest(input: { email: string; note: string; link: string }) {
  const email = input.email.trim().toLowerCase();
  const note = input.note.trim();
  const link = input.link.trim();
  if (!email || email.length > 254 || !EMAIL.test(email)) return { error: "that email doesn't look right" } as const;
  if (note.length > 500) return { error: "keep what you make under 500 characters" } as const;
  if (link) {
    if (link.length > 300) return { error: "that link is too long" } as const;
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`);
    } catch {
      return { error: "that link doesn't look right" } as const;
    }
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".")) return { error: "that link doesn't look right" } as const;
    return { value: { email, note, link: url.toString() } } as const;
  }
  return { value: { email, note, link: "" } } as const;
}

/** Pro is by request (docs: mvp-spec "Access model"). Anyone may ask; nothing is granted here. */
export const request = mutation({
  args: { anonId: v.string(), email: v.string(), note: v.string(), link: v.string() },
  handler: async (ctx, { anonId, ...input }) => {
    await caller(ctx, anonId); // validates the anon id's shape
    const r = cleanAccessRequest(input);
    if ("error" in r) throw new ConvexError(r.error!);
    const { email, note, link } = r.value;
    const since = Date.now() - DAY_MS;
    const byEmail = await ctx.db
      .query("accessRequests")
      .withIndex("by_email_created", (q) => q.eq("email", email).gt("createdAt", since))
      .take(ACCESS_REQUESTS_PER_DAY);
    const anonHash = (await sha256Hex(anonId)).slice(0, 32);
    const byAnon = await ctx.db
      .query("accessRequests")
      .withIndex("by_anon_created", (q) => q.eq("anonHash", anonHash).gt("createdAt", since))
      .take(ACCESS_REQUESTS_PER_DAY);
    if (byEmail.length >= ACCESS_REQUESTS_PER_DAY || byAnon.length >= ACCESS_REQUESTS_PER_DAY) {
      throw new ConvexError("you've already asked today · we'll be in touch");
    }
    await ctx.db.insert("accessRequests", { email, note, link, anonHash, createdAt: Date.now(), status: "new" });
    return { ok: true as const };
  },
});
