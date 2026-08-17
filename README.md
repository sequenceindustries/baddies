# Baddies — Sprint 0 Foundation

South African-born, global, verified adult creator marketplace. **18+ only.**

This repository contains the **Sprint 0 (Foundation)** deliverables from the build brief:
repo structure, application architecture, database schema, authentication, RBAC, financial
ledger, provider abstraction interfaces, environment configuration, testing framework, CI/CD,
and basic app shells for fan/creator/admin.

Real payment processing, identity verification, and payouts are **not wired to a live vendor
yet** — every external dependency is behind a provider interface with a local `stub`
implementation, pending underwriting/vendor selection (see `docs/architecture.md`).

## Stack

- **Next.js 14** (App Router) + TypeScript, `strict` mode
- **PostgreSQL** via Prisma
- Provider-agnostic **VerificationProvider**, **PaymentProvider**, **MediaStorageProvider**
- Webhook-driven payment state (the client never marks a payment "succeeded")
- Immutable, append-only financial ledger; wallet balances are always derived, never mutated
- Server-side RBAC (never trust the frontend for authorization)

## Getting started

```bash
cp .env.example .env      # fill in AUTH_SECRET at minimum for local dev
npm install
npm run db:migrate        # creates local schema
npm run db:seed           # seeds default platform_settings (pricing, revenue share)
npm run dev
```

Run tests:

```bash
npm test
npm run typecheck
npm run lint
```

## Directory structure

```
src/
  app/                     # Next.js routes
    (fan)/                 # fan-facing route group
    (creator)/              # creator dashboard route group
    (admin)/                 # admin route group
    api/
      auth/                  # register/login
      admin/                  # RBAC-protected admin actions (example: creator approval)
      webhooks/payment/        # authoritative payment state transitions
  lib/
    auth/                    # session issuance/verification, current-user resolution
    rbac/                    # permission model — server-side only
    config/                  # business config (pricing, revenue share) — DB-backed, not hard-coded
    entitlements/             # canAccessContent(), Unlimited allocation + consumption rules
    ledger/                   # append-only financial ledger service
    providers/
      verification/            # VerificationProvider interface + stub
      payment/                  # PaymentProvider interface + stub
      storage/                  # MediaStorageProvider interface + stub
    db/                       # Prisma client singleton
prisma/
  schema.prisma              # full Sprint 0 data model
  seed.ts                     # seeds platform_settings from config defaults
tests/
  unit/                       # financial calc, RBAC, entitlement rule tests
docs/
  architecture.md             # design rationale, provider-swap instructions, open decisions
```

## Design principles enforced in this codebase

1. **No hard-coded business rules.** Pricing and revenue share live in `platform_settings`
   (DB), seeded from `src/lib/config/business.ts` but always read at runtime via
   `getBusinessConfig()`. Changing a price or the creator/platform split does not require a
   deploy.
2. **Provider-agnostic external dependencies.** `VerificationProvider`, `PaymentProvider`, and
   `MediaStorageProvider` are interfaces; only a `stub` implementation ships until a vendor is
   selected. Swapping vendors means adding one file and one `case` in a factory — not hunting
   through the app.
3. **Webhook-authoritative payments.** The browser is never trusted to declare a payment
   successful. All entitlement/subscription/payout state transitions happen from
   `src/app/api/webhooks/payment/route.ts` after signature verification.
4. **Immutable ledger.** `LedgerEntry` rows are append-only. Wallet balances are a derived read
   model recomputed by `recomputeWalletBalances()` — nothing else writes to those fields.
5. **Central entitlement engine.** `canAccessContent()` is the only sanctioned way to decide if
   a user can see a piece of content. No page should re-derive access logic.
6. **RBAC is server-side only.** `requirePermission()` is called at the top of every protected
   route handler; UI-level hiding is a nicety, not a security boundary.
7. **Legal identity vs. public identity are separate.** `Profile` (public) and
   `CreatorProfile.legalNameEncrypted` / `VerificationSession` (private, provider-referenced)
   are distinct models. Raw identity documents are never stored as DB blobs — only provider
   references.
8. **Consent and verification are explicit, not assumed.** A creator uploading content with a
   third party creates a `ContentParticipant` → `VerificationParticipant` → `ConsentRecord`
   chain; consent is never inferred from the mere act of uploading.
9. **Unlimited's payout formula is pluggable.** `computeUnlimitedAllocations()` dispatches to a
   named allocation model (`consumption` implemented; `engagement`/`hybrid`/
   `minimum_guarantee` stubbed for later experimentation) rather than hard-coding one formula.

## Sprint 1 — Verification (added on top of Sprint 0)

- `POST /api/creator/apply` — fan → creator application intake; creates `CreatorProfile` in
  `VERIFICATION_REQUIRED`.
