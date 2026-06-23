# Country-Based Pricing (PKR / USD) — Design

**Date:** 2026-06-23
**Status:** Approved design, pending implementation plan
**Author:** Brainstormed with owner

## Problem

Wusuq currently prices and bills every customer in PKR. The owner wants
**country-based pricing**: Pakistan-based customers keep the existing PKR rates;
all other countries are billed in **USD** off a **separate, manually-maintained
USD price list** (provided as two images, transcribed in Appendix A).

The customer's billing region is derived from the **phone number dial code**
captured at signup/profile (`+92` → Pakistan → PKR; any other dial code → USD).
Address is informational only (the geo tree is Pakistan-only and cannot carry a
country signal).

## Decisions (owner-confirmed)

1. **USD source = a separate manual price list**, not FX conversion of PKR rates.
2. **Phone dial code wins** for currency: `+92` → PKR, else USD. Address is informational.
3. **Per-currency wallet**: a USD customer's wallet credit, dues, top-ups and FIFO
   settlement are all in USD; a PKR customer's stay in PKR. One customer = one
   currency, so no cross-currency math ever occurs.
4. **USD prices are all-inclusive flat** — the cell price IS the total. No PDF /
   delivery / attestation / "State vs" title / set-type / per-year / per-city
   add-ons, and **no clerk phase-2 remainder**. USD Case Files is therefore a
   single `ONE_TIME` charge.
5. **USD Case Search** is a flat price per court tier (no per-year, no per-city
   multiplier).
6. **Non-judicial services, Case Filing, and Power of Attorney are NOT offered**
   to USD customers (they are blank/"–" on the USD list). The wizard hides them
   when the customer is USD.
7. **No tax and no promo codes for USD customers** — the USD list price is final.
8. **Currency locks once the account is active.** Derived at signup from the
   phone dial code; re-derived on a later phone/country change ONLY if the user
   has zero tickets and zero wallet balance. Once there is activity, currency is
   locked (a phone edit updates contact info, not billing currency).
9. **Phased rollout** — one spec, implementation split into phases A–D.

## Architecture

### Currency model

- `User.currency` (`'PKR' | 'USD'`, column already exists, default `'PKR'`) is the
  **single source of truth** for a customer's billing currency.
- A new shared helper is the only place currency is derived:

  ```ts
  // packages/shared/src/index.ts
  export function deriveCurrency(input: { phone?: string | null; country?: string | null }): 'PKR' | 'USD'
  ```

  Rule: if `phone` is present → `phone.replace(/\s/g,'').startsWith('+92') ? 'PKR' : 'USD'`.
  Else if `country` (ISO) present → `country.toUpperCase() === 'PK' ? 'PKR' : 'USD'`.
  Else → `'PKR'` (default).

  Used by: signup, OTP-verify (user creation), and profile update.
- `User.country` (ISO, column already exists, currently unpopulated) is persisted
  from the signup/profile country picker for **display only**. Currency math never
  reads it except as the fallback above.
- `Ticket.currency` (new column) is **snapshotted from `User.currency` at intake**,
  guaranteeing quote = charge and immunity to a later phone edit.

### Currency-lock rule (decision 8)

