# PDF #7 — Post-completion "Order another service" — design

Status: approved 2026-05-13.
Scope: PDF feedback item #7 ("When the ticket is completed, this notification appears here. Need to discuss what after completion? need to ask want another service of the same city or court.").

## Problem

When a Wusuq ticket completes, the consumer has no in-app prompt suggesting a follow-up paralegal service. The product owner wants the completion event to surface a CTA so a satisfied consumer can quickly start another order.

## Approach

Single CTA on the **ticket detail drawer**, no pre-fill. The CTA links to a new `/consumer/paralegal-services` root page that lets the consumer choose Judicial vs Non-Judicial and walk the wizard fresh from Step 1. No data is carried over from the completed ticket — the consumer treats each new order as a clean start.

This explicitly differs from PDF #2 ("Future tickets" — same-case re-order at the next hearing) which IS pre-filled and case-specific. #7 is the generic "any service" prompt.

## Trigger & visibility

CTA surfaces only on tickets with `status === 'COMPLETED'`. It appears as a "What's next?" `PanelCard` near the bottom of the existing `ConsumerTicketDrawer` (defined in `apps/web/components/consumer-ticket-board.tsx`).

- No "seen" flag, no dismissal — persistent so the consumer can return any time.
- The ticket-list card has no equivalent link (deliberate, to avoid clutter on `/consumer/my-tickets`).

## Action

CTA is a `<Link>` to `/consumer/paralegal-services`. No query params, no payload pre-fill, no draft creation. The consumer arrives at the picker as if they navigated from the dashboard.

## New route

`apps/web/app/(consumer)/consumer/paralegal-services/page.tsx` — currently absent. Add a simple page with two tiles linking to the existing children:

- **Judicial Services** → `/consumer/paralegal-services/judicial`
- **Non-Judicial Services** → `/consumer/paralegal-services/non-judicial`

Mirrors the tile pattern used on `/consumer/dashboard`. Re-uses the existing `Link`, `Button`, and tile components.

## Components touched

1. New: `apps/web/app/(consumer)/consumer/paralegal-services/page.tsx` (~80 LOC).
2. Modify: `apps/web/components/consumer-ticket-board.tsx` (`ConsumerTicketDrawer`) — append the "What's next?" card when `ticket?.status === 'COMPLETED'`.

## Visual

Drawer card markup:

```
┌─ What's next? ─────────────────────────────────────┐
│                                                    │
│  Need another paralegal service?                   │
│  Browse judicial and non-judicial services to       │
│  start a new request.                              │
│                                                    │
│  [ Order another service → ]                       │
│                                                    │
└────────────────────────────────────────────────────┘
```

Uses the existing `PanelCard` / `Button` primitives. Indigo accent matches the rest of the consumer surface.

## Interaction with PDF #2 (Future Tickets)

When a completed ticket qualifies for BOTH:

- #2 — original `payload.case_status === 'Pending Case'` AND `payload.next_hearing_date` present, AND
- #7 — any completed ticket,

both CTAs appear stacked inside the drawer's "What's next?" section. PDF #2's case-specific reorder CTA sits *above* PDF #7's generic CTA because the more contextual offer is more useful.

Implementation: the existing #2 work (already underway via tasks FT-T1 through FT-T5) inserts its CTA inside the same "What's next?" `PanelCard`. #7 lands second.

## Out of scope (v1)

- Pre-filling city / court / service from the completed ticket.
- Service recommendations driven by `recommendationsForCase` in `packages/shared` (could be wired later).
- A/B telemetry on the CTA click.
- Post-completion email or push notifications.
- A ticket-list (My Tickets card) link surface — deliberately deferred to keep the My Tickets page uncluttered.

## Risks

- Low risk overall — drawer-only surface, no data write, single new route.
- The new `/consumer/paralegal-services` root page is also reachable from any existing CTA that links to it (`Start a new request`, etc.) — those currently point at `/consumer/paralegal-services/judicial` directly. Leaving them as-is to avoid scope creep; the new page is a destination only for the new #7 CTA.
