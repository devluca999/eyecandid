# 0017 · Free edits without WebGPU or a worker, and how we compete on cost

**Status:** proposed · 2026-11-18 · needs Luca's decision on part 2 (a new service)

**Context.** Free edits run on the visitor's device (ADR 0012), but only where WebGPU works. Everywhere else (Firefox, older Safari, many phones) they fall back to a server worker that isn't running (the Modal workspace is at its cap). Those visitors see "no engine is running right now" and wait indefinitely. Two more problems were measured on 18 Nov 2026:
- A first-time visitor downloads the 206 MB `base.en` model before anything happens: 21 s on fast Mac wifi, minutes on a phone on 4G. That costs the first minute.
- `base.en` mishears ordinary speech. On a real take, "gym bro" came out as "Jimbo" and "smart watch" as "smart witch". Captions that print words nobody said break the rule "polish how they said it, never what they said".

Owner's brief (18 Nov): make it work well **without WebGPU and without raising the Modal cap**, at the free tier's cost bar (under $50 a month), and compete with generation-heavy tools like Higgsfield for far less money.

**The observation that makes it cheap.** In the core loop, only **transcription** is heavy ML. Everything else already runs on any current browser for free:

| Step | Where it runs | Needs |
|---|---|---|
| Decode, resample to 16 kHz | browser | Web Audio |
| **Transcribe (word timings)** | browser, WebGPU only | **the one blocker** |
| Autocut, beads, captions, versions | Convex (TS, `packages/core`) | nothing |
| Reframe (face track) | browser, MediaPipe (WASM/WebGL) | nothing special |
| Sound mix, loudness | browser (`packages/core` loudness) | nothing |
| Render, QC | browser, WebCodecs | Chrome/Edge, Safari 16.4+, Firefox 130+ |

So the free tier needs **no server compute at all, except possibly transcription**. Transcription takes audio only: 60 s of 16 kHz mono is about 1.9 MB raw, or about 0.25 MB as Opus. That is roughly 1/100th of the video.

## Decision (proposed): three transcribers behind one function, best first

`transcribeOnDevice` already returns one `Transcript` shape that the rest of the pipeline consumes. Make the transcriber a choice:

1. **WASM Whisper in the browser** (no new service, $0; ADR 0016, PR #65). Transformers.js on the CPU with a quantized `tiny.en`/`base.en`. It covers every browser with WebCodecs. It is slower than WebGPU and still a one-time model download, and on phones it may miss the 30 s bar. Its job is to make sure **nobody waits forever**.
2. **Hosted speech-to-text, audio only** (**new service; needs the owner's yes and an ADR amendment to the fixed stack**). The browser extracts the audio and uploads only that to Convex storage. A Convex action calls a hosted Whisper-class API and gets word timestamps back. It is the same `applyDeviceTranscript` path, so nothing downstream changes.
   - **Accuracy:** large-v3-turbo instead of base.en. This fixes the mishearing.
   - **Speed:** about 1–2 s for a 60 s clip, with no 206 MB download. The first minute holds on any phone.
   - **Cost:** Groq whisper-large-v3-turbo is about $0.04 per audio hour, billed at a 10 s minimum. A 60 s clip costs about $0.0007, so 10,000 free edits a month is about $7. Deepgram Nova-3 pre-recorded is about $0.0043/min, so the same 10,000 edits is about $43. Verify on each pricing page before deciding; third-party sources disagree.
   - **Privacy:** the "your clip isn't uploaded" line changes to "only the sound is sent to transcribe it, and deleted after". `/privacy` must say which provider.
   - **Abuse:** the existing per-visitor rate limits, the daily budget flag and the 60 s cap already bound it. Add a monthly spend cap at the provider.
3. **WebGPU Whisper** (today). Keep it as the offline/private path, and as the default if the owner prefers "never leaves the device" over accuracy and first-visit speed.

Recommended default order: **hosted (2) → WebGPU (3) → WASM (1)**, if the owner approves 2. Without approval: **WebGPU → WASM**.

The worker path stays for Pro and GPU features only. The free tier then needs **no Modal at all**, so the Modal cap only matters for paid work.

## How this competes with Higgsfield for far less money

Higgsfield sells **generation**: every second of output is GPU time on large video models, so their cost scales with every second they make. Eyecandid's wedge is the opposite. **Real footage, made to look great**, where the expensive part runs on the customer's own device and AI is used only where it changes the result:

- **Free and most Pro work is editing, not generating.** Cut, captions, reframe, pacing, loudness, J/L cuts, punch-ins and versions cost us about $0 (device) plus fractions of a cent (hosted transcription). The goal plan's quality work (taste heuristics, versions, QC) is where we win, and it is cheap.
- **Generation is selective and pass-through.** B-roll stills, hook cards and genre looks run only for Pro and are paid in credits (ADR 0014: credits are generated seconds). A job is refused without credits, and the GPU pool scales to zero. Each credit is priced above its GPU cost, so generation never runs at a loss. Pay-per-call GPU APIs could replace our own Modal pool for these, so there is no idle cost and no cap. That is a separate ADR when it is needed.
- **The cost line to watch** is cost per free export (`/funnel`). With this ADR it is the transcription call (≈ $0.0007) plus Convex storage for the audio until expiry.

## Consequences

- Every current browser gets a finished edit; "no engine is running" becomes a rare edge (no WebCodecs).
- Part 2 adds a vendor to a fixed stack, so it needs the owner's explicit approval and a key. Until then, part 1 alone closes the "waits forever" gap at $0.
- The free tier's compute bill no longer depends on Modal.
