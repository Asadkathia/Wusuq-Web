# Guided tours — design

**Date:** 2026-09-23 · **Status:** approved (brainstorming session) · **Phases:** 1 = consumer, 2 = staff/admin

## Goal

Teach users the application in context. A short **getting-started** tour introduces the
shell; each **module** (My Tickets, Order a service, Wallet, …) has its own tour that plays
automatically the first time the user opens that module and can be replayed at any time.
Module tours chain into **workflows** (order → pay → track → download) via a "Next: …"
final step.

Representatives are out of scope (not requested).

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Audience / order | Consumer first, then staff/admin, on one shared engine |
| Depth | Guided across real pages, highlighting real UI; never creates data or moves money |
| Trigger | Auto-play once per tour; replay from a top-bar "?" menu |
| Persistence | Server-side, per user per tour (survives device changes) |
| Structure | Getting-started + one tour per module, chained by "Next" links |
| Engine | `driver.js` (MIT, ~5 KB, zero deps, DOM-based) + a typed Wusuq registry |

Rejected: custom Radix-Popover engine (we'd own overlay/scroll/reposition/mobile edge cases);
`react-joyride` (React 19 compatibility risk, no advantage).

## Architecture

### Shared — `packages/shared`

- `TOUR_REGISTRY_META`: `Record<TourId, { version: number; audience: 'consumer' | 'staff'; permission?: Permission }>`
  — the **only** list of valid tour ids. The API validates against it; the web registry is
  typed against `TourId` so a step file cannot reference an unknown tour.
- `TOUR_AUTO_OFF_ID = 'tours.auto-off'` — a reserved id used to persist the
  "don't show tours automatically" preference in the same table (no new column).
- Pure `shouldAutoPlay(input)` — the auto-play decision (see Runtime). Lives in shared so it
  is unit-testable framework-free.

### Database — additive migration

```prisma
enum TourStatus { COMPLETED DISMISSED }

model UserTourProgress {
  id        String     @id @default(cuid())
  userId    String
  tourId    String
  version   Int
  status    TourStatus
  updatedAt DateTime   @updatedAt
  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, tourId])
  @@index([userId])
}
```

- One row per `(user, tour)`, written by **upsert** — concurrent tabs cannot lose each
  other's progress (a JSON-on-User read-modify-write would).
- `version` lets a materially changed tour replay once: bump it in the registry.
- `DISMISSED` counts as seen (skipping must not nag); replay is still available.
- Apply to Neon with `prisma db execute` + `prisma migrate resolve --applied`, **never
  `migrate dev`** (see CLAUDE.md).

### API — new `tours` module (`apps/api/src/tours/`)

| Route | Behaviour |
|---|---|
| `GET /tours/progress` | Caller's own rows: `{ tourId, version, status }[]` |
| `PUT /tours/progress/:tourId` body `{ version: int ≥ 1, status: 'COMPLETED'\|'DISMISSED' }` | Upserts the caller's own row; returns it |
| `DELETE /tours/progress/:tourId` | Removes the caller's own row (used to turn auto-play back on for `tours.auto-off`) |

- Self-scoped via `actor.sub` only; no user-id parameter exists anywhere (no IDOR surface).
  Reachable by every authenticated role (same pattern as `GET /users/me`, no
  `@RequirePermissions`).
- Unknown `tourId` → 400. `version` must equal the registry's current version → 400
  otherwise (a stale client cannot mark a newer tour seen). DTO validated by the global
  whitelist `ValidationPipe`.
- Thin controller → `ToursService` holding the logic.

### Web — `apps/web`

```
lib/tours/
  types.ts                 TourStep / TourDefinition types
  registry.ts              TourId → TourDefinition (imports the step files)
  consumer/*.ts            one data file per consumer tour (text + targets, no JSX)
  staff/*.ts               phase 2
  auto-play.ts             thin wrapper over shared shouldAutoPlay + browser-state readers
  tour-theme.css           driver.js overrides using globals.css tokens
components/tours/
  tour-provider.tsx        loads progress once; start(tourId); isSeen; queue; persistence
  tour-menu.tsx            top-bar "?" button: replay this page's tour, list others, auto-off toggle
  use-module-tour.ts       useModuleTour(tourId, { ready }) — the one line a page adds
```

- `TourProvider` is mounted in both `(consumer)` and `(portal)` layouts.
- `driver.js` is loaded with a dynamic `import()` inside the provider so it never ships on
  pages where no tour starts and never runs during SSR.

#### Step shape

```ts
interface TourStep {
  target?: string;          // data-tour id; absent = centred card
  mobileTarget?: string;    // alternative target below the lg breakpoint
  optional?: boolean;       // skip silently when the target is missing
  title: string;
  body: string;
  next?: { label: string; href: string; tourId: TourId }; // final-step workflow chain
}
```

Targets are **`data-tour="<id>"` attributes**, never CSS classes or text.

## Runtime behaviour

**Auto-play decision** — `shouldAutoPlay` returns true only when all hold:
- the tour applies to the user's audience/role (permission check against `ROLE_PERMISSIONS`);
- no progress row at the tour's current version;
- `tours.auto-off` is not set;
- not impersonating (`wusuq_impersonator_access_token` present in localStorage);
- the page reports `ready` (its data has loaded — never tour a loading skeleton);
- no other tour is running and no dialog/drawer is open (`[role="dialog"][data-state="open"]`).

**Ordering** — getting-started targets only shell elements (sidebar, top bar, wallet chip,
notification bell, "?" menu), so it plays on **whichever page the user lands on first**,
including a deep link; the page's module tour is queued and plays after it ends.

**Missing targets** — optional step with missing target → skipped. Required step with missing
target → tour aborts, **not** marked seen, `console.warn` in development.

**Mobile** — below `lg`, a step uses `mobileTarget` if declared, otherwise renders centred.

**Impersonation** — no auto-play and no persistence; manual replay still works. (A JWT
`impersonatedBy` claim enforcing this server-side was considered and deferred: it touches
auth for a low-harm outcome.)

**Persistence failure** — the tour still closes; the result is held in a session-scoped
in-memory set so it does not loop; the write is retried on the next page load.

**Completion semantics** — reaching the last step and clicking Done / a "Next" chain link →
`COMPLETED`. Close / Esc / "Skip tour" → `DISMISSED`.

## Tour catalogue

### Phase 1 — consumer

| Tour id | Page | Covers | Chains to |
|---|---|---|---|
| `consumer.getting-started` | any | sidebar, top bar, wallet chip, bell, "?" menu | `consumer.services` |
| `consumer.dashboard` | `/consumer/dashboard` | ticket counts, next hearing, activity, volume graph | `consumer.my-tickets` |
| `consumer.services` | paralegal-services | judicial vs non-judicial, choosing a service | `consumer.intake` |
| `consumer.intake` | intake wizard | step rail, required fields, city/court picker, autosave & drafts, checkout panel, promo, wallet opt-in | `consumer.my-tickets` |
| `consumer.my-tickets` | `/consumer/my-tickets` | status tabs, card, Pay / Pay later, Invoice/Doc/TCS, Regenerate, Order Future Tickets, detail drawer | `consumer.pay` |
| `consumer.pay` | pay page | payment method details, mandatory receipt | `consumer.wallet` |
| `consumer.wallet` | `/consumer/my-wallet` | net = credit − commitments, top-up, history, pay a ticket from wallet | — |
| `consumer.drafts` | drafts | resume / delete drafts | — |
| `consumer.case-files` | case-files + my-cases | uploading & viewing case files, cases | — |
| `consumer.documents` | documents + files | deliverables from Wusuq, personal storage | — |
| `consumer.invoices` | invoices | viewing & downloading invoices | — |
| `consumer.profile` | profile | address, phone, user type | — |

The intake tour targets only the chrome **shared by every flow** (step rail, checkout panel,
navigation) — one tour, not eight flow-specific ones that would drift.

### Phase 2 — staff/admin

Getting started, Dashboard (KPIs and drill-downs), Ticket queues (status lanes, assign,
bulk actions, archive/restore), Ticket detail (Edit, Regenerate, Review & Complete),
Finance, Wallet, Invoices (multi-ticket issue), Reports, Documents, Promo codes, Pricing,
Users & Representatives, Settings (tax, exchange rates, geo). Each carries a `permission` so
tours are filtered exactly like the sidebar.

### Copy

Plain English, drafted by the implementer, living in the per-tour data files so the owner can
edit wording without touching components.

## Styling & accessibility

- `tour-theme.css` overrides driver.js with `globals.css` tokens (brand-500 buttons, card
  radius/shadow); dark mode follows the tokens.
- Popover shows "Step n of m", Back / Next / Skip tour.
- Keyboard: ←/→/Esc; focus moves into the popover and is **restored** to the previously
  focused element on close.
- `prefers-reduced-motion: reduce` disables driver.js animation.

## Testing

- **API unit:** unknown id → 400; stale version → 400; upsert idempotent; caller A cannot
  read or write caller B's rows (IDOR); delete only removes the caller's own row.
- **Shared unit:** `shouldAutoPlay` truth table (version bump, auto-off, impersonation,
  ready, dialog open, permission).
- **Web unit (node Jest):** role filter; queue ordering (getting-started before module);
  **registry integrity guard** — every step `target`/`mobileTarget` appears in source as a
  JSX attribute `data-tour="<id>"` (not a bare string match). Mutation-test it.
- **Playwright E2E:** fresh consumer sees getting-started then My Tickets tour; skip persists
  across reload; replay from "?" menu; impersonation does not persist.
- **Browser QA** of every consumer tour at desktop and phone width before phase 1 ships.

## Out of scope

Representative tours; interactive "do the action" tours; analytics on tour completion;
translations.
