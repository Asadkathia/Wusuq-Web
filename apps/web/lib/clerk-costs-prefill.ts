/**
 * Prefill rules for the REPRESENTATIVE's own "Update ticket payments" /
 * "Update submitted costs" dialog (batch-9 Task 5, fix round 1, §6.3).
 *
 * WHY THIS EXISTS — the dialog opened BLANK for a representative re-entry.
 * After the button gate widened to let a representative reopen the dialog
 * from WAITING_APPROVAL (so they could correct a typo instead of it being
 * "no way back"), `openCostsModal` still read the flat consumer-facing
 * charge columns (`ticket.deliveryCharges`, `ticket.printingCharges`, ...).
 * `findAll` deliberately withholds exactly those columns from
 * representative callers (audit 1.1 — consumer money is hidden from reps by
 * design) and that exclusion is correct and must not be relaxed. So a
 * representative reopening the dialog saw empty inputs and had to retype
 * every value from memory — weaker than the correction the client asked
 * for.
 *
 * THE FIX: the right data already reaches a representative — `findAll` DOES
 * send them the four frozen `clerk*Charges` snapshot columns
 * (`clerkDeliveryCharges`, `clerkPrintingCharges`, `clerkAttestedCharges`,
 * `clerkNonAttestedCharges`), because those are the representative's own
 * previously-declared figures (the exact source list-driven payout-cap
 * surfaces already rely on). Read from there first.
 *
 * Distinct from `prefillPhase2Charge` (lib/finalize-charges.ts, the ADMIN
 * Review & Complete prefill) — that helper opens at MAX(final, submitted)
 * because an admin may already have applied a markup worth preserving. This
 * helper has no "final" column to reconcile against: it is the
 * representative reading back their OWN submission, so the clerk snapshot
 * wins outright when present, falling back to the flat column only when no
 * clerk submission was ever recorded (e.g. a staff caller viewing a ticket
 * an admin priced directly).
 *
 * NULL-VS-ZERO DISCIPLINE (CLAUDE.md flags this exact coercion class — it
 * has shipped as a live money bug three times in this repo, including once
 * already in this dialog: `ticket.deliveryCharges ? String(...) : ''`
 * renders a genuine submitted 0 as blank). A clerk-submitted `0` is a real,
 * previously-declared value and must prefill as "0". An ABSENT snapshot
 * (`null`/`undefined`) means "no submission was ever recorded", never 0.
 * Both checks below are strict `!= null` / `== null`, never a falsy check.
 */

/**
 * The representative's own previously-declared amount for one phase-2
 * charge line, preferring the frozen clerk snapshot and falling back to the
 * flat column — or `null` when neither carries a value.
 */
export function resolveOwnSubmittedCharge(
  flat: number | string | null | undefined,
  clerkSnapshot: number | string | null | undefined,
): number | null {
  const source = clerkSnapshot != null ? clerkSnapshot : flat;
  if (source == null) return null;
  const n = Number(source);
  return Number.isFinite(n) ? n : null;
}

/**
 * String form for a text input's `value` binding — `""` when there is
 * nothing to prefill (never `"0"` masquerading as absent, and never blank
 * masquerading as a genuine submitted 0).
 */
export function prefillOwnSubmittedCharge(
  flat: number | string | null | undefined,
  clerkSnapshot: number | string | null | undefined,
): string {
  const n = resolveOwnSubmittedCharge(flat, clerkSnapshot);
  return n == null ? '' : String(n);
}
