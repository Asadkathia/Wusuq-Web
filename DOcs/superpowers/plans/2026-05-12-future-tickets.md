# Future tickets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a consumer's pending-case ticket completes, surface an "Order Future Tickets" CTA that opens a new wizard pre-filled from the source ticket with hearing dates rolled forward, jumping to the final step for minimum-friction reorder at the next hearing date.

**Architecture:** Add a thin CTA strip below the existing `TicketCard` on `/consumer/my-tickets`, gated on `(status=COMPLETED, case_status=Pending Case, future_date set, flow ∈ {judicial_case_files, judicial_case_information})`. The strip links to the wizard slug with `?futureFromTicketId=<id>`. A new wizard mount effect reads the param, fetches `GET /tickets/<id>`, pre-fills the in-memory draft, rolls dates forward, clears delivery preferences, jumps to the final wizard step, and skips the existing active-draft hydration. A contextual banner above the wizard explains the reorder context. No new Prisma model, no new API endpoint, no migration — reuses `GET /tickets/:id` and the existing intake-drafts upsert.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, existing wizard infra (`apps/web/components/intake-wizard.tsx`, `apps/web/components/consumer-ticket-board.tsx`), existing `apiClient` (`apps/web/lib/api-client.ts`).

---

## File structure

- Modify: `apps/web/components/consumer-ticket-board.tsx` — render the new `<FutureTicketsStrip>` below each qualifying TicketCard.
- Create: `apps/web/components/consumer-ticket-board/future-tickets-strip.tsx` — the standalone CTA strip component. Keeps the parent file focused.
- Modify: `apps/web/components/intake-wizard.tsx` — add the `futureFromTicketId` mount effect that pre-fills + jumps to final step; render the contextual banner.
- Create: `apps/web/components/intake-wizard/future-tickets-banner.tsx` — the banner.
- Create: `apps/web/lib/future-tickets.ts` — pure helper that turns a source-ticket payload into the prefilled draft payload (`buildFutureTicketsPayload`). Unit-tested in isolation.
- Test: `apps/web/lib/future-tickets.test.ts` — Jest unit tests for the payload-transform helper.

---

## Task 1: Payload-transform helper (TDD)

**Files:**
- Create: `apps/web/lib/future-tickets.ts`
- Create: `apps/web/lib/future-tickets.test.ts`

This is the pure-function core of the feature. Everything else just wires it into the UI.

- [ ] **Step 1: Write the failing test**

`apps/web/lib/future-tickets.test.ts`:

