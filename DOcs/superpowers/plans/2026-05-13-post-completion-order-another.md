# PDF #7 — Post-completion "Order another service" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a consumer's ticket completes, surface a "What's next?" CTA in the ticket detail drawer that links to a new `/consumer/paralegal-services` root page where they pick Judicial or Non-Judicial and start a fresh order.

**Architecture:** No data carried over from the completed ticket. The drawer card is purely a `<Link>` to the new root page. The new root page is a static two-tile picker. No DB changes, no API changes, no shared package changes.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind, existing `PanelCard` / `Button` / `Link` primitives.

---

## File structure

**New**
- `apps/web/app/(consumer)/consumer/paralegal-services/page.tsx` — Judicial / Non-Judicial picker landing.

**Modify**
- `apps/web/components/consumer-ticket-board.tsx` — append the "What's next?" `PanelCard` inside `ConsumerTicketDrawer` when ticket status is `COMPLETED`.

That's it — two files, no API/DB work.

---

## Task 1: New paralegal-services root page

**Files:**
- Create: `apps/web/app/(consumer)/consumer/paralegal-services/page.tsx`

- [ ] **Step 1: Verify the route doesn't already exist**

```bash
ls apps/web/app/\(consumer\)/consumer/paralegal-services/page.tsx
```

Expected: `ls: ... No such file or directory` (only the `judicial/` and `non-judicial/` subdirectories exist).

- [ ] **Step 2: Check the existing tile pattern used on dashboards**

Skim `apps/web/app/(consumer)/consumer/dashboard/page.tsx` (or wherever Wusuq renders the service-category tiles today) for the existing styling conventions — rounded card, indigo accent, icon + heading + 1-line description + `Browse →` link. The new page mirrors that pattern.

- [ ] **Step 3: Create the page**

Write `apps/web/app/(consumer)/consumer/paralegal-services/page.tsx`:

```tsx
import Link from 'next/link';
import { Scale, FileText } from 'lucide-react';

export default function ParalegalServicesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Paralegal Services
        </h1>
        <p className="mt-1 text-sm text-slate-500">Choose a category to get started.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/consumer/paralegal-services/judicial"
          className="group rounded-2xl border border-border-soft bg-surface p-6 shadow-elev-1 transition-[transform,box-shadow] duration-200 ease-silk hover:-translate-y-0.5 hover:shadow-elev-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
            <Scale className="h-5 w-5" />
          </span>
          <h2 className="mt-3 text-base font-semibold text-slate-900">Judicial Services</h2>
          <p className="mt-1 text-sm text-slate-500">
            Case files, case information, case search, case filing, and power of attorney
            across Lower, High, Special, Federal Shariat, Supreme, and Federal Constitutional
            courts.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600 group-hover:text-brand-700">
            Browse <span aria-hidden>→</span>
          </span>
        </Link>

        <Link
          href="/consumer/paralegal-services/non-judicial"
          className="group rounded-2xl border border-border-soft bg-surface p-6 shadow-elev-1 transition-[transform,box-shadow] duration-200 ease-silk hover:-translate-y-0.5 hover:shadow-elev-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <FileText className="h-5 w-5" />
          </span>
          <h2 className="mt-3 text-base font-semibold text-slate-900">Non-Judicial Services</h2>
          <p className="mt-1 text-sm text-slate-500">
            Copy of FIR, Search Criminal Record by CNIC and Police Station, and
            Registry / Deed copies.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600 group-hover:text-brand-700">
            Browse <span aria-hidden>→</span>
          </span>
        </Link>
      </div>
    </div>
  );
}
```

**Notes:**
- Server component by default — no `'use client'` directive, no hooks. Just static links.
- Uses `lucide-react` icons already in the dependency tree.
- Class names match the existing tile pattern (`rounded-2xl border border-border-soft bg-surface shadow-elev-1` etc.).

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

Expected: clean across all three workspaces.

- [ ] **Step 5: Live smoke**

Start the consumer web dev server if not already running (`pnpm dev:web`). Open `http://localhost:3000/consumer/paralegal-services` (or whichever port). Confirm:
- Two tiles render side by side.
- Clicking "Judicial Services" lands on `/consumer/paralegal-services/judicial`.
- Clicking "Non-Judicial Services" lands on `/consumer/paralegal-services/non-judicial`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/\(consumer\)/consumer/paralegal-services/page.tsx
git commit -m "feat(web): add /consumer/paralegal-services root picker (PDF #7)

New landing page with two tiles linking to /consumer/paralegal-services/judicial
and /consumer/paralegal-services/non-judicial. The root route previously
returned 404 because only the subdirectories existed. Needed as the
destination for the post-completion 'Order another service' CTA in the
next commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: "What's next?" CTA in the ticket drawer

**Files:**
- Modify: `apps/web/components/consumer-ticket-board.tsx`

- [ ] **Step 1: Locate the `ConsumerTicketDrawer` component**

```bash
grep -n "function ConsumerTicketDrawer\|<DrawerFooter\|DrawerContent" apps/web/components/consumer-ticket-board.tsx | head
```

Expected: a line number where `function ConsumerTicketDrawer({ ticketId, onClose }` is declared and lines showing the `<DrawerContent>...</DrawerContent>` wrapper.

- [ ] **Step 2: Find the bottom of the drawer body**

Inside `ConsumerTicketDrawer`, look for the closing `</DrawerBody>` (or the last `<section>` before the footer). The new "What's next?" card goes there — as the last child of the drawer body, after every other section (case details, costs, documents, etc.) so it reads as a tail-end "what now?" prompt.

