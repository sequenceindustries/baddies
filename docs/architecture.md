# Architecture Notes

## Provider abstractions — how to add a real vendor

Each provider (`verification`, `payment`, `storage`) follows the same pattern:

```
src/lib/providers/<kind>/
  types.ts     # the interface + shared types — do not change without updating all implementations
  stub.ts      # local dev / CI implementation, no external calls
  <vendor>.ts  # add this when a real vendor is approved, e.g. persona.ts, stripe.ts, s3.ts
  index.ts     # factory — reads env var, returns the active implementation
```

To onboard a real vendor:

1. Implement the interface in a new file (e.g. `src/lib/providers/payment/stripe.ts`).
2. Add a `case` to the factory in `index.ts`.
3. Add the vendor's env vars to `.env.example` (names only, never real secrets).
4. Update the CI production-readiness check (`.github/workflows/ci.yml`) once payments go
   live, so `PAYMENT_PROVIDER=stub` can no longer reach a production deploy target.
5. Do **not** touch call sites — `getPaymentProvider()` / `getVerificationProvider()` /
   `getMediaStorageProvider()` are the only places that should know which vendor is active.

Per the build brief, do not begin wiring a real payment or verification vendor until it has
been approved (payment: pending underwriting; verification: pending vendor selection).

## Financial ledger model

- `LedgerEntry` is **append-only**. Corrections are new entries (`REFUND`, `CHARGEBACK`,
  `PAYOUT_REVERSAL`, `ADJUSTMENT`), never edits to existing rows.
- `Wallet.cached*Balance` fields exist purely for read performance. They are a materialized
  view of `LedgerEntry` history, written only by `recomputeWalletBalances()`. If you find
  yourself writing to these fields anywhere else, that's a bug.
- Revenue split (`creatorShareAmount` / `platformShareAmount`) is computed and frozen on the
  entry **at write time**, using whatever `platform_settings.revenue.creator_share` is at that
  moment. Changing the split later does not rewrite history — this is intentional and matches
  build brief §3 ("Do NOT simply subtract costs from the creator's displayed percentage
  without an explicit business rule").
- Settlement timing (`pending` vs. `available`) is a simplified fixed-delay placeholder in
  Sprint 0 (`recomputeWalletBalances`, default 3 days). This needs to be replaced with the
  real processor's settlement schedule once a vendor is selected (Sprint 7).

## Unlimited allocation engine

`computeUnlimitedAllocations()` in `src/lib/entitlements/unlimited.ts` dispatches to a model
selected by `platform_settings.unlimited.allocation_model`. Only `consumption` is implemented
in Sprint 0; `engagement`, `hybrid`, and `minimum_guarantee` are stubbed with a clear error so
the interface shape is proven before Sprint 5 without prematurely guessing at formulas that
need real usage data to design well.

Consumption qualification (`src/lib/entitlements/consumption-events.ts`) deliberately excludes
bare page impressions — see build brief §14. Thresholds (10s video/audio, 3s image) are a
Sprint 0 starting point and should be revisited with real engagement data before Sprint 5.

## Entitlements

`canAccessContent()` in `src/lib/entitlements/content.ts` is the single source of truth for
"can this user see this content." It covers, in order: public preview + published, admin
override, content owner, active Entry/VIP subscription, Unlimited (Entry-level only, creator
must have opted in), and PPV purchase. Every new access path (download, comment, share) should
call through this function rather than re-implementing a subset of this logic.

## Security posture carried into Sprint 0

- Passwords hashed with bcrypt (cost 12); session tokens are opaque, hashed before storage,
  and independently revocable server-side (`Session.revokedAt`) — a stolen JWT alone doesn't
  survive a revoke.
- `AUTH_SECRET` is validated at startup to reject missing/short values rather than failing
  silently into a weak signing key.
- RBAC (`src/lib/rbac/permissions.ts`) is enforced in route handlers, never assumed from
  client state.
- Media is never referenced by a public URL in the data model — `MediaAsset.storageKey` is a
  private key; a signed URL is minted per-request only after `canAccessContent()` passes.

## Open decisions carried forward (not blocking Sprint 0)

- Payment processor selection (pending underwriting).
- Identity/age/liveness verification vendor selection.
- Object storage + CDN vendor selection.
- Real settlement-delay schedule (currently a 3-day placeholder).
- Engagement/hybrid/minimum-guarantee Unlimited allocation formulas.
- Paid messaging monetisation rules (architecture exists — `Message.priceUsd` — but is
  intentionally unused in V1 per build brief §18).