```ts
import { buildFutureTicketsPayload } from './future-tickets';

describe('buildFutureTicketsPayload', () => {
  const SOURCE_ID = 'cmp0aaa000000000000000';

  it('keeps city, court, and case identifier fields', () => {
    const out = buildFutureTicketsPayload({
      sourceTicketId: SOURCE_ID,
      sourcePayload: {
        city: 'Lahore',
        city_id: 'cmp104imq003207izpk28blll',
        select_court: 'Sessions Court',
        select_court_id: 'court-1',
        select_court_type: 'Lower Court',
        select_court_city: 'Lahore',
        case_type: 'Bail Application (S)',
        case_no: '1234',
        case_title: 'State vs Ahmed',
        case_year: '2026',
        bench: '{"benchType":"single_judge","judges":["A"]}',
        judge_name: 'J. A',
        judge_designation: 'Sessions Judge',
        case_status: 'Pending Case',
        case_date: '2026-04-10',
        future_date: '2026-05-13',
        required_documentations: 'doc_only_last_order',
        set_type: 'attested',
        attested_qty: '2',
        delivery_mode: 'TCS',
        delivery_address: '{"house":"H1"}',
        notes: 'leave at gate',
      },
    });
    expect(out.city).toBe('Lahore');
    expect(out.city_id).toBe('cmp104imq003207izpk28blll');
    expect(out.select_court).toBe('Sessions Court');
    expect(out.select_court_id).toBe('court-1');
    expect(out.select_court_type).toBe('Lower Court');
    expect(out.select_court_city).toBe('Lahore');
    expect(out.case_type).toBe('Bail Application (S)');
    expect(out.case_no).toBe('1234');
    expect(out.case_title).toBe('State vs Ahmed');
    expect(out.case_year).toBe('2026');
    expect(out.bench).toBe('{"benchType":"single_judge","judges":["A"]}');
    expect(out.judge_name).toBe('J. A');
    expect(out.judge_designation).toBe('Sessions Judge');
  });

  it('rolls the next hearing date forward into previous case date and clears the new next hearing', () => {
    const out = buildFutureTicketsPayload({
      sourceTicketId: SOURCE_ID,
      sourcePayload: {
        city: 'Lahore',
        case_date: '2026-04-10',
        future_date: '2026-05-13',
        case_status: 'Pending Case',
      },
    });
    expect(out.case_date).toBe('2026-05-13');
    expect(out.future_date).toBe('');
  });

  it('forces case_status back to Pending Case (a follow-up at next hearing is by definition still pending)', () => {
    const out = buildFutureTicketsPayload({
      sourceTicketId: SOURCE_ID,
      sourcePayload: {
        case_status: 'Pending Case',
        city: 'Lahore',
        future_date: '2026-05-13',
      },
    });
    expect(out.case_status).toBe('Pending Case');
  });

  it('clears delivery preferences and document selections', () => {
    const out = buildFutureTicketsPayload({
      sourceTicketId: SOURCE_ID,
      sourcePayload: {
        required_documentations: 'doc_only_last_order',
        set_type: 'attested',
        attested_qty: '2',
        non_attested_qty: '1',
        delivery_mode: 'TCS',
        delivery_address: '{"house":"H1","block":"B","mainArea":"M"}',
        want_pdf_before_dispatch: 'Yes',
        notes: 'leave at gate',
        case_status: 'Pending Case',
        city: 'Lahore',
        future_date: '2026-05-13',
      },
    });
    expect(out.required_documentations).toBe('');
    expect(out.set_type).toBe('');
    expect(out.attested_qty).toBe('');
    expect(out.non_attested_qty).toBe('');
    expect(out.delivery_mode).toBe('');
    expect(out.delivery_address).toBe('');
    expect(out.want_pdf_before_dispatch).toBe('');
    expect(out.notes).toBe('');
  });

  it('tags parent_ticket_id with the source id', () => {
    const out = buildFutureTicketsPayload({
      sourceTicketId: SOURCE_ID,
      sourcePayload: { case_status: 'Pending Case', city: 'Lahore', future_date: '2026-05-13' },
    });
    expect(out.parent_ticket_id).toBe(SOURCE_ID);
  });

  it('ignores unknown / extra keys from the source payload', () => {
    const out = buildFutureTicketsPayload({
      sourceTicketId: SOURCE_ID,
      sourcePayload: {
        case_status: 'Pending Case',
        city: 'Lahore',
        future_date: '2026-05-13',
        random_legacy_key: 'foo',
        clerk_secret_metadata: 'bar',
      } as Record<string, string>,
    });
    expect((out as Record<string, string | undefined>).random_legacy_key).toBeUndefined();
    expect((out as Record<string, string | undefined>).clerk_secret_metadata).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test, watch it fail**

```bash
cd apps/web && pnpm test -- --testPathPattern=future-tickets
```

Expected: FAIL with `Cannot find module './future-tickets'`.

- [ ] **Step 3: Implement the helper**

`apps/web/lib/future-tickets.ts`:

```ts
/**
 * Build the prefilled wizard payload for a "future ticket" — the
 * follow-up ticket a consumer wants at the next hearing date of a
 * pending case. The source ticket is one that has already completed.
 *
 * Rules:
 *   - Keep city, court, and case-identifier fields so the consumer
 *     doesn't re-enter known facts.
 *   - Roll dates forward: the source's `future_date` (the upcoming
 *     hearing at the time the original ticket was submitted, now in
 *     the past relative to today) becomes the new `case_date`
 *     (Previous case date). New `future_date` is empty — the consumer
 *     fills in the next-next hearing.
 *   - Reset `case_status` to "Pending Case" — a follow-up at the next
 *     hearing is by definition still pending.
 *   - Clear delivery preferences and document selections; the consumer
 *     picks them fresh for the new ticket.
 *   - Stamp `parent_ticket_id` for staff-side backlinking. Pure JSON
 *     metadata, no schema change.
 */

const COPIED_KEYS = [
  'city',
  'city_id',
  'select_court',
  'select_court_id',
  'select_court_type',
  'select_court_city',
  'case_type',
  'case_no',
  'case_title',
  'case_year',
  'bench',
  'judge_name',
  'judge_designation',
] as const;

const CLEARED_KEYS = [
  'required_documentations',
  'set_type',
  'attested_qty',
  'non_attested_qty',
  'delivery_mode',
  'delivery_address',
  'want_pdf_before_dispatch',
  'notes',
] as const;