On profile/phone update, re-derive `User.currency` from the new phone **only if**
the user has zero non-archived tickets AND a zero wallet balance. Otherwise keep
the existing currency and surface a note ("billing region is locked; contact
support to change"). This makes mixed PKR/USD ledgers impossible.

### Data model changes

| Model | Change |
|---|---|
| `PricingRule` | **add `currency String @default("PKR")`**; unique key becomes `(currency, region, courtLevel, flow, yearBand, setType)`. Existing rows backfilled `'PKR'`. |
| `Ticket` | **add `currency String @default("PKR")`**; existing rows backfilled `'PKR'`. |
| `User` | `currency` already exists — backfill from existing `phone` dial codes. `country` already exists — populated going forward. |
| `WalletTransaction`, `Payment` | `currency` already exists — reused; written from `User.currency` / `Ticket.currency`. |

**Why a `currency` column on `PricingRule` (not a separate table or a code constant):**
PKR and USD rules share identical dimensions, so one table + one resolver + one
admin path is the most robust and least-duplicated design. A separate
`PricingRuleUsd` table would fork the resolver/availability/admin code; a
code-only USD constant would make USD rates un-editable via admin and diverge
from the DB-driven PKR model.

### Pricing resolver

- `ResolvePricingDto` and `buildPricingResolveInput(flow, payload)` gain a
  `currency` field. Every existing PKR query gains a `currency = 'PKR'` filter so
  PKR resolution is unchanged and never matches a USD row.
- For `currency === 'USD'` the resolver **short-circuits to a flat lookup**:
  match the rule by `(currency='USD', region, courtLevel, flow, yearBand)`, then
  `basePrice = base = serviceCost = total = cell`, every surcharge field `= 0`,
  `availability = true`, `paymentModel = ONE_TIME`. None of the PKR surcharge
  computation (PDF, delivery, attestation, title, age, search-both, per-year,
  city multiplier, bundle base) runs.
- USD **Case Files** year-band lookup uses the same `yearBand` keys as PKR:
  `pending` (the "Case Files" row), `current` ("Case Record — Current Year"),
  and `y2025 … y2016_back` (the image-2 ladder).
- USD **Case Info** = flat per `(region, courtLevel)`, `yearBand = null`,
  `setType = null` (no document-bundle variance).
- USD **Case Search** = flat per `(region, courtLevel)`, `yearBand = null`.
- Flows with no USD rule (Case Filing, PoA, all non-judicial) simply fail to
  match → `createIntakeTicket`'s existing loud-fail rejects them; the wizard also
  hides them for USD customers.

### Payment & wallet

- `paymentModelFor(flow, currency)` → **USD always returns `ONE_TIME`**; PKR keeps
  `judicial_case_files` + the three non-judicial copies as `SPLIT`.
- **USD Case Files is billed once but still physically fulfilled.** The clerk
  lifecycle (accept assignment → clerk receipt → dispatch → admin "confirm
  delivered") and the `deliveryStatus` sub-state machine are retained; only the
  phase-2 *charge/remainder* is removed. Clerk cost stays internal-only as today.
- Wallet is **single-currency per user**, denominated in `User.currency`. Credit,
  dues (`Σ max(0, totalAmount − amountPaid)` over the user's non-DELIVERED,
  positively-priced tickets), top-ups, and FIFO auto-settlement all operate in
  that one currency. `WalletTransaction.currency` and all displayed balances
  follow `User.currency`.
- **No tax, no promo for USD**: `taxRate = 0` is passed to `computeTicketTotal`
  for USD tickets (so `serviceCost === total`); the wizard hides the promo input
  and tax line; `PromosService` rejects redemption against a USD ticket.

### Frontend

- New shared `formatMoney(amount, currency)`:
  USD → `Intl.NumberFormat('en-US', { style:'currency', currency:'USD' })` (`$`);
  PKR → `Intl.NumberFormat('en-PK', { style:'currency', currency:'PKR' })` (`Rs`).
  Replaces the ~12 hardcoded `formatPKR` / `Intl.NumberFormat('en-PK')` /
  `currency:'PKR'` sites; each call passes the relevant ticket/user currency.
- Intake wizard:
  - Reads the consumer's currency (from the wallet/me payload or the stored user).
  - **USD service menu = Case Files, Case Info, Case Search only.** Case Filing,
    PoA, and all non-judicial flows are hidden for USD customers.
  - Checkout preview passes `currency` to `resolve`; for USD it renders a single
    flat `$` total with no surcharge/tax lines and no promo box.
  - **Price-bearing add-on inputs are hidden for USD** because they don't change
    the all-inclusive flat price: the Set Type picker (attested/non-attested) and
    the "PDF before dispatch" surcharge toggle. Case Search's per-city / search-
    both inputs likewise have no price effect for USD. (Fulfilment-relevant
    fields like delivery address are still captured.)
  - The instant year-driven rate patch (`computeCaseSearchBase` /
    `computeDecidedAgeSurcharge`, PKR-only) is disabled for USD (flat lookup).
- Profile / onboarding: persist the country picker into `User.country`; show the
  derived currency; the header/wallet currency chip reflects `User.currency`.

### Seeding

- The USD rates (Appendix A) are transcribed into a constant/JSON under
  `apps/api/data/` and inserted **inside the existing `seed-pricing.ts`
  transaction** (which already wipes + rebuilds `PricingRule`), so USD rows
  survive a re-seed. Add a USD row-count safety floor mirroring the existing PKR
  floor. A USD smoke test (a few worked examples) asserts matched + available.

### Migrations / backfill

- Prisma migration: add `PricingRule.currency` + new unique key; add
  `Ticket.currency`; backfill both to `'PKR'`. Backfill `User.currency` /
  `User.country` from existing `phone` dial codes (default PKR where phone is
  null or `+92`).

## Phased implementation

- **Phase A — Foundation.** `deriveCurrency` shared helper; persist
  `User.country`/`currency` at signup/OTP/profile with the lock rule; Prisma
  migration + backfill for `PricingRule.currency`, `Ticket.currency`, and the
  new unique key.
- **Phase B — USD resolver + seed.** `currency` on `ResolvePricingDto` /
  `buildPricingResolveInput`; USD short-circuit in `resolve` / `availabilityFor`;
  PKR queries filtered to `currency='PKR'`; USD data constant + `seed-pricing.ts`
  insertion + USD smoke test.
- **Phase C — Payment & wallet.** `paymentModelFor(flow, currency)`; stamp
  `Ticket.currency` at intake; USD = ONE_TIME with retained physical fulfilment;
  wallet/dues/settlement read `User.currency`; tax=0 and promo-block for USD.
- **Phase D — Frontend.** `formatMoney`; replace PKR-hardcoded surfaces; wizard
  service-menu gating + USD checkout (no tax/promo/surcharge lines); profile
  country persistence + currency chip.

## Out of scope

- OTP/SMS for non-PK phone numbers (SMS is not wired; non-PK customers sign up via
  email/password, which already accepts any phone string). The PK-only OTP regex
  is a pre-existing limitation, untouched here.
- FX conversion (owner chose a manual USD list).
- USD pricing for non-judicial services, Case Filing, and Power of Attorney
  (hidden for USD customers).

## Testing

- Unit: `deriveCurrency` truth table; resolver USD short-circuit per flow/tier/
  region/yearBand; `paymentModelFor` currency matrix; currency-lock guard.
- Seed smoke: USD worked examples (e.g. Punjab Lower Case Files 2024 = $50,
  other-than-Punjab Special Case Info = $20) assert matched + available + total.
- E2E (mock-API pattern): USD consumer sees `$`, restricted service menu, no
  tax/promo lines, flat total. (Consumer-checkout E2E may be `fixme` pending the
  shared intake-wizard driver, consistent with existing gaps.)

## Appendix A — USD price list (transcribed from owner images, 2026-06-14)

Court-tier columns: **Lower Court / Special Court / High Court / Supreme Court**.
All amounts in USD. "–" = not offered.

### Base rates

| Service (flow) | Region | Lower | Special | High | Supreme |
|---|---|---|---|---|---|
| Case Files — `pending` (`judicial_case_files`) | Punjab | 15 | 25 | 20 | 20 |
| Case Files — `pending` | other | 20 | 30 | 25 | 25 |
| Case Info (`judicial_case_information`) | Punjab | 7 | 12 | 10 | 10 |
| Case Info | other | 12 | 20 | 15 | 15 |
| Case Files — `current` ("Case Record Current Year") | Punjab | 25 | 35 | 30 | 30 |
| Case Files — `current` | other | 30 | 40 | 35 | 35 |
| Case Search (`judicial_case_search`) | Punjab | 20\* | 20 | 20 | 20 |
| Case Search | other | 20 | 20 | 20 | 20 |
| Case Filing (`judicial_case_filing`) | both | – | – | – | – |
| Power of Attorney (`judicial_power_of_attorney`) | both | – | – | – | – |
| Non-judicial (FIR / Registry-Deed / Criminal Record) | both | – | – | – | – |

\* The "20\*" asterisk on Punjab Lower Court Case Search is treated as a flat $20
(no per-year/per-city multiplier, per decision 5).

### Case Files decided-year bands (`judicial_case_files`)

| yearBand | Region | Lower | Special | High | Supreme |
|---|---|---|---|---|---|
| `y2025` (2025) | Punjab | 35 | 45 | 40 | 40 |
| `y2025` | other | 45 | 55 | 45 | 45 |
| `y2024_2023` (2024–2023) | Punjab | 50 | 60 | 50 | 50 |
| `y2024_2023` | other | 60 | 70 | 60 | 60 |
| `y2022_2020` (2022–2020) | Punjab | 65 | 70 | 65 | 65 |
| `y2022_2020` | other | 75 | 80 | 75 | 75 |
| `y2019_2017` (2019–2017) | Punjab | 80 | 85 | 80 | 80 |
| `y2019_2017` | other | 90 | 95 | 90 | 90 |
| `y2016_back` (2016 & backward) | Punjab | 95 | 100 | 95 | 95 |
| `y2016_back` | other | 105 | 110 | 105 | 105 |

Source images: `WhatsApp Image 2026-06-14 at 19.27.47.jpeg` (base rates) and
`19.27.49.jpeg` (Case Record year bands).
