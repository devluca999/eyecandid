"use client";
import { useState, type FormEvent } from "react";
import { ConvexProvider, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@convex/_generated/api";
import { Icon, PillButton, StatusDot } from "@eyelore/ui";
import { getAnonId } from "@/lib/anon";
import { getConvexClient } from "@/lib/convex-client";

function Form() {
  const request = useMutation(api.access.request);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState("sending");
    setError(null);
    try {
      await request({ anonId: getAnonId(), email: String(f.get("email") ?? ""), note: String(f.get("note") ?? ""), link: String(f.get("link") ?? "") });
      setState("sent");
    } catch (err) {
      setState("idle");
      setError(err instanceof ConvexError && typeof err.data === "string" ? err.data : "that didn't go through · try again in a moment");
    }
  };
  if (state === "sent") {
    return (
      <p className="ec-form__done" role="status" data-testid="access-sent">
        <Icon name="check" size={18} /> got it · we’ll email you when there’s a seat
      </p>
    );
  }
  return (
    <form className="ec-form" onSubmit={submit} data-testid="access-form" noValidate={false}>
      <label>
        <span>email</span>
        <input name="email" type="email" required autoComplete="email" maxLength={254} autoFocus />
      </label>
      <label>
        <span>what you make</span>
        <input name="note" type="text" maxLength={500} placeholder="ugc ads, a cooking channel…" />
      </label>
      <label>
        <span>a link to your work <em>optional</em></span>
        <input name="link" type="text" inputMode="url" maxLength={300} placeholder="your site or a profile link" />
      </label>
      <PillButton type="submit" disabled={state === "sending"} testId="access-submit">
        {state === "sending" ? "sending" : "send request"}
      </PillButton>
      {error && <StatusDot status="attention" label={error} />}
    </form>
  );
}

/** The Pro request form, on its own Convex provider (same shared client) so the landing loads Convex only when it is needed. */
export default function RequestForm() {
  const client = getConvexClient();
  if (!client) return null;
  return (
    <ConvexProvider client={client}>
      <Form />
    </ConvexProvider>
  );
}