export type FutureTicketsPrefillArgs = {
  sourceTicketId: string;
  sourcePayload: Record<string, string | undefined>;
};

export function buildFutureTicketsPayload(
  args: FutureTicketsPrefillArgs,
): Record<string, string> {
  const out: Record<string, string> = {};

  // 1. Copy whitelisted identifier fields.
  for (const key of COPIED_KEYS) {
    const v = args.sourcePayload[key];
    if (typeof v === 'string' && v.length > 0) {
      out[key] = v;
    }
  }

  // 2. Roll dates forward.
  const sourceFuture = args.sourcePayload.future_date ?? '';
  out.case_date = sourceFuture;
  out.future_date = '';

  // 3. Reset case status.
  out.case_status = 'Pending Case';

  // 4. Explicitly clear delivery preferences and document selections so
  // the wizard's "missing" state surfaces them as fresh choices rather
  // than carrying over stale values from the previous ticket.
  for (const key of CLEARED_KEYS) {
    out[key] = '';
  }

  // 5. Tag for staff-side backlinking.
  out.parent_ticket_id = args.sourceTicketId;

  return out;
}
```

- [ ] **Step 4: Re-run the test**

```bash
cd apps/web && pnpm test -- --testPathPattern=future-tickets
```

Expected: 6/6 tests pass.

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

Expected: clean across all 3 workspaces.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/future-tickets.ts apps/web/lib/future-tickets.test.ts
git commit -m "feat(future-tickets): payload-transform helper for next-hearing reorders

PDF #2. buildFutureTicketsPayload copies whitelisted identifier fields
(city, court, case identifiers, bench, judge) from a completed
pending-case ticket, rolls future_date forward into case_date, resets
case_status to Pending Case, clears delivery + document selections,
and stamps parent_ticket_id for staff-side backlinking. 6 unit tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Future-tickets CTA strip component

**Files:**
- Create: `apps/web/components/consumer-ticket-board/future-tickets-strip.tsx`
- Modify: `apps/web/components/consumer-ticket-board.tsx`

- [ ] **Step 1: Create the strip component**

`apps/web/components/consumer-ticket-board/future-tickets-strip.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { CalendarClock, ArrowUpRight } from 'lucide-react';
import { flowKeyToSlug } from '@wusuq/shared';

type Props = {
  /** Source ticket id; passed as the futureFromTicketId query param. */
  ticketId: string;
  /** Source ticket's intake flow (judicial_case_files or _case_information). */
  flow: 'judicial_case_files' | 'judicial_case_information';
  /** ISO-format next-hearing date from the source ticket's payload.future_date. */
  nextHearingDate: string;
};