- `POST /api/creator/verification/start` — opens an IDENTITY / AGE / LIVENESS session via the
  active `VerificationProvider`.
- `POST /api/webhooks/verification` — the **only** place a session's PASSED/FAILED outcome is
  applied (same webhook-authoritative pattern as payments). Once all three checks pass, the
  creator auto-advances to `UNDER_REVIEW`.
- `GET /api/admin/creators` — compliance review queue.
- `POST /api/admin/creators/:id/approve` / `.../reject` — final human decision; always audit-
  logged. Automated checks alone never grant `VERIFIED` (build brief §10: "Do not attempt to
  make automated moderation the sole decision-maker for serious cases" — the same principle
  applies to creator verification).
- `src/lib/creator/status.ts` — the full state machine from build brief §6 as code, so every
  route enforces the same legal transitions instead of re-deriving them.

## Sprint 2 — Content (added on top of Sprint 0 + 1)

- `POST /api/creator/content` — upload + classify content (`PUBLIC_PREVIEW`/`ENTRY`/`VIP`/`PPV`);
  monetised levels require a `VERIFIED` creator. Advances synchronously to `PENDING_REVIEW` —
  see the note in the route about swapping in a real async transcoding/scanning pipeline later.
- `POST /api/admin/content/:id/approve` — **hard-gated** on participant verification + consent
  (§7): if the content has any `ContentParticipant`, every one needs a `PASSED` verification
  *and* a `CONFIRMED` consent record, or approval is refused outright.
- `POST /api/admin/content/:id/reject`, `GET /api/admin/content` — moderation queue + rejection.
- `POST /api/creator/content/:id/publish` — creator's own action to go live; deliberately
  separate from moderation approval (§10). `canAccessContent()` now requires **both**
  `status === APPROVED` and `publishedAt` set before content counts as live.
- `GET /api/content/:id/media` — the only route that returns a usable media URL. Always calls
  `canAccessContent()` first; never returns `storageKey` directly (§9).
- `GET /api/creators/:id`, `GET /api/creators/:id/content` — public profile (verified creators
  only, respects `subscriberCountVisible`/`locationVisible`) and their published feed.
- `GET /api/feed` — simple reverse-chronological cross-creator feed of `PUBLIC_PREVIEW`/`ENTRY`
  content. Personalized sections (Following/Recommended/Trending) are Sprint 3 (Discovery) —
  they need a `Follow` model this schema doesn't have yet, so this is deliberately just the
  foundation feed, not the full experience from §11/§13.
- `src/lib/content/status.ts` — content lifecycle state machine (§10), same pattern as
  `src/lib/creator/status.ts`.
- `src/lib/creator/pricing.ts` — resolves effective Entry/VIP price (creator override →
  platform default), so pricing logic has one home instead of being re-derived per route.

## Sprint 3 — Discovery (added on top of Sprint 0 + 1 + 2)

- Schema: added `Follow` and `Category`/`CreatorCategory` — the two models Discovery needs that
  Sprint 2 didn't require. **Needs a migration** (`npm run db:migrate`) before these routes work.
- `POST` / `DELETE /api/creators/:id/follow` — follow/unfollow.
- `GET /api/search?q=` — Postgres `ILIKE` search over creator display name/bio. No dedicated
  search infra for MVP (§31/§35 favor the simplest thing that works).
- `GET /api/discovery/categories`, `GET /api/discovery/categories/:slug` — flat category listing,
  deliberately not a taxonomy/hierarchy (§31 excludes "general creator categories" complexity).
- `GET /api/discovery/trending` — recency-weighted engagement score (qualified consumption +
  purchases, purchases weighted 3x). Scoring math lives in
  `src/lib/discovery/trending-score.ts`, split from the DB queries in `trending.ts` specifically
  so it's unit-testable without Postgres — worth copying this pattern for the Unlimited
  allocation models in Sprint 5.
- `GET /api/discovery/new-creators` — "New Baddies" section.
- `GET /api/home` — composes everything into the priority order from §13: following →
  subscribed → Unlimited → recommended → trending → new creators. "Recommended" is an honest
  fallback (verified creators not already followed), not a recommendation model — §31 excludes
  "Complex recommendation AI" from MVP.
- `src/lib/discovery/creator-card.ts` — shared card projection (§11's spec: name, verified
  badge, optional location, Entry/VIP price) so every discovery endpoint shapes results the
  same way instead of drifting.

## What's intentionally NOT in Sprint 0

Per the build brief (§31, §36): no live payment processor, no live verification vendor, no
payout execution, no native apps, no livestreaming. Those land in later sprints once vendors
are approved. See `docs/architecture.md` for the sprint-by-sprint gating.
