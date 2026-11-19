"use client";
import type { ConvexReactClient } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { session } from "./session";
import { faceTrackOnDevice, transcribeOnDevice } from "./device-engine";
import { failureLine } from "./resilient-fetch";

/** Edits being worked on in this tab: one run per edit, whoever starts it (the drop, "try again", "choose it again"). */
const running = new Set<string>();

export const deviceRunning = (projectId: string) => running.has(projectId);

/**
 * The on-device edit for one project (ADR 0012): listen on this device (downloading the model once), hand the
 * transcript to the server's autocut, then the face pass in the background. Used for the first run after a drop and
 * for "try again" / "choose it again" on the SAME edit, so a failed first visit never needs a new project.
 * A failure ends in one plain line on the project (failureLine); the browser's own error goes to the console only.
 */
export async function runDeviceEdit(convex: ConvexReactClient, a: { anonId: string; projectId: Id<"projects">; clipId: string; file: File; durationMs: number; restart?: boolean }) {
  const { anonId, projectId, clipId, file, durationMs } = a;
  if (running.has(projectId)) return;
  running.add(projectId);
  let lastSent = 0;
  const onStage = (detail: string) => {
    session.update(projectId, { deviceStage: detail });
    // progress is throttled; anything else (a retry, a new step) goes up at once so another tab sees it too
    const progress = detail.startsWith("getting the editor ready");
    if (!progress || Date.now() - lastSent > 2000) {
      lastSent = Date.now();
      void convex.mutation(api.projects.deviceProgress, { anonId, projectId, detail }).catch(() => {});
    }
  };
  try {
    if (a.restart) {
      const r = await convex.mutation(api.projects.deviceRestart, { anonId, projectId });
      if (r.ready) return;
    }
    const transcript = await transcribeOnDevice(file, durationMs, onStage);
    if (transcript.words.length === 0) {
      await convex.mutation(api.projects.deviceFailed, { anonId, projectId, reason: "no speech found · try a clip where someone talks" });
      return;
    }
    session.update(projectId, { deviceStage: "trimming the ums" });
    await convex.mutation(api.projects.applyDeviceTranscript, { anonId, projectId, clipId, transcript });
    // the edit is ready; the face pass runs behind it (like the server's background reframe). Non-fatal:
    // on any failure the doc keeps its centred crop, and an export before it lands uses whatever the doc has.
    void faceTrackOnDevice(file, durationMs)
      .then((r) => {
        console.info(`[reframe] ${r.faces}/${r.frames} frames with a face · ${r.keyframes.length} keyframes · ${r.ms} ms`);
        return convex.mutation(api.projects.applyDeviceReframe, { anonId, projectId, clipId, keyframes: r.keyframes, faces: r.faces });
      })
      .catch((e) => console.warn("[reframe] skipped, keeping the clip centred", e));
  } catch (e) {
    console.warn("[device] the edit couldn't finish on this device", e);
    await convex.mutation(api.projects.deviceFailed, { anonId, projectId, reason: failureLine(e) }).catch(() => {});
  } finally {
    session.update(projectId, { deviceStage: undefined });
    running.delete(projectId);
  }
}
