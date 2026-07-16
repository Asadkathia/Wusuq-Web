# Branding, entry points & unified invoice — design

**Date:** 2026-07-16
**Status:** Approved (pending spec review)
**Scope:** Four independent changes: (1) official logo, (2) portal entry-point/staff-path change, (3) Klarus AI attribution, (4) unified multi-ticket invoice replicating the owner's template.

Parts 1–3 are small and self-contained. Part 4 is a schema-level rework and is the bulk of the work.

---

## Part 1 — Official logo

### Current state

There is no logo component and no brand asset in the repo. The mark is the literal letter `W` in a coloured tile, copy-pasted across **6 files** with three different backgrounds:

| Surface | File | Tile |
|---|---|---|
| Sidebar (both portals) | `apps/web/components/ui/shell-nav.tsx:65-77` | `bg-brand-500` |
| Staff login hero | `apps/web/app/login/page.tsx:94-102` | `bg-ink-900` |
| Staff login mobile | `apps/web/app/login/page.tsx:126-133` | text only |
| Consumer login hero | `apps/web/app/(auth)/consumer/login/page.tsx:92-97` | `bg-brand-500` |
| Signup hero | `apps/web/app/(auth)/consumer/signup/page.tsx:188-192` | `bg-brand-500` |
| Elections (public) | `apps/web/app/elections/page.tsx:73-79` | square, unrounded |

`apps/web/public/` contains only the untouched Next.js starter SVGs. Onboarding has no mark at all.

### Source asset

`/Users/muhammadasad/Downloads/ChatGPT Image Jul 8, 2026, 09_34_26 PM.png`

Verified properties:
- 1024×1024 RGBA. **Alpha is genuine** — background pixels are `alpha=0`; the grey seen in viewers is compositing, not baked in.
- Actual mark occupies bbox **(280,170)–(709,771)** ≈ 429×601. The rest is empty padding and must be cropped.
- Logo purple samples **`#8F2B8E`**; theme `brand-500` is **`#7B248D`**.
- Minor whitish antialias halo (148/1299 semi-transparent samples) — invisible on white, may fringe on `ink-900`.

**Known limitation:** this is a raster PNG. Acceptable for sidebar/favicon; it will soften at high-DPI and in the PDF. If a vector (SVG) original ever surfaces, it should replace this asset — especially for the invoice.

### Design

Extract **one** component, `apps/web/components/ui/wusuq-logo.tsx`, and replace all 6 call sites:

```tsx
<WusuqLogo variant="mark" />      // icon only — sidebar, topbar, favicon
<WusuqLogo variant="full" />      // mark + WUSUQ + LEGAL.QUICKER — login heroes
<WusuqLogo variant="wordmark" />  // text lockup only
```

Assets generated into `apps/web/public/brand/`:
- `wusuq-mark.png` — cropped to bbox, `@1x` / `@2x`
- `wusuq-mark-white.png` — knockout (purple→white) for dark/`ink-900` and the invoice header tile
- `wusuq-full.png` — full lockup, `@1x` / `@2x`
- regenerated multi-size `favicon.ico`

Rendered via `next/image` so Next handles DPI variants.

### Decisions

- **Drop the coloured tile on light surfaces.** The logo is purple-on-transparent; the sidebar tile is filled `bg-brand-500`. Purple-on-purple will not read. Place the mark directly on the white surface; keep a tile only on `ink-900`, using the white knockout.
- **Do not recolour the theme.** `#8F2B8E` vs `brand-500 #7B248D` is imperceptible side-by-side, and `brand-500` is threaded through the entire theme. The logo stays its own asset.

---

## Part 2 — Entry point & staff path

### Decisions

| Item | Decision |
|---|---|
| Default for unauthenticated visitor | `/consumer/login` |
| Staff login path | **`/staff-portal`** (moved from `/login`) |
| Old `/login` | **Permanent redirect** to `/staff-portal`, preserving `?next=` |
| Cross-portal links | Both deleted |