- [ ] **Step 3: Add the CTA**

Right before `</DrawerBody>` (or whatever the closing tag of the scrollable content region is), insert:

```tsx
{ticket?.status === 'COMPLETED' ? (
  <PanelCard className="mt-4 border-brand-200 bg-gradient-to-br from-brand-50 to-violet-50">
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white">
        <ArrowRight className="h-4 w-4" />
      </span>
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-slate-900">What&rsquo;s next?</h3>
        <p className="mt-1 text-sm text-slate-600">
          Need another paralegal service? Browse judicial and non-judicial services to
          start a new request.
        </p>
        <Link href="/consumer/paralegal-services" className="mt-3 inline-block">
          <Button variant="brand" size="sm" rightIcon={<ArrowRight className="h-4 w-4" />}>
            Order another service
          </Button>
        </Link>
      </div>
    </div>
  </PanelCard>
) : null}
```

**Notes:**
- The `Link`, `Button`, `ArrowRight`, and `PanelCard` symbols are already imported at the top of the file (verified in the most recent file state — `Link` from `next/link`, `Button` from `@/components/ui/button`, `ArrowRight` from `lucide-react`, `PanelCard` from `@/components/ui/panel-card`).
- If `PanelCard` doesn't accept a `className` prop, fall back to a plain `<div>` with the same Tailwind classes. Check the prop signature in `apps/web/components/ui/panel-card.tsx` once before deciding.
- The `mt-4` margin assumes the previous element doesn't already have a generous bottom margin. If the spacing looks off in the live smoke (Step 5), bump to `mt-6` or move the card inside a `<section>` wrapper that matches sibling spacing.

- [ ] **Step 4: Coordinate with PDF #2 (Future Tickets)**

The PDF #2 work (Future Tickets — case-specific re-order CTA) was implemented in parallel and inserts its own UI inside the drawer. Check the file for any existing `<FutureTicketsStrip />` or `payload.case_status === 'Pending Case'` block already in the drawer. If one exists:

- Place the #2 strip BEFORE the new "What's next?" card (case-specific contextual offer first, generic CTA second).
- If both are inside their own PanelCards, keep them stacked vertically with a small gap (`space-y-3` on the parent).

If no FutureTicketsStrip is in the drawer (it might only live on the ticket card today), no coordination needed. Just add the #7 card as described.

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 6: Live smoke**

Make sure the web (port 3000 or 3002) and API (port 4000) are running.

1. Log in as `testconsumer@wusuq.com` / `password123` via `/consumer/login/email`.
2. Open `/consumer/my-tickets`. Find a ticket that's already COMPLETED (or use Prisma Studio / a curl against `/api/tickets/:id/status` as a super-admin to flip an existing ticket).
3. Click the completed ticket → drawer opens → scroll to the bottom → verify the "What's next?" card appears with the indigo accent and the "Order another service" button.
4. Click the button → lands on `/consumer/paralegal-services` (the new root) → confirms both tiles are there.
5. Open a NON-completed ticket → drawer opens → verify the "What's next?" card does NOT appear.

If no completed ticket exists, create one quickly:
```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d '{"identifier":"superadmin@wusuq.com","password":"password"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
# pick a ticket id from the testconsumer's tickets, then walk it through statuses to COMPLETED
TICKET_ID=$(curl -s "http://localhost:4000/api/tickets?consumerId=cmp0ytdr5000007h69wecq5vg&limit=1" -H "Authorization: Bearer $TOKEN" | python3 -c 'import sys,json;print(json.load(sys.stdin)["items"][0]["id"])')
for s in ASSIGNED IN_PROGRESS WAITING_APPROVAL COMPLETED; do
  curl -s -X PATCH "http://localhost:4000/api/tickets/$TICKET_ID/status" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"status\":\"$s\"}" | python3 -m json.tool | head -5
done
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/consumer-ticket-board.tsx
git commit -m "feat(consumer): post-completion 'Order another service' CTA in drawer (PDF #7)

When a consumer ticket reaches COMPLETED status, the ticket detail drawer
gains a 'What's next?' PanelCard at the bottom linking to
/consumer/paralegal-services. The CTA carries no payload — the consumer
picks Judicial / Non-Judicial and starts a fresh order.

Differs from PDF #2 (Future Tickets, case-specific re-order at next
hearing). When both apply, the PDF #2 strip stacks ABOVE this generic
CTA inside the same drawer region.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Spec coverage check

- Spec Section "Trigger & visibility" — Task 2 gates the card on `ticket?.status === 'COMPLETED'`. ✓
- Spec Section "Action" — Task 2 uses `<Link href="/consumer/paralegal-services">`. No query params, no draft creation. ✓
- Spec Section "New route" — Task 1 creates the page with two tiles. ✓
- Spec Section "Components touched" — Task 1 creates the page, Task 2 modifies `consumer-ticket-board.tsx`. ✓
- Spec Section "Visual" — Task 2 markup matches the spec's drawer-card sketch (gradient bg, brand icon, heading, copy, button). ✓
- Spec Section "Interaction with PDF #2" — Task 2 Step 4 explicitly orders the two CTAs (PDF #2 strip above PDF #7 card). ✓
- Spec Section "Out of scope" — no tasks for pre-fill / recommendation engine / telemetry / notifications / ticket-list link. ✓

All spec sections have at least one task. No placeholders. Ready for execution.
