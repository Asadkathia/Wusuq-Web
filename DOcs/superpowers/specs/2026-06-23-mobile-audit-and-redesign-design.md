# Mobile Audit & Redesign — Design Spec

**Date:** 2026-06-23
**Status:** Approved (design) — audit execution pending
**Owner decisions captured:** scope = consumer deep + portal light · method = run app + real browser at phone viewports · workflow = audit doc first, then redesign · bar = responsive polish that keeps the existing design language

---

## 1. Goal

The Wusuq web app (`apps/web`, Next.js 16 + Tailwind v4) is not optimized for mobile. The app *chrome* already has baseline responsive handling (sidebar → hamburger drawer below `lg`, sticky topbar), but the **content** — boards, data tables, dialogs, dashboards, and the 2,586-line intake wizard — was built desktop-first and breaks or cramps on phones.

This spec defines the **standardized responsive patterns** the redesign will apply, the **audit methodology** used to find every issue, and the **findings document structure** that the browser audit will populate. It is the single source of truth for the mobile work.

## 2. Scope

- **Consumer side — deep.** Every consumer-facing screen, component, and element is audited and redesigned.
- **Staff/admin portal — light.** Only the worst breakage (P0/P1) on a representative sample of portal screens is audited and fixed; no full portal redesign.

### In scope (reflow within the current design language)
- Dense tables → stacked **card lists** on phones.
- Stat/summary grids collapse to a single column.
- Dialogs/panels resize to fit phone width (full-width, scrollable) instead of overflowing.
- Tap targets brought to ≥44px; text inputs ≥16px font (prevents iOS auto-zoom).
- Eliminate all horizontal page overflow (long case numbers, ticket IDs, money values wrap/truncate).
- Intake wizard reflowed: single-column option tiles, condensed step rail, usable pickers, reachable footer controls.
- Filter/toolbar rows stack or collapse.

### Explicitly OUT of scope (this is the next tier, deliberately declined)
- No bottom tab bar or any new navigation paradigm — keep the existing hamburger-drawer.
- No new swipe/sheet *interactions* or sticky CTA bars. Where one would genuinely help, it is recorded in findings as an **optional** note and NOT built without separate approval.
- No ground-up flow redesign that diverges from the desktop layout.

## 3. Standardized responsive patterns (design-language rules)

Every screen is held to these so the result is consistent rather than ad-hoc.

| # | Pattern | Rule |
|---|---------|------|
| 1 | **Breakpoints** | Mobile-first base styles; `sm:` (640px) and `lg:` (1024px — where the sidebar appears) layer up. Primary test widths: **360 / 390 / 430px**. |
| 2 | **Table → card** | A shared responsive wrapper renders a real `<table>` at `lg+` and a stacked card-per-row list below `lg` (label–value pairs + a primary action). Replaces today's `overflow-x-auto` horizontal scroll inside `DataTableShell`. |
| 3 | **Grids** | `grid-cols-1` base → `sm:grid-cols-2` → `lg:grid-cols-3/4`. No fixed multi-column grid on phone. |
| 4 | **Dialogs** | `DialogContent` goes near-full-width and vertically scrollable on phone; large forms (reprice / charges / finalize) get a phone-appropriate layout. Small confirmation dialogs stay centered. |
| 5 | **Tap targets** | Icon buttons, nav rows, wizard option tiles, and pickers are ≥44×44px. |
| 6 | **Forms** | Full-width inputs, ≥16px font, stacked labels, full-width cascading geo/phone pickers. |
| 7 | **Overflow guard** | Nothing exceeds the viewport width; long strings and tabular numbers truncate or wrap. |
| 8 | **Spacing / type** | Hero numbers (e.g. wallet balance) and headings scale down on phone; consistent `p-4 sm:p-6` page rhythm. |

**Tooling:** a small `useIsMobile` / `useMediaQuery` hook is added (none exists today) for the few cases that genuinely need JS branching; everything else uses Tailwind breakpoint utilities. The table→card behavior is delivered as a shared, reusable wrapper so individual boards don't each reinvent it.

## 4. Audit methodology

**Viewports:** 360 (small Android), 390 (iPhone), 430 (large phone); spot-check 768 (tablet) for the `lg` breakpoint handoff.

**Severity rubric:**
- **P0 — Broken:** horizontal overflow, content cut off, an unusable control, or overlapping elements.
- **P1 — Painful:** tiny tap targets, a table that requires horizontal scrolling, cramped/illegible content, awkward but still functional.
- **P2 — Polish:** spacing, alignment, type scale, or minor inconsistency.

**Per-screen output:** for each screen, a findings entry listing issues by severity with a short note and a screenshot reference per affected viewport.