### Changes

1. **`apps/web/app/page.tsx:38`** — an unknown/expired visitor currently falls back to `/login`. Change the fallback to `/consumer/login`. The role-based branches (consumer → `/consumer/dashboard`, representative/staff → `/dashboard`) are unchanged.
2. **Move `app/login/page.tsx` → `app/staff-portal/page.tsx`.**
3. **New `app/login/page.tsx`** — a redirect that **preserves the query string**. `portal-auth-guard.tsx` redirects to `/login?next=…` on a stale JWT; a redirect that drops `?next=` silently breaks the post-login bounce-back.
4. **`components/portal-auth-guard.tsx`** — point directly at `/staff-portal?next=…` rather than relying on the redirect hop.
5. **Delete the cross-portal links:** `app/login/page.tsx:187-193` ("Are you a client? Use the client portal") and `app/(auth)/consumer/login/page.tsx:211-221` ("Staff member? Go to staff login").

### Wrong-portal handling (asymmetry fix)

Today the two forms handle the same situation differently:
- `login/page.tsx:61-67` — silently redirects a consumer to `/consumer/dashboard`.
- `(auth)/consumer/login/page.tsx:62-64` — throws `'This account is for staff. Please use the staff login.'`

**Make both silent redirects.** The error message confirms to an attacker that they have found a valid staff email address.

### Explicitly not claimed

Moving the path is **obscurity, not security**. `/staff-portal` is reachable by anyone who types it; the actual protection is the existing JWT + `PortalAuthGuard` + server-side `PermissionsGuard`, which are unchanged. This change stops advertising staff to consumers. It does not harden anything.

---

## Part 3 — Klarus AI attribution

Rendered on three surfaces:

1. **New shared `apps/web/components/ui/shell-footer.tsx`**, rendered in `app/(portal)/layout.tsx` and `app/(consumer)/layout.tsx` after `<main>`. Both shells are already `flex flex-1 flex-col`, so a `<footer>` sibling drops in without layout work.

   ```
   © 2026 Wusuq · Developed by @2026-Klarus AI
   ```

   This footer also absorbs the `© {year} Wusuq` string currently hardcoded 3×.

2. **Auth pages** — the hero panels of `login`/`staff-portal`, `consumer/login`, `consumer/signup`. These panels are `hidden lg:flex`, so the line **must also be added to the mobile header block** or it will not render below `lg`.

3. **Admin About page** — `app/(portal)/about/page.tsx`, staff-only, showing the attribution plus app version. Reachable from the portal nav.

---

## Part 4 — Unified invoice

### Current state: two disconnected pipelines

| | Consumer invoice | Staff/finance invoice |
|---|---|---|
| Renderer | `apps/api/src/tickets/consumer-invoice.pdf.ts` | `finance.service.ts:436` `buildInvoicePdf` |
| Persisted | No — rendered on the fly | `Invoice` model |
| Number | None — prints `batchNo` | `invoiceNo` |
| Endpoint | `GET /tickets/:id/invoice` | `GET /finance/:ticketId/invoice/download` |
| Clerk cost | Excluded (correct) | **Included** (`:564`) |
| Currency | Correct (`formatMoney`) | **Hardcodes `PKR`** (`:546`) |

They share nothing but pdfkit. For one ticket, consumer and admin download different documents with different numbers and different line items.

