# Intake Wizard Redesign — Design Spec

**Date:** 2026-05-02
**Status:** Draft, pending implementation plan
**Owner:** Asad

## 1. Problem

The current intake wizard (`apps/web/components/intake-wizard.tsx`, 1308 lines) collects case details using `<select>` dropdowns and stacked form fields inside the standard portal layout. It is functional but feels clerical: users scan dropdown lists, tab between fields, and have no sense of progress, no live confirmation of what they are buying, and no inviting "onboarding" feel. Consumer adoption suffers because the flow looks like an admin form, not a guided experience.

## 2. Goal

Replace the wizard's interaction model with a **stepped card-stack onboarding flow** that:

- Presents one decision per screen with large, tappable cards instead of dropdowns
- Runs as a full-screen takeover (no sidebar, no header) for both consumer and staff users
- Shows a persistent right-rail summary of the user's answers and a live price estimate
- Maintains a single visual language across pick-from-options, numeric, date, free-text, and file-upload steps (every step is a centered "card" with the relevant input inside)

Out of scope: changing the underlying intake data model, the API contracts in `apps/api`, the `IntakeFlow` schema in `apps/web/lib/intake-flows.ts`, or the eventual checkout/payment step.

## 3. Decisions Locked With User

| Decision | Choice |
|---|---|
| Interaction direction | A · Stepped Card Stack (Typeform / Stripe-onboarding feel) |
| Surface | Full-screen takeover (consumer + staff both) |
| Side panel | Live answer summary + running price estimate |
| Non-card inputs | Card-shell, input inside (single visual language end-to-end) |

## 4. Layout

### 4.1 Full-screen shell

A new top-level route layout (e.g. `apps/web/app/(intake)/layout.tsx`) that does **not** render the portal sidebar or header. Contents:

```
┌─────────────────────────────────────────────────────────────┐
│ TOPBAR                                                      │
│ • Left: Wusuq mark + breadcrumb "Property Transfer · Step 4 of 6"
│ • Right: "Save & exit" button (closes wizard, returns to dashboard / consumer home)
├─────────────────────────────────────────────────────────────┤
│ THIN PROGRESS BAR (gradient, animates on step change)       │
├──────────────────────────────────┬──────────────────────────┤
│                                  │                          │
│        STAGE (centered card)     │   SUMMARY RAIL           │
│                                  │   (sticky, ~280px wide)  │
│                                  │                          │
└──────────────────────────────────┴──────────────────────────┘
```

- **Topbar** is fixed height (~56px). The "Save & exit" button confirms via a small dialog if the user has unsaved progress.
- **Progress bar** is a 3px strip directly beneath the topbar, filled to `(stepIndex + 1) / totalSteps`. Animated `transition-all duration-300` on step change.
- **Stage** is the main scroll area on mobile; on desktop it is a flex container that vertically centers a max-w-`xl` card.
- **Summary rail** lives in a right-side `aside`, hidden on viewports below `lg`. On mobile it collapses into a bottom sheet that the user can pull up.

### 4.2 The stage card

Every step renders the same scaffold:

```
[step label – "STEP 4"]
[question title – large, 22–28px]
[optional helper line]
[INPUT REGION – varies by step type]
[← Back]                  [Continue →]
```

The input region is the only thing that changes between step types (see §5). The rest of the scaffold is shared, which is what gives the flow its single-visual-language feel.

### 4.3 Summary rail

A sticky panel showing:

- **"Your case"** header
- One row per answered step: `<step label>` on the left, the chosen value on the right
- Each row is clickable — clicking jumps the user back to that step (preserves later answers when possible)
- Future steps appear muted with the value blank
- A divider, then **Total** with the live price estimate, computed via the existing pricing-rules engine
- Below total: a small "Estimate updates as you go" caption

The rail must update optimistically on every selection without waiting for a network round-trip.

## 5. Step types and how they render inside the card

The `IntakeField['type']` union in `lib/intake-flows.ts` already enumerates the kinds of input. Each maps to a specific card body:

| Field type | Card body |
|---|---|
| `select`, `radio`, `checkbox_single` (single value) | 2-column grid of large tiles (icon + title + helper). One question per step. |
| `number` | Large `+ / −` stepper, value rendered at 42px. Keyboard `+`/`−` and arrow keys supported. |
| `year_select` | Horizontal scrollable list of year tiles (current → 1970), most recent pre-focused. |
| `date` | Inline mini-calendar component (no popover), large enough for thumb selection on mobile. |
| `text` | Single large input centered in the card, label above, optional hint below, autofocus on step entry. |
| `textarea` | Same as `text` but `min-height: 120px`. |
| `file` | Full-card drop-zone with a dashed border, paperclip icon, "Drop files or click to browse". After upload, files render as removable chips inside the same card. |

Conditional fields (`showWhen`) collapse to a no-op step that auto-advances if the condition is unmet — the user never sees a blank or pre-skipped screen.

A step that contains multiple fields (rare today, but the schema allows it) is split into one card per field. The wizard runtime walks the flattened field list, not the `IntakeStep` boundary.

## 6. Interactions and motion