## 5. Screen inventory

### Consumer (deep)
- Auth: phone login (phone / OTP / profile steps), email login, signup
- Dashboard (+ profile-completion banner)
- My Tickets (list + `unpaid` filter) · Ticket detail · Pay page
- Drafts
- Case Files · My Cases (list + detail)
- My Wallet
- Paralegal Services: judicial picker · non-judicial picker
- **Intake wizard — all 8 flows (own detailed sub-section in findings)**
- Documents
- My Files (uploader, list, row, quota, recently-deleted)
- Profile
- Payments: return page, mock page

### Portal (light — worst breakage only)
- Portal dashboard
- A representative ticket list + the ticket detail panel (`TicketDetailPanel`)
- One table-heavy board (finance or similar)

This portal sample is sized to catch P0/P1 chrome/table breakage that affects staff on phones, without committing to a full portal redesign.

## 6. Findings (browser audit — consumer pass 1)

### 6.0 Method note
Chrome on macOS clamps a real window to ~500px minimum width, so the audit drives each route inside a **same-origin 360/390px iframe** (media queries evaluate against the iframe width; localStorage auth is shared). Objective metrics come from an injected JS harness (horizontal overflow, sub-44px tap targets, sub-16px input fonts, rigid elements), supplemented by a **viewport width sweep** (measure `documentElement.scrollWidth` across 1100→360px to find the band where overflow appears). Logged in as the seeded test consumer (`testconsumer@wusuq.com`), which has sparse data — a caveat for data-dependent issues (see 6.1).

### 6.1 P0 — Horizontal overflow from the flex `min-width:auto` trap  *(systemic)*
**Reported by owner; reproduced and root-caused.** The consumer dashboard floors at a hard **581px minimum width** — `documentElement.scrollWidth` stays 581 for every viewport below ~580px (overflow: 41px @540, 101px @480, 151px @430, 191px @390, 221px @360). Only visible when the window is narrower than ~580px (a real phone, or a narrowed desktop), which is why an exact-390px snapshot can miss it.

Root cause is a **cooperating pair**:
1. **Layout column (structural, affects all pages in the shell).** The consumer layout (`app/(consumer)/layout.tsx`) is `<div class="flex min-h-screen"> <Sidebar/> <div class="flex flex-1 flex-col">`. The sidebar is `hidden lg:block` (0 width on mobile), but the content column is a flex child with the default `min-width:auto`, so it **will not shrink below its content's intrinsic width**. Injecting `min-width:0` on that column live moved the floor 581→565. The same shell wraps the staff portal (`app/(portal)/layout.tsx`), so it is at risk too.
2. **Non-shrinking content (dashboard).** Section-isolation pinned the residual floor to the **Recent activity panel → ticket rows** (`app/(consumer)/consumer/dashboard/page.tsx`). Each row is `flex items-center gap-4` with a right cluster `flex items-center gap-3 shrink-0` (amount + `StatusPill` + "Pay now"); `shrink-0` keeps the cluster at full width, giving the row a ~501px min-content inside the card.

**Fix (two parts):** add `min-w-0` to the flex content column in **both** layouts; and let the dashboard ticket row shrink/wrap on narrow screens (e.g. `flex-wrap` on the row, drop `shrink-0` / add `min-w-0`, or stack amount·status·pay below the title under `sm`). The `min-w-0` layout fix is the highest-leverage single change in this whole audit — it inoculates every page in the shell against the same trap, which is almost certainly why long-content rows on other pages can overflow too.

**Proven on both shells.** Injecting `min-width:0` on the content column live: consumer dashboard floor 581→565 (column-level floor removed; residual is the ticket-row content of part 2). Portal `/tickets/unpaid` floor **1176→360 (perfect fit)** — and critically, the table's `overflow-x-auto` wrapper then engages (`tableNowScrollsInternally: true`), so the page no longer breaks; the table scrolls within its own region. So for portal table pages the single `min-w-0` change fully resolves the page-level overflow on its own (downgrading it to contained table-scroll, the acceptable interim before §6.8 table→card).

### 6.2 P1 — Inputs render at 14px → iOS auto-zoom on focus  *(systemic)*
Every form control measured `font-size: 14px` (< 16px): the search fields on My Tickets / My Cases / Documents / My Files, and **all 5 Profile form inputs** (text + date). iOS Safari auto-zooms any focused input below 16px, shifting the layout and worsening the horizontal-scroll feel. Fix at the shared primitive level (`components/ui/input.tsx`, `select.tsx`, `form-field.tsx`): base font ≥16px on mobile (`text-base sm:text-sm`).