Other defects found:
- **Two invoice-number schemes write the same column.** `payments.service.ts:219` writes `INV-${Date.now()}-${ticketId.slice(-6)}`; `finance.service.ts:674` writes `INV-<stamp>-<random>`. Neither is a sequence.
- **"Send Invoice Email" sends no email.** `finance.service.ts:601` sets `sentAt`, flips status, writes an audit log, and stops. `EmailService` exists and is never imported. The button (`finance-board.tsx:862`) misrepresents what it does.
- `Invoice.pdfUrl` is in the schema and never written.
- Finance PDF reads totals from `Invoice` but the breakdown from the **live** `Ticket` — after a charge change, the lines stop summing to the total.
- `ticket-charges-board.tsx:36` declares an `invoice` field it never renders.
- `nav.tsx:73` — `{ label: 'Invoices', href: '#' }`.
- Consumer PDF: `Math.round(i.taxRate * 100)` (`:57`) renders a 17.5% rate as "Tax (18%)" while the amount stays exact.
- Consumer PDF: `align:'right'` with `continued:true` (`:88-89`) aligns within the remaining line box, not a fixed column — money never forms a clean column.

### The template

Source samples:
- `/Users/muhammadasad/Downloads/_Superme Court Paralegal Service_2026-06-28.pdf` (1 line item)
- `/Users/muhammadasad/Downloads/_Lower Court Paralegal Service_2026-06-28 (1).pdf` (**4 line items**)

Both are the same layout. Structure, top to bottom:

1. **Header** — purple tile with white logo (top-left) | right-aligned `WUSUQ` (bold), country, phone, email (link-coloured). Horizontal rule.
2. **Bill-to block** — left: `INVOICE TO:` (small, grey, purple left bar), name (bold), address *(optional — the Lower Court sample has none)*, phone, email. Right: `INVOICE <no>` (large, purple), `Date of Invoice: DD-MM-YYYY` (small, grey).
3. **Line-item table** — grey header row; purple `#` cell per row; description block (title purple, sub-lines grey); alternating row striping.
4. **Totals**, right-aligned — `SUBTOTAL`, `TAX`, `GRAND TOTAL` (purple, larger). Purple rule.
5. **Payment Information** — light-grey block: account-holder name, JazzCash, EasyPaisa, Bank account.
6. **Footer** — `Helping you is our purpose satisfying you is our business.` (bold, centred), then `THANK YOU FOR USING WUSUQ!` (purple, large, centred).

### The architectural finding

**The template is a multi-ticket invoice. The system cannot model one.**

The Lower Court sample bills four *different tickets* on one invoice — the `035210 / 345579 / 009075 / 152020` prefixes are ticket `batchNo`s, across three cities and four courts:

```
1  035210 - Case Files Special Court 2024      (Special Courts - Karachi)
2  345579 - Case Files Lower Court 2025        (Family Court - Islamabad)
3  009075 - Power Of Attorney Lower Court 2026 (Family Court - Rawalpindi)
4  152020 - Case Search Lower Court 2026       (Civil Court - Islamabad)
                                                SUBTOTAL 54950
```

But `schema.prisma:521` is `ticketId String @unique` — one invoice per ticket — and the endpoint is `GET /tickets/:id/invoice`. The template describes a **bill covering many tickets**; the system describes a **receipt for one**. Different objects. This requires a migration, a grouping rule, and new endpoints.

### Decisions

| Question | Decision |
|---|---|
| Grouping | **Admin selects tickets → "Generate invoice"** |
| Attested / non-attested money | **Add columns** — deviate from the sample; itemize rather than hide |
| Tax row | **Show real rate + amount** from the ticket's stamped `taxRate`/`taxAmount` |
| Currency | **Render properly** via shared `formatMoney`; USD → `$150.00` |
| Numbering | **Sequential**, zero-padded 6-digit (`000348`) |
| Company + payment details | **Admin-editable settings** |
| Consumer access | **Invoices exist only once issued**; no button on un-invoiced tickets |

### Data model

`Invoice.ticketId @unique` is removed. An invoice becomes a consumer-owned document with **snapshotted** line items.