function formatHearingDate(iso: string): string {
  // Locale-stable display: e.g. "13 May 2026". Falls back to the raw
  // string if parsing fails so the strip still renders something useful.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function FutureTicketsStrip({ ticketId, flow, nextHearingDate }: Props) {
  const slug = flowKeyToSlug(flow);
  const href = `/consumer/paralegal-services/judicial/${slug}?futureFromTicketId=${encodeURIComponent(ticketId)}`;
  return (
    <Link
      href={href}
      className="mt-2 flex items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50/50 px-4 py-3 text-sm text-brand-700 transition-colors hover:bg-brand-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
    >
      <div className="flex items-center gap-3">
        <CalendarClock className="h-4 w-4 shrink-0" />
        <div className="leading-tight">
          <p className="font-semibold">Next hearing {formatHearingDate(nextHearingDate)}</p>
          <p className="text-xs text-brand-700/80">Order Future Tickets</p>
        </div>
      </div>
      <ArrowUpRight className="h-4 w-4 shrink-0" />
    </Link>
  );
}
```

- [ ] **Step 2: Verify `flowKeyToSlug` export**

```bash
grep -n "flowKeyToSlug" packages/shared/src/index.ts
```

Expected: exported from `packages/shared/src/index.ts`. If it isn't exported under that exact name, find the equivalent helper (search for `FLOW_KEY_TO_SLUG` usages) and import accordingly. Don't introduce a new helper.

- [ ] **Step 3: Wire the strip into the ticket list**

Modify `apps/web/components/consumer-ticket-board.tsx`. Find the place where `<TicketCard key={t.id} ticket={t} onOpen={() => onOpen(t.id)} />` is rendered (around line 245 from the earlier grep). Wrap each `TicketCard` so the strip can render as a sibling:

Replace:
```tsx
{tickets.map((t) => (
  <TicketCard key={t.id} ticket={t} onOpen={() => onOpen(t.id)} />
))}
```

With:
```tsx
{tickets.map((t) => {
  const payload = (t as { payload?: Record<string, string> }).payload ?? {};
  const futureDate = payload.future_date ?? '';
  const showStrip =
    t.status === 'COMPLETED' &&
    payload.case_status === 'Pending Case' &&
    futureDate !== '' &&
    (t.intakeFlow === 'judicial_case_files' || t.intakeFlow === 'judicial_case_information');
  return (
    <div key={t.id}>
      <TicketCard ticket={t} onOpen={() => onOpen(t.id)} />
      {showStrip && (
        <FutureTicketsStrip
          ticketId={t.id}
          flow={t.intakeFlow as 'judicial_case_files' | 'judicial_case_information'}
          nextHearingDate={futureDate}
        />
      )}
    </div>
  );
})}
```

Add the import near the existing component imports at the top of the file:

```tsx
import { FutureTicketsStrip } from './consumer-ticket-board/future-tickets-strip';
```

- [ ] **Step 4: Confirm `t.payload` and `t.intakeFlow` are on the API response**

```bash
grep -n "payload\|intakeFlow" /Users/asad/Projects/Wusuq-Web/apps/api/src/tickets/tickets.service.ts | head -10
```

The findAll/findOne responses include `payload` (a JSON column on Ticket) and `intakeFlow` (a string column). If the consumer-ticket-board `TicketRow` type doesn't already include them, extend the type:

Open `apps/web/components/consumer-ticket-board.tsx` and find the `type TicketRow = { ... }` definition (search for `TicketRow`). Add:

```ts
payload?: Record<string, string>;
intakeFlow?: string;
```

If the type is already permissive (e.g. `any`), no edit needed.

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/consumer-ticket-board.tsx apps/web/components/consumer-ticket-board/future-tickets-strip.tsx
git commit -m "feat(future-tickets): CTA strip below completed pending-case tickets

PDF #2. Renders 'Next hearing <date> — Order Future Tickets →' below
a TicketCard when the ticket has completed, the underlying case is
still Pending, future_date is captured, and the flow is one of
judicial_case_files / judicial_case_information. Links to the wizard
with ?futureFromTicketId=<id>.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Wizard prefill effect

**Files:**
- Modify: `apps/web/components/intake-wizard.tsx`

- [ ] **Step 1: Locate the existing draft-active hydration effect**

```bash
grep -n "getActiveDraft\|intake-drafts/active\|useSearchParams" apps/web/components/intake-wizard.tsx | head -10
```

The plan adds a new effect that fires before / instead of the active-draft fetch when `futureFromTicketId` is set. Confirm where the active-draft effect lives (it's the one that calls `apiClient.get(\`/tickets/intake-drafts/active?flow=…\`)` and updates `setDraft`).

- [ ] **Step 2: Add the prefill effect**

In `apps/web/components/intake-wizard.tsx`, near the top of the component (just below the existing `useSearchParams` / `useEffect` block that handles draft hydration), insert:

```tsx
import { useSearchParams } from 'next/navigation';
import { buildFutureTicketsPayload } from '@/lib/future-tickets';
```

(If `useSearchParams` is already imported, skip the import.)

Inside the component, add this new ref-and-effect pair. It must run BEFORE the active-draft fetch — easiest is to make the active-draft effect skip when `futureFromTicketId` is present.

```tsx
const searchParams = useSearchParams();
const futureFromTicketId = searchParams?.get('futureFromTicketId') ?? null;
const futurePrefillAppliedRef = useRef(false);

useEffect(() => {
  if (!futureFromTicketId) return;
  if (futurePrefillAppliedRef.current) return;
  futurePrefillAppliedRef.current = true;
  let cancelled = false;
  apiClient
    .get<{ id: string; payload?: Record<string, string>; intakeFlow?: string }>(
      `/tickets/${encodeURIComponent(futureFromTicketId)}`,
    )
    .then((source) => {
      if (cancelled || !source?.payload) return;
      const nextPayload = buildFutureTicketsPayload({
        sourceTicketId: source.id,
        sourcePayload: source.payload,
      });
      // Determine the final step index for the active flow.
      const flowSteps = selectedFlow?.steps ?? [];
      const finalStepIdx = Math.max(flowSteps.length - 1, 0);
      setDraft((current) => ({
        ...current,
        // Drop any draftId so the next autosave creates a fresh row
        // rather than mutating the previous active draft.
        draftId: undefined,
        flow: (source.intakeFlow as typeof current.flow) ?? current.flow,
        step: finalStepIdx,
        payload: nextPayload,
      }));
    })
    .catch(() => {
      // Silent failure: leave the wizard in its default empty state.
      // The banner will still render and the user can pick fields manually.
    });
  return () => {
    cancelled = true;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [futureFromTicketId, selectedFlow]);
```