### 6.3 P1 — Tap targets below 44px  *(systemic)*
- Topbar icon buttons (hamburger, notifications) = **36×36**; Refresh buttons = **32px**; user-menu avatar = 44×40.
- **List-row action icon buttons** (Download / Delete on Case Files & My Files) = **28–34px**.
- Filter/segment pills (All / Unpaid / Active / Completed / Open / Closed) = **24–32px** tall.
Fix at `components/ui/icon-button.tsx` (min 44×44 hit area, optionally via padding so visual size is preserved) and the list-row action buttons / segmented tabs.

### 6.4 Good news — no consumer data tables; no static-width offenders
- Consumer boards use **card/`div` layouts, not HTML `<table>`** (zero `<table>` nodes, zero internal `overflow-x` scrollers across My Tickets, Wallet, Documents, My Files, Case Files). **The table→card conversion in §3 is therefore a portal-only concern**, not consumer.
- The `<meta name="viewport">` is correct (`width=device-width, initial-scale=1`, Next.js default). The `Drawer` is responsive (`w-full sm:max-w-[520px]`). No `w-screen`/`100vw`/`whitespace-nowrap`-on-dynamic-text page offenders found. The overflow is the flex trap of 6.1, not a fixed-width element.

### 6.5 P2 — Minor
- 2–3 text nodes per page render < 11px (uppercase tracking labels, timestamps) — legibility on small screens.
- Email login field is `type="text"` (no email keyboard on mobile); minor.

### 6.6 Pass-2 results — wizard, signup, portal
- **Intake wizard (Case Files, step 1):** no horizontal overflow across 768→360px; 1 sub-16px input; 7 sub-44px tap targets (topbar 36px, "Back to services" 20px, the Documents tab 38px, promo-code input 36px, Continue/Back footer). The wizard does **not** hit the flex trap because its content shrinks (no wide `shrink-0` cluster). **Deeper steps** (city/court/case-type pickers, option tiles, checkout, footer reachability) are click-gated modals not reachable by static load — flagged for **interaction-based QA** during implementation; not a blocker.
- **Consumer signup:** no overflow at any width; **5 sub-16px inputs** (same §6.2 issue); 2 small text links ("Sign in", "Continue with phone").
- **Portal — `/tickets/unpaid` (P0):** a 5-column `<table>` with **1145px natural width** overflows the page by **292px @900 → 786px @390 → 816px @360**. The `overflow-x-auto` wrapper does *not* contain it (because of the §6.1 flex trap), so the **whole page scrolls**, not just the table. Fixed entirely by the §6.1 `min-w-0` change (→360, table scrolls internally). Same `DataTableShell` pattern is used by **`/finance`** and the other portal ticket lists, so they share this finding and this fix.

### 6.7 P1/P2 — Portal table UX (after the structural fix)
Once `min-w-0` contains the tables, portal lists still require **horizontal scrolling within the table region** on phones (1145px / 5 cols in ~360px). Per §3 this is the **portal-only table→card** work: render `DataTableShell` rows as stacked cards below `lg`. This is the lighter portal pass (worst breakage only) — apply to the rep-facing ticket lists and finance first.

### 6.8 Proposed redesign priority order
1. **P0 — §6.1**: `min-w-0` on both shell layout columns (`app/(consumer)/layout.tsx`, `app/(portal)/layout.tsx`) + dashboard ticket-row shrink/wrap. *(Proven to resolve the reported consumer overflow AND the portal table-page overflow.)*
2. **P1 — §6.2**: 16px input fonts in shared primitives (`input.tsx`/`select.tsx`/`form-field.tsx`) — fixes consumer search fields, profile, signup, portal forms at once.
3. **P1 — §6.3**: 44px tap targets in `IconButton` + list-row actions + segmented tabs.
4. **P1 — §6.7**: portal table→card below `lg` (rep ticket lists + finance).
5. **Polish + wizard deep-step QA** (§6.6), then **P2 — §6.5** legibility.

## 7. Sequence after this spec is approved

1. Spec written & committed (this document).
2. Owner reviews the spec.
3. Browser audit executed — Section 6 filled with findings + screenshots; priority list proposed and approved.
4. `writing-plans` invoked to produce the redesign implementation plan; then implementation.

## 8. Risks & notes

- The intake wizard (`components/intake-wizard.tsx`, ~2,586 lines) is the single largest and highest-risk surface; its findings and redesign get a dedicated sub-section and likely its own plan phase.
- Table→card conversion touches every list board; delivering it as one shared wrapper limits regression surface and keeps the design language uniform.
- Per repo invariants, this work must not regress documented behavior (e.g. consumer redaction in `ConsumerTicketDetail`, the `PAYLOAD_LABEL` allowlist, payment gating). Mobile changes are presentational/layout-only and must preserve those guarantees.