```prisma
model Invoice {
  id          String        @id @default(cuid())
  invoiceNo   String        @unique   // sequential, 6-digit zero-padded
  consumerId  String
  currency    Currency                // guard: all items must match
  issueDate   DateTime      @default(now())
  subtotal    Decimal
  taxRate     Decimal                 // snapshotted
  taxAmount   Decimal
  grandTotal  Decimal
  status      InvoiceStatus @default(GENERATED)
  sentAt      DateTime?
  paidAt      DateTime?
  items       InvoiceItem[]
  consumer    User          @relation(fields: [consumerId], references: [id])
  @@index([consumerId, issueDate])
}

model InvoiceItem {
  id          String   @id @default(cuid())
  invoiceId   String
  ticketId    String   @unique   // a ticket lands on at most ONE invoice
  // --- snapshot: frozen at issue, never re-read from Ticket ---
  batchNo     String
  description String              // "Case Files Lower Court 2025"
  courtLine   String              // "(Family Court - Islamabad)"
  caseTitle   String              // "Ali Ijaz vs Mrs Maryam Ali Ijaz - Attested"
  judge       String?
  serviceCost Decimal
  printing    Decimal
  attested    Decimal
  nonAttested Decimal
  delivery    Decimal
  additional  Decimal
  lineTotal   Decimal
  invoice     Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  ticket      Ticket   @relation(fields: [ticketId], references: [id])
}
```

**Snapshotting is the load-bearing decision.** Today's finance PDF reads totals from `Invoice` but the breakdown from the live `Ticket`, so a later charge change makes the lines stop summing to the total. An issued invoice is a legal document and must be frozen. `InvoiceItem.ticketId @unique` is simultaneously the natural guard against double-billing a ticket.