- [ ] **Step 3: Skip active-draft hydration when prefilling**

Find the existing effect that fetches `/tickets/intake-drafts/active?flow=…` (added in M0.1). Add an early-return at the top:

```tsx
useEffect(() => {
  if (futureFromTicketId) return;   // ← NEW: skip when prefilling from a source ticket
  if (!flowKey) return;
  // … existing body unchanged …
}, [/* existing deps */ futureFromTicketId]);
```

Add `futureFromTicketId` to the effect's dependency array.

- [ ] **Step 4: Confirm useRef + import**

```bash
grep -n "useRef\|import.*react" apps/web/components/intake-wizard.tsx | head -5
```

If `useRef` isn't already imported from React, add it to the existing `import { useEffect, useState, ... } from 'react'` line.

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/intake-wizard.tsx
git commit -m "feat(future-tickets): wizard prefill effect on futureFromTicketId

PDF #2. When the wizard mounts with ?futureFromTicketId in the URL,
fetch the source ticket via GET /tickets/:id, run the source payload
through buildFutureTicketsPayload, jump to the wizard's final step,
and short-circuit the active-draft hydration (since this prefill is
the source of truth, not whatever stale draft happens to exist).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Contextual in-wizard banner

**Files:**
- Create: `apps/web/components/intake-wizard/future-tickets-banner.tsx`
- Modify: `apps/web/components/intake-wizard.tsx`

- [ ] **Step 1: Create the banner**

`apps/web/components/intake-wizard/future-tickets-banner.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { CalendarClock, ArrowLeft } from 'lucide-react';

type Props = {
  /** Short id label shown to the user (e.g. the batch number). */
  sourceTicketLabel: string;
};

export function FutureTicketsBanner({ sourceTicketLabel }: Props) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50/40 px-4 py-3 text-sm text-brand-700">
      <div className="flex items-start gap-3">
        <CalendarClock className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="leading-snug">
          <p className="font-semibold">Reordering for the next hearing ({sourceTicketLabel})</p>
          <p className="text-xs text-brand-700/80">
            Confirm the upcoming hearing date and submit. Court and case details have been pre-filled.
          </p>
        </div>
      </div>
      <Link
        href="/consumer/my-tickets"
        className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-brand-300 bg-surface px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100/60"
      >
        <ArrowLeft className="h-3 w-3" />
        Back
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Wire the banner into the wizard**

In `apps/web/components/intake-wizard.tsx`, capture the source ticket's batch number when the prefill fetch resolves, then render the banner above the wizard content when `futureFromTicketId` is present.

Add state in the component:

```tsx
const [futureSourceLabel, setFutureSourceLabel] = useState<string>('');
```

In the prefill effect from Task 3, after the `setDraft` call, also call `setFutureSourceLabel(source.batchNo ?? source.id)`:

```ts
setFutureSourceLabel(source.batchNo ?? source.id);
```

The `findOne` API response includes `batchNo` (it's a string column on the Ticket model). If it's not in the typed response, widen the type inline:

```ts
apiClient.get<{ id: string; batchNo?: string; payload?: ...; intakeFlow?: ... }>(...)
```

- [ ] **Step 3: Render the banner above the wizard**

Find the top of the wizard's JSX (where the step rail / step header is rendered). Add at the very top of the wizard's main container:

```tsx
{futureFromTicketId && futureSourceLabel ? (
  <FutureTicketsBanner sourceTicketLabel={futureSourceLabel} />
) : null}
```

Import the banner near the existing imports:

```tsx
import { FutureTicketsBanner } from './intake-wizard/future-tickets-banner';
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/intake-wizard/future-tickets-banner.tsx apps/web/components/intake-wizard.tsx
git commit -m "feat(future-tickets): contextual wizard banner

PDF #2. Renders a 'Reordering for the next hearing (TKT-…)' banner
above the wizard whenever ?futureFromTicketId is in the URL, with a
'← Back' link to /consumer/my-tickets so the consumer has an explicit
recovery path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: End-to-end live verification

This task has no code; it's an explicit verification step run after everything else is committed.

- [ ] **Step 1: Start the dev stack if not running**