- **Step transitions:** 220ms slide+fade — outgoing step slides 24px left and fades, incoming slides in from 24px right.
- **Progress bar:** `transition-all 300ms ease-out`.
- **Card selection:** click on any tile immediately marks it selected (border + shadow), updates the rail, and after a 150ms beat auto-advances to the next step. Power users do not have to click "Continue" for single-select cards.
- **Keyboard:** number keys `1–9` select the corresponding tile in card-grid steps; `Enter` advances; `Esc` triggers "Save & exit"; `Backspace` goes to the previous step when no input is focused.
- **Smart defaults:** for steps with a clear common choice, the recommended tile shows a small "Recommended" ribbon and is pre-focused (but not pre-selected).
- **Validation:** invalid input prevents advance with a small inline error under the input; the Continue button is disabled until the input is valid. Required fields are obvious because the Continue button stays disabled.
- **Save & resume:** wizard state is persisted to `localStorage` (keyed by service + user id) after every step. On re-entry, a banner offers "Continue where you left off" or "Start over".

## 7. Component decomposition

Target structure under `apps/web/components/intake-wizard/`:

```
intake-wizard/
  wizard-shell.tsx            // full-screen shell: topbar, progress, layout grid
  wizard-runtime.tsx          // walks the field list, owns answers state, persistence
  summary-rail.tsx            // right-side answer + price panel
  card-stage.tsx              // the centered card scaffold (label, title, helper, nav)
  steps/
    select-step.tsx           // tile grid for select/radio/checkbox_single
    number-step.tsx           // big +/− stepper
    year-step.tsx             // year tile strip
    date-step.tsx             // inline calendar
    text-step.tsx             // single text input (also used for textarea)
    file-step.tsx             // drop-zone with chip list
  hooks/
    use-wizard-state.ts       // answers, navigation, persistence, derived progress
    use-price-estimate.ts     // calls existing pricing engine; debounced
```

The current `intake-wizard.tsx` (1308 lines) is replaced by `wizard-runtime.tsx` plus the step components. The existing `field-renderer.tsx`, `step-rail.tsx`, `service-geo-blocks.tsx`, `checkout-panel.tsx` are superseded; `file-upload.tsx` is reused inside `file-step.tsx`.

The `IntakeFlow` and `IntakeField` types in `lib/intake-flows.ts` stay unchanged — this redesign is purely a presentation-layer rewrite.

## 8. Routes

- `app/(intake)/layout.tsx` — bare layout, no sidebar/header
- `app/(intake)/intake/[service]/page.tsx` — mounts `wizard-runtime` for the chosen service
- The existing service picker (`components/service-picker.tsx`) becomes the entry point and routes the user into `/intake/[service]`

The current portal route (`/(portal)/...`) loses its intake page; the picker on the dashboard links into the new top-level `/intake/...` route.

## 9. Data flow

```
service-picker → router.push('/intake/[service]')
  ↓
wizard-runtime mounts
  ↓ reads IntakeFlow from intake-flows.ts
  ↓ flattens steps[].fields[] → linear field list
  ↓ restores any saved answers from localStorage
  ↓
on each user action:
  - update answers state
  - persist to localStorage
  - recompute price via use-price-estimate
  - update summary-rail
  - on advance: animate to next field (or skip via showWhen)
  ↓
final step: review screen → POST to flow.endpoint → success page → router.replace('/dashboard')
```

## 10. Error handling

- **Validation errors:** inline under the input, never block the back button.
- **Price estimate fetch failure:** rail shows "Estimate unavailable" in muted text; the user can still complete the flow.
- **Submission failure:** the final review card displays the server error inline with a "Try again" button; localStorage state is preserved so a refresh resumes the user at review.
- **Stale localStorage:** if the saved field set no longer matches the current `IntakeFlow` schema (a field was renamed/removed), discard the saved state and start fresh with a one-time toast.

## 11. Testing

- **Unit:** each step component renders correctly for a sample field, fires `onAnswer` on selection, respects `showWhen`.
- **Hook:** `use-wizard-state` correctly walks fields, skips conditionals, restores from localStorage, computes progress.
- **E2E (Playwright):** complete a full property-transfer intake end-to-end using the new wizard; verify summary rail updates, price ticks up, submission succeeds, and the saved-progress banner appears on re-entry.

## 12. Migration

This is a straight cut-over, not a parallel rollout. The old wizard is deleted in the same PR. The intake URL changes from a portal path to `/intake/[service]`; any existing in-product links are updated. Saved drafts (if any exist server-side) are not migrated — the current wizard does not persist drafts.

## 13. Pricing estimate wiring

The existing `POST /api/pricing-rules/resolve` endpoint already accepts partial input — only `flow` is required, every other field is optional, and the resolver returns a real `total` (₨ 0 when no rule matches yet). No backend work is required.

`use-price-estimate` calls `resolve` after every answered step, debounced ~250ms, with whatever subset of fields the user has provided so far. Mapping from `IntakeField` keys to DTO keys:

| Wizard answer key | DTO field |
|---|---|
| `service` (flow key) | `flow` |
| `court_level` | `courtLevel` |
| `case_status` | `caseStatus` |
| `year_filed` (or equivalent) | `caseYear` |
| `set_type` | `setType` |
| `attested_qty` (and `both_attested_qty`) | `attestedQty` |
| `non_attested_qty` (and `both_non_attested_qty`) | `nonAttestedQty` |
| `province` | `province` |
| `city` | `city` |

Rail behavior driven by the response:

- `matched: true` → show `total` formatted as ₨.
- `matched: false && rulesExistForFlow: true` → show "Estimate updates as you add details" in muted text (current answers don't yet match any rule).
- `matched: false && rulesExistForFlow: false` → show "Pricing not configured" warning (this is a misconfiguration; the wizard's final submit will fail and the user should be told upfront).

## 14. Open questions for plan-time

- Mobile bottom-sheet implementation: use an existing component (Headless UI dialog, Radix sheet, etc.) already in the project, or build a minimal one? Resolve at plan time after surveying current dependencies.
