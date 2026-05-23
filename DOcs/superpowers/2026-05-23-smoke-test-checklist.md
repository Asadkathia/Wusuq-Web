# Manual UI Smoke Checklist — Specs 1–3 (Intake / Payment / Clerk)

Date: 2026-05-23. Branch: `feat/clerk-workflow-redesign` (contains Specs 1+2+3).
Backend already live-smoked (all endpoints green); this covers the UI flows that
can't be auto-driven headless.

## 0. Setup

1. **Stop any stale dev server** (there was an old API on :4000) and restart on the current branch:
   ```bash
   git checkout feat/clerk-workflow-redesign
   pnpm dev   # api :4000 + web :3000
   ```
2. **Migrations are already applied** to the DB; **geo is already re-seeded** (every city now lists all 36 special courts).
3. **Payment gating toggle:** `apps/api/.env` currently has `DISABLE_PAYMENT_GATING=true` (lets tickets move without payment — good for fast clicking).
   - To test the **payment gating itself**, set `DISABLE_PAYMENT_GATING=false` and restart the API.
4. **Test logins** (CLAUDE.md): consumer `testconsumer@wusuq.com` / `password123` (via `/consumer/login/email`); staff `superadmin@wusuq.com` / `password`. Representative/clerk: use a `representative` account.
5. **Set bank details first** (admin → finance/payments → Bank Details editor) so the consumer pay screen has something to show.

---

## 1. Spec 1 — Intake forms (consumer wizard)

- [ ] **Special courts unified:** start a judicial intake, pick a Special Court tier in a *small* city (e.g. Sialkot, Skardu) → the court dropdown lists the **full 36-court** catalogue, same as Lahore.
- [ ] **Judge name:** Case Files and Case Information now show a **Judge Name** field; it's **required (red \*) only for Lower Court**, optional for High/Special/etc.
- [ ] **Case date at top:** in every flow's case-details step, the **date field is first** (Case Files, Case Info, Case Search after the search-mode tabs, PoA, Case Filing, FIR, Registry).
- [ ] **Case Info pending-only:** Case Information has **no case-type picker**; it submits as Pending.
- [ ] **Attested only on Case Files:** the attested/non-attested set-type picker appears **only in Case Files** — not in Case Search, FIR, or Registry/Deed.

## 2. Spec 2 — Payment & wallet

- [ ] **Checkout shows base only** for SPLIT flows (Case Files / FIR / Registry / Criminal Record): the wizard price summary shows the base service fee only — no attested/delivery/PDF lines.
- [ ] **Consumer pay screen:** after creating a consumer ticket, the pay screen shows the **bank details**, an **amount** (defaulting to the base due), a **screenshot upload**, **"Pay full upfront"** (for SPLIT) and **"Pay later"** options.
- [ ] **Submit screenshot → admin queue:** uploading a screenshot creates a pending payment; admin (finance board) sees it in the **Payment Approval Queue** with the screenshot.
- [ ] **Approve / reject:** admin approves → consumer's **wallet is credited**, the ticket's base is covered, it becomes **assignable**; consumer gets an approval notification. Reject → consumer gets a rejection notification.
- [ ] **Admin wallet adjustment:** finance board → adjust a consumer's wallet (amount + note); balance updates and open tickets auto-settle.
- [ ] **Gating** (only with `DISABLE_PAYMENT_GATING=false`): a consumer ticket can't be **assigned** until base is paid; a Case Files ticket can't be **completed/dispatched** until the remainder is paid.
- [ ] **Phase-2 finalize → remainder:** see Spec 3 clerk charges + admin finalize below; after finalize, the consumer sees a **"Final payment due"** prompt for the remainder; paying it (or wallet excess auto-covering it) unlocks dispatch.

## 3. Spec 3 — Clerk workflow

- [ ] **Clerk-gated detail:** log in as a **representative/clerk**, open an assigned ticket → the detail shows **only case info + Clerk Cost** (no consumer PII, no full charges, no payment, no timeline). Admin still sees the full panel.
- [ ] **Intake type shows:** the ticket detail now displays the **Intake Type** (e.g. "Case Files") — previously missing.
- [ ] **Case details ordered:** the case-details render order is **City → Court → Service → Case type → Case no → Year → Title → Judge → Date → …**.
- [ ] **Two-zone upload:** the clerk upload UI has **two drop zones** — "Work documents" and "Deliverable PDF(s)" — each accepting **multiple files**. Deliverable PDFs are consumer-visible; work docs are not. The detail panel groups documents by these categories.
- [ ] **Clerk-cost default + override:** in the assign dialog, the **Clerk Cost** field is pre-filled from the default; the **"Override clerk cost" toggle** unlocks editing.
- [ ] **Multi-ticket assignment:** on the pending list, **checkbox-select** several tickets → **"Assign selected to clerk"** → pick a representative → toast reports "assigned N, skipped M". Each ticket keeps its own default clerk cost.
- [ ] **Clerk next-hearing:** completing a **pending Case Information** ticket, the clerk toggles **"Record next hearing date"** and enters the date from court.
- [ ] **Admin generate next-hearing ticket:** on that completed ticket (now with a scheduled date), admin clicks **"Generate next-hearing ticket"** → a new **consumer-owned, unpaid** follow-up ticket is created, prefilled from the parent with the recorded date; toast shows the new batch no. The consumer can then pay it.

---

## Notes / known follow-ups
- **Pricing data:** `clerkBaseCost` resolves from the seeded `pricing-sheet.xlsx`. A value spot-checked at **1500** for Lower-Court Case Files vs **400** in the linked Google Sheet → the xlsx may be **older than the sheet**. If the sheet is the source of truth, re-export it to `apps/api/data/pricing-sheet.xlsx` and re-run `scripts/seed-pricing.ts`.
- Backend was live-smoked on a fresh build (login, payment-settings, pricing `clerkBaseCost`, `assign-bulk`, `next-hearing`, `generate-next-hearing`, list-mapper fields) — all green, plus 148 unit/integration tests pass.