```bash
lsof -iTCP:4000 -sTCP:LISTEN -n -P 2>/dev/null
lsof -iTCP:3000 -sTCP:LISTEN -n -P 2>/dev/null
lsof -iTCP:3001 -sTCP:LISTEN -n -P 2>/dev/null
```

Expected: at least the API (4000) is up. If web isn't running, start it:

```bash
cd /Users/asad/Projects/Wusuq-Web
pnpm dev:web > /tmp/wusuq-web.log 2>&1 &
disown
sleep 6
```

Identify which port Next.js bound to by tailing the log. Most likely 3000, 3001, or 3002.

- [ ] **Step 2: Seed a completed pending-case ticket via API**

There must be a completed pending-case Case Files ticket in the test consumer's history for the CTA strip to appear. If `testconsumer@wusuq.com` doesn't have one, create one via curl and manually transition it to COMPLETED. Alternatively, query the DB to find an existing one:

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"testconsumer@wusuq.com","password":"password123"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')

curl -s "http://localhost:4000/api/tickets?consumerId=$(python3 -c '
import sys,json
print(json.loads(open("/dev/stdin").read()).get("id",""))
' < <(curl -s "http://localhost:4000/api/auth/me" -H "Authorization: Bearer $TOKEN"))" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -40
```

Find a Case Files ticket with `status: COMPLETED`, `payload.case_status: "Pending Case"`, `payload.future_date: "<some ISO date>"`.

If none exists, create one and force-complete:
1. POST `/api/tickets/intake/judicial/case-files` with a minimal payload including `case_status: "Pending Case"`, `future_date: "2026-08-15"`.
2. As `superadmin@wusuq.com`, PATCH the resulting ticket's status through `PENDING → ASSIGNED → IN_PROGRESS → WAITING_APPROVAL`, then submit clerk costs, then transition to COMPLETED. This mirrors the staff workflow.

(Alternatively, write a one-off SQL update to flip an existing ticket to COMPLETED for the test consumer — faster.)

- [ ] **Step 3: Drive the flow via Playwright**

Load the playwright MCP tools (`mcp__plugin_playwright_playwright__browser_*`) and run:

1. Navigate to `http://localhost:<port>/consumer/login/email`.
2. Login as `testconsumer@wusuq.com` / `password123`.
3. Navigate to `/consumer/my-tickets`.
4. Verify the seeded ticket renders with a strip below it reading "Next hearing <date> Order Future Tickets".
5. Click the strip.
6. Verify navigation lands on `/consumer/paralegal-services/judicial/case-files?futureFromTicketId=<id>`.
7. Verify the banner appears at the top of the wizard.
8. Verify the wizard is on the **final step** (Documents & Delivery).
9. Verify `payload.case_date` shows the source's `future_date`.
10. Verify `payload.future_date` is empty.
11. Verify the source ticket's city, court, case_no, case_title pre-populate the summary panel (or Step 2 if navigated back).
12. Submit the new ticket. Verify a new ticket id is returned, and that its payload includes `parent_ticket_id` matching the source.

- [ ] **Step 4: If any step fails, file a follow-up commit**

If Step 3 reveals an issue, fix it. Don't proceed to Step 5 without a green walkthrough.

- [ ] **Step 5: Commit a verification note (optional)**

Often the verification reveals minor polish work. Bundle any polish into a single follow-up commit:

```bash
git add <files>
git commit -m "fix(future-tickets): <what you fixed during the live walkthrough>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

If no polish was needed, no commit. The verification is implicit (the prior commits stand).

---

## Spec coverage check

- "Thin CTA strip below the existing TicketCard, gated on (status=COMPLETED, case_status=Pending Case, future_date set, flow ∈ {…})" → Task 2.
- "Link to wizard slug with `?futureFromTicketId=<id>`" → Task 2 step 1 builds the href; Task 3 reads the param.
- "Mount effect fetches `GET /tickets/<id>`, prefills, rolls dates forward, clears delivery, jumps to final step, skips active-draft hydration" → Task 3.
- "buildFutureTicketsPayload with keep / roll / reset / clear / tag rules" → Task 1 with 6 unit tests covering each rule.
- "Contextual banner above the wizard" → Task 4.
- "parent_ticket_id stamped on the new payload" → Task 1 step 3 + asserted by Task 1 step 1 test #5.
- "No new API endpoint, no migration" → none of Tasks 1-4 touches `apps/api/**`.
- Live verification → Task 5.

All spec sections have at least one task implementing them.
