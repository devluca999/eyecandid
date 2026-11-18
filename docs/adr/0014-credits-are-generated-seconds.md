# 0014 · Credits are generated seconds: reserve, settle, refund

**Status.** Accepted as the contract, 2026-11-17. The pure model is built and tested (`packages/core/src/credits.ts`). The server still charges the Phase 4 placeholders (ADR 0009 addendum) until "Rollout" below is done. Two parts wait for the owner: the free tier's shape and the Stripe prices.

**Context.** `docs/pricing-and-quality-plan.md` sets the pricing rule: editing costs cents, so it is not metered; generation costs about $0.02–0.03 a second, so it is. Today a GPU job costs a fixed number of placeholder credits by type (`GPU_CREDIT_COST`), taken at enqueue from one number (`entitlements.credits`) and returned if the job fails for good. That cannot express a 4 s clip costing less than a 10 s one, top-ups that last 12 months next to a monthly allowance that doesn't roll over, or a refund when the result is bad rather than missing.

## Decision

1. **One credit is one generated second at 720p.** Image to video, text to video, background replace (Sets), inpainting and generated voice cost 1 credit a second, rounded up. A lip-synced talking head costs 2 a second. A still costs 1. A look (`grade`) is editing and costs 0; it stays Pro-only through the GPU gate. A per-second job with no length is refused, never guessed. Unknown GPU work is charged like plain generation. (`creditCost`.)
2. **Reserve, settle, refund.**
   - *Reserve* when the job is enqueued, in the same mutation as the Pro gate, before a worker wakes. All or nothing.
   - *Settle* when the job succeeds and passes the quality check: charge what it actually made, never more than was reserved, and return the rest. This matters for voice, whose length is only an estimate at reserve time.
   - *Refund* everything when the job fails for good, is cancelled, or the quality check rejects the result. A rejected result is never shown as a success.
3. **The balance is a list of lots, each with an expiry.** The monthly allowance is one lot per UTC month, gone at month end with no rollover. A top-up is a lot that lasts 12 months. A one-time gift (the free plan's 10) has no expiry. A reservation spends what expires soonest first and remembers which lots it took from, so a refund puts each credit back in its own lot. If that lot has expired in the meantime, the credits come back good for 30 days: our failure never costs the person credits. (`reserve`, `release`, `settle`, `balance`.)
4. **The plans in the goal plan are data, marked proposed** (`PLAN_CATALOG`): Free (3 exports a month, 720p, watermark, 10 one-time credits), Creator (100 credits), Pro (500, 4K), Studio (2,500, 3 seats), Founding (Creator's price with Pro's credits, for the first 100 approved people), top-up 120. No prices in code: Stripe stays the source of truth for money (ADR 0009). A test holds each plan's monthly credits × $0.03 under the plan's stated worst case.
5. **Generation is labelled experimental** in the product until the identity lock and the quality check from `docs/engine-assessment.md` exist. The label is copy on every generation action, not a flag that hides the cost.

## Rollout (not done here; one PR each, after #37 lands)

1. *Schema.* `creditLots` (`userId`, `lotId`, `kind`, `remaining`, `expiresAt`) replaces `entitlements.credits`; migrate each existing balance into one `grant` lot. `creditCharges` gains `taken` (lot by lot), `settledAt`, `actual`, and `refundReason` (`failed`, `qc_failed`, `cancelled`).
2. *Server.* `chargeGpuJob` calls `creditCost(type, { seconds })` with the length from the job input and `reserve`; the job-complete path calls `settle`; the final-failure path and a new `qc_failed` worker result call `release`. The webhook writes a `monthlyLot` on checkout and renewal (once a month, as now) and a `topupLot` for a pack.
3. *Plans.* Swap `PLANS` for the catalog once the owner confirms it: `PlanId` gains `pro` and `founding`; exports are counted (1 per anonymous session, 3 a month on Free) instead of minutes; paid plans get fair use (10 h of raw footage a month).
4. *Product.* The editor shows the cost before a generation starts ("5 s · 5 credits") and the balance after.

## Consequences

- The cost of a generation is known before it runs and can only go down afterwards.
- Refunds are exact and idempotent per charge (the charge row holds what was taken).
- Until step 2, `still` costs 1 credit under both the old table and this one, so #37 behaves the same either way.

## Runner-ups

- *Fixed price per job type* (what exists): simple, but a 10 s clip and a 3 s clip cost the same, and it invites the longest request every time.
- *One number with a "top-up never expires" rule*: no lots, but then the monthly allowance either rolls over (costly) or expiry eats bought credits first (unfair).
- *Charge on success only, no reservation*: a burst of queued jobs can overspend the balance; the GPU has already run.

## Needs the owner

- Confirm the free tier: 3 exports a month at 720p with 10 one-time credits (this plan) against 1 watermarked export per anonymous session, 3 a month with an account (MVP spec). The two fit together; the open point is whether a signed-out visitor gets generation credits at all (this ADR says no: credits need an account).
- Create the Stripe prices: Creator $19/mo and $180/yr, Pro $49/mo and $468/yr, Studio $149/mo, Founding $19/mo and $149/yr, top-up $10. Then set their ids in the Convex env.
- Decide whether request-access "Pro" is the Founding plan (recommended: yes, it is the same 100 seats).