`serviceCost` on the line = `serviceCost + additionalServiceCost` (matches the sample's single "Service Cost" column and the `computeTicketTotal` service base). **`clerkCost` is never included** — internal only, per `tickets.service.ts:1808`.

### Numbering

A **Postgres sequence**, not a read-then-write counter (which races under concurrent generation). Rendered zero-padded to 6 digits. Both existing `INV-` generators are deleted — `payments.service.ts:215-235` stops upserting an `Invoice` on payment.

### Guards (reject loudly at generation)

- Mixed currencies in the selection — PKR and USD cannot sum to one `GRAND TOTAL`.
- A ticket already present on another invoice (enforced by `InvoiceItem.ticketId @unique`, checked up-front for a clean error).
- Tickets belonging to more than one consumer.
- Empty selection.
- Archived tickets.

### Endpoints

| Endpoint | Perm | Notes |
|---|---|---|
| `POST /invoices` | `finance.write` (staff) | Body: `{ ticketIds: string[] }`. Runs guards + sequence + snapshot in one transaction. |
| `GET /invoices` | `finance.read` staff → all; consumer → own | Consumer list scoped to `actor.sub`. |
| `GET /invoices/:id/download` | staff-or-owning-consumer | Same `isStaffRole`-or-owner check as WS-B's invoice endpoint. A **representative must not** be able to pull a consumer's invoice (3.1-class IDOR). 404 not 403. |

**Retired:** `GET /tickets/:id/invoice`, `buildConsumerInvoice`, `consumer-invoice.pdf.ts`, `finance.service.ts buildInvoicePdf`, `GET /finance/:ticketId/invoice/download`.

### Renderer

One `apps/api/src/invoices/invoice.pdf.ts`, pdfkit, A4. Table columns:

```
# | DESCRIPTION | Service | Printing | Attested | Non-Att | Delivery | Additional | Total
```

**Seven money columns is tight on A4 portrait.** Mitigations in preference order: shrink the description column and reduce the money font; if that fails legibility, switch to landscape. The layout is to be reviewed against the sample before the work is called done.

Fixes carried in by construction: fixed-x money columns (no `continued:true` alignment), real page-overflow handling with a repeated table header, exact tax rate in the label (no `Math.round`), currency via shared `formatMoney`.

### Settings

New admin-editable company settings (following the existing `AppSetting` / `tax.rate` pattern): `company.name`, `company.country`, `company.phone`, `company.email`.

The **Payment Information block reads the existing `PaymentSettings`** singleton — bank / JazzCash / EasyPaisa are already there and already admin-editable. Only the account-holder name may need adding.

### Frontend

- **Staff:** ticket/finance board gains multi-select → "Generate invoice". New `/invoices` list + detail with download.
- **Consumer:** new `/consumer/invoices` list. **This finally gives `nav.tsx:73`'s dead `Invoices` item (`href:'#'`) a real destination.**
- Ticket detail's "Download invoice" renders **only when the ticket is on an issued invoice**; otherwise no button.
- `consumer-ticket-board.tsx:151-176` `downloadTicketInvoice` currently swallows failures with `console.error` (`:172`) — **add a user-visible error**.
- `finance-board.tsx:274` duplicates the base64→blob logic instead of reusing the helper — consolidate into one shared helper.

---

## Out of scope

- **Email sending.** Wiring `EmailService` is deferred (owner decision 2026-07-16). The **"Send Invoice Email" button is hidden** in this work rather than left misrepresenting itself (`finance-board.tsx:862`).

  The backend half goes with it: `finance.service.ts:601` `sendInvoice` sets `sentAt`, flips status to `SENT`, and writes an `INVOICE_SENT` audit log while sending nothing. Hiding the button but keeping the endpoint live leaves an audit trail that claims invoices were sent that never were — **remove the endpoint too**, and drop `Invoice.sentAt` unless a real sender lands.
- **`Invoice.pdfUrl` / stored PDFs.** Rendering stays on-demand from the snapshot, which is deterministic. The unused column is dropped.
- **Tax registration (NTN/STRN).** The owner's template has none. Flagged for awareness: the document prints a tax line with a rate but no registration identity, which may matter for a PK tax invoice. Not actioned.
- **Theme recolour** to the logo's `#8F2B8E`.
- **Template typos.** The sample reads "Superme Court" and renders `Case Judge ()` with empty parens when no judge exists. Both are treated as defects: descriptions derive from real court names, and the judge line is omitted when absent.

## Testing

- **Unit (shared/pure):** invoice line-item assembly from tickets; subtotal/tax/grand-total math; `formatMoney` per currency; the padded sequence formatter.
- **API:** each guard rejects (mixed currency, already-invoiced, multi-consumer, empty, archived); snapshot freezes (mutate the ticket after issue → PDF unchanged); sequence is gapless and concurrency-safe; **`GET /invoices/:id/download` rejects a representative and a non-owning consumer with 404** (regression guard for the 3.1-class IDOR); clerk cost never appears in the payload.
- **Web:** consumer board hides the download on an un-invoiced ticket; source-level guard test that clerk cost/margin never render in `ConsumerTicketDetail` (mirroring `consumer-ticket-board.test.ts`).

## Migration notes

Per CLAUDE.md, `prisma migrate dev` is **unusable on the Neon DB** (`20260523090000_unified_ticket_status` was edited after apply). Apply non-destructively via `prisma db execute` + `migrate resolve --applied`, as with the D1/D3/E migrations.

**No `Invoice` backfill is needed — there is nothing to back up.** Verified against Neon on 2026-07-16:

```
tickets: 8   invoices: 0   payments: 0   walletTransactions: 3   users: 65
```

The `Invoice` table has **never been written to** (0 rows), so reshaping it destroys no data. The owner's two sample PDFs were produced outside this system.

The migration is therefore **purely additive**: reshape the empty `Invoice`, add `InvoiceItem`, add the sequence. The 8 existing tickets are simply not on any invoice yet — exactly the state the new model expects. **No ticket data is cleared** (owner offered; declined as unnecessary — the tickets carry real consumer emails, Rs 700 of recorded payments, and one ASSIGNED ticket possibly mid-work, and the invoice rework does not require touching them).
