import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { flagOn } from "./lib/flags";
import { WATCHING_MS } from "./presence";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

/**
 * An export finished. Queue a "your edit is ready" email if: the flag is on, the owner is a signed-in user with an
 * email, and nobody is watching the project (no editor heartbeat in the last 45s). One notification per export job.
 */
export const onExportDone = internalMutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job?.projectId || !job.ownerUserId || job.status !== "succeeded") return;
    if (!(await ctx.db.get(job.projectId))) return; // the edit was deleted
    const user = await ctx.db.get(job.ownerUserId);
    if (!user?.email || user.deletedAt) return;
    if (!(await flagOn(ctx, "ready_email", user._id))) return;
    if (await ctx.db.query("notifications").withIndex("by_job", (q) => q.eq("jobId", jobId)).unique()) return;
    const presence = await ctx.db.query("presence").withIndex("by_project", (q) => q.eq("projectId", job.projectId!)).unique();
    if (presence && Date.now() - presence.lastSeenAt < WATCHING_MS) return;
    const id = await ctx.db.insert("notifications", { kind: "export_ready", userId: user._id, projectId: job.projectId, jobId, status: "queued", createdAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.notify.send, { notificationId: id });
  },
});

export const forSend = internalQuery({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const n = await ctx.db.get(notificationId);
    if (!n || n.status !== "queued") return null;
    const [user, project] = await Promise.all([ctx.db.get(n.userId), ctx.db.get(n.projectId)]);
    if (!user?.email || !project) return null;
    return { to: user.email, title: project.title, projectId: project._id };
  },
});

export const finish = internalMutation({
  args: { notificationId: v.id("notifications"), status: v.union(v.literal("sent"), v.literal("not_sent"), v.literal("failed")), detail: v.optional(v.string()) },
  handler: async (ctx, a) => {
    await ctx.db.patch(a.notificationId, { status: a.status, detail: a.detail, finishedAt: Date.now() });
  },
});

/**
 * Send through the SendPulse SMTP API: OAuth client-credentials token, then POST /smtp/emails (html is base64).
 * Without SENDPULSE_CLIENT_ID / SENDPULSE_CLIENT_SECRET (and SENDPULSE_FROM_EMAIL, a sender verified in SendPulse)
 * nothing is sent and the row says so: "not sent · SendPulse not configured".
 */
export const send = internalAction({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }): Promise<void> => {
    const n: { to: string; title: string; projectId: string } | null = await ctx.runQuery(internal.notify.forSend, { notificationId });
    if (!n) return;
    const base = (process.env.EYELORE_WEB_URL ?? "").replace(/\/$/, "");
    const link = base ? `${base}/edit/${n.projectId}` : "";
    const text = `"${n.title}" has finished exporting.${link ? `\nOpen it: ${link}` : ""}`;
    const html = `<p>&ldquo;${esc(n.title)}&rdquo; has finished exporting.</p>${link ? `<p><a href="${esc(link)}">Open it</a></p>` : ""}`;
    const r = await sendPulseEmail({ to: n.to, subject: "Your edit is ready", text, html });
    await ctx.runMutation(internal.notify.finish, { notificationId, status: r.status, detail: r.detail });
  },
});

export type EmailOutcome = { status: "sent" | "not_sent" | "failed"; detail?: string };

/**
 * One email through the SendPulse SMTP API (shared by "your edit is ready" and the Pro invite). Never throws; the
 * outcome is honest: "not sent · SendPulse not configured" when the keys are missing. Call from actions only.
 */
export async function sendPulseEmail(m: { to: string; subject: string; text: string; html: string }): Promise<EmailOutcome> {
  const id = process.env.SENDPULSE_CLIENT_ID;
  const secret = process.env.SENDPULSE_CLIENT_SECRET;
  if (!id || !secret) return { status: "not_sent", detail: "not sent · SendPulse not configured" };
  const from = process.env.SENDPULSE_FROM_EMAIL;
  if (!from) return { status: "not_sent", detail: "not sent · SENDPULSE_FROM_EMAIL not set" };
  try {
    const tokenRes = await fetch("https://api.sendpulse.com/oauth/access_token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
    });
    if (!tokenRes.ok) return { status: "failed", detail: `sendpulse auth ${tokenRes.status}` };
    const { access_token } = (await tokenRes.json()) as { access_token?: string };
    if (!access_token) return { status: "failed", detail: "sendpulse auth: no token" };
    const res = await fetch("https://api.sendpulse.com/smtp/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${access_token}` },
      body: JSON.stringify({ email: { subject: m.subject, from: { name: "Eyecandid", email: from }, to: [{ email: m.to }], text: m.text, html: b64(m.html) } }),
    });
    if (!res.ok) return { status: "failed", detail: `sendpulse send ${res.status}` };
    return { status: "sent" };
  } catch (e) {
    return { status: "failed", detail: `sendpulse error · ${String(e).slice(0, 120)}` };
  }
}

export { esc as escapeHtml };
