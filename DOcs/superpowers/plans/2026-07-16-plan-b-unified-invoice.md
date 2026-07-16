# Plan B — Unified Multi-Ticket Invoice

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace two disconnected invoice pipelines with one: an admin selects N tickets for a consumer, the system issues a sequentially-numbered invoice with frozen line items, and both staff and that consumer download the same branded PDF replicating the owner's template.

**Architecture:** A new `apps/api/src/invoices/` NestJS module owns everything. `Invoice` is reshaped from one-per-ticket to one-per-consumer-with-many-`InvoiceItem`s, each item a **snapshot** of the ticket's charges at issue time. A Postgres sequence supplies gapless numbers. One pdfkit renderer replaces both existing ones; the old endpoints are deleted.

**Tech Stack:** NestJS 11, Prisma 6.5 (Postgres/Neon), pdfkit ^0.18, Jest (ESM, `rootDir: src`, `testRegex: \.spec\.ts$`), Next.js 16 web.

Spec: `DOcs/superpowers/specs/2026-07-16-branding-entry-invoice-design.md` (Part 4). Depends on Plan A only for the brand asset used in the PDF header (Task 5) — Tasks 1–4 can run before Plan A lands.

## Global Constraints

- **`clerkCost` NEVER appears on an invoice.** Internal only (`tickets.service.ts:1808`). The retired `finance.service.ts:564` leaked it — do not carry that over.
- **`POST /invoices` is `@RequirePermissions('finance.write')` — super-admin only** (owner decision 2026-07-16; `finance.write` is held by no other role). The **read** paths use `tickets.read` + in-service role scoping, because consumers do not hold `finance.read`.
- **There is NO `Currency` enum in Prisma.** `Ticket.currency` is `String @default("PKR")`. `Invoice.currency` must match that shape. The shared TS type is `Currency = 'PKR' | 'USD'`.
- **Money math goes through `computeTicketTotal` / `formatMoney` / `round2` from `@wusuq/shared`.** Never hand-roll (CLAUDE.md).
- **Tax applies to the service base only** (`serviceCost + additionalServiceCost`), not the whole bill. `TicketMoneyResult.taxableBase` already means this.
- **Migrations: `prisma migrate dev` is UNUSABLE on Neon.** Apply via `prisma db execute` + `prisma migrate resolve --applied`. Stamp strictly later than `20260707020000`.
- **Phase-2 charge lines are gated on `remainderFinalizedAt`** in the existing consumer breakdown. An invoice snapshots whatever the charges are at issue; see Task 3.
- API tests: `pnpm --filter @wusuq/api test`. Typecheck: `pnpm --filter @wusuq/api typecheck`. Baseline is **495 API tests + 61 web tests green** — never finish below that.
- Commit after every task. Do NOT push.

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/prisma/schema.prisma` | `Invoice` reshape + `InvoiceItem` (modify) |
| `apps/api/prisma/migrations/20260716000000_unified_invoice/migration.sql` | The migration (create) |
| `apps/api/src/invoices/invoice-lines.ts` | **Pure**: ticket → line item, totals. No Prisma, no IO. (create) |
| `apps/api/src/invoices/invoice-lines.spec.ts` | Unit tests for the above (create) |
| `apps/api/src/invoices/invoice.pdf.ts` | **Pure-ish**: view model → PDF buffer (create) |
| `apps/api/src/invoices/invoices.service.ts` | Guards, sequence, transaction, fetch (create) |
| `apps/api/src/invoices/invoices.controller.ts` | Routes + auth (create) |
| `apps/api/src/invoices/invoices.module.ts` | Wiring (create) |
| `apps/api/src/invoices/dto/create-invoice.dto.ts` | `{ ticketIds: string[] }` (create) |
| `apps/api/src/invoices/invoices.service.spec.ts` | Guard + snapshot + IDOR tests (create) |
| `apps/api/src/settings/settings.service.ts` | + company settings (modify) |

**Deleted by Task 7:** `apps/api/src/tickets/consumer-invoice.pdf.ts`, `consumer-invoice.spec.ts`, `consumer-invoice-endpoint.spec.ts`, `TicketsService.buildConsumerInvoice`, the `GET /tickets/:id/invoice` route, `FinanceService.buildInvoicePdf` / `generateInvoice` / `sendInvoice` / `generateInvoiceNo`, the finance invoice routes, and the `payments.service.ts:215-235` Invoice upsert.

---

### Task 1: Schema + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (the `Invoice` model at ~519-533)
- Create: `apps/api/prisma/migrations/20260716000000_unified_invoice/migration.sql`

**Interfaces:**
- Produces: Prisma models `Invoice`, `InvoiceItem`; sequence `invoice_no_seq`. Consumed by Tasks 3–8.

**Context you need.** Verified against Neon on 2026-07-16: `invoices: 0` — **the `Invoice` table has never been written to.** So this reshape destroys nothing and needs no backfill. `Ticket.invoice Invoice?` (a back-relation) exists on the `Ticket` model and must be replaced with `invoiceItem InvoiceItem?`.

`InvoiceStatus` enum already exists: `GENERATED | SENT | PARTIALLY_PAID | PAID`. Drop `SENT` — Task 7 removes the send path entirely, and a status nothing can reach is dead.

- [ ] **Step 1: Edit the schema**

Replace the `Invoice` model in `apps/api/prisma/schema.prisma` with:

```prisma
model Invoice {
  id         String        @id @default(cuid())
  /// Sequential, zero-padded 6 digits (e.g. "000348"). From invoice_no_seq.
  invoiceNo  String        @unique
  consumerId String
  /// Snapshotted from the tickets' currency. All items must agree — an invoice
  /// cannot sum PKR and USD. Mirrors Ticket.currency (String, not an enum).
  currency   String        @default("PKR")
  issueDate  DateTime      @default(now())
  subtotal   Decimal
  /// Snapshotted so a later tax-rate change never rewrites an issued invoice.
  taxRate    Decimal       @default(0)
  taxAmount  Decimal       @default(0)
  grandTotal Decimal
  status     InvoiceStatus @default(GENERATED)
  paidAt     DateTime?
  createdAt  DateTime      @default(now())
  updatedAt  DateTime      @updatedAt
  consumer   User          @relation(fields: [consumerId], references: [id])
  items      InvoiceItem[]

  @@index([consumerId, issueDate])
}

/// One billed ticket on an invoice. Every money field is a SNAPSHOT frozen at
/// issue: an issued invoice is a legal document and must not change when the
/// underlying ticket's charges are later edited. (The retired finance PDF read
/// totals from Invoice but the breakdown from the live Ticket, so its lines
/// stopped summing to its total after any charge edit.)
model InvoiceItem {
  id          String  @id @default(cuid())
  invoiceId   String
  /// A ticket lands on at most ONE invoice. This unique IS the double-bill guard.
  ticketId    String  @unique
  position    Int
  batchNo     String
  description String
  courtLine   String?
  caseTitle   String?
  judge       String?
  serviceCost Decimal @default(0)
  printing    Decimal @default(0)
  attested    Decimal @default(0)
  nonAttested Decimal @default(0)
  delivery    Decimal @default(0)
  additional  Decimal @default(0)
  lineTotal   Decimal @default(0)
  invoice     Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  ticket      Ticket  @relation(fields: [ticketId], references: [id])

  @@index([invoiceId, position])
}
```

Change the `InvoiceStatus` enum (line ~84) to:

```prisma
enum InvoiceStatus {
  GENERATED
  PARTIALLY_PAID
  PAID
}
```

In the `Ticket` model, replace `invoice Invoice?` with:

```prisma
  invoiceItem     InvoiceItem?
```

In the `User` model, add the back-relation beside the other relations:

```prisma
  invoices        Invoice[]
```

- [ ] **Step 2: Write the migration SQL**

Create `apps/api/prisma/migrations/20260716000000_unified_invoice/migration.sql`:

```sql
-- Unified multi-ticket invoice (spec 2026-07-16, Part 4).
-- Safe to drop-and-recreate: verified 0 rows in "Invoice" on 2026-07-16.

DROP TABLE IF EXISTS "Invoice" CASCADE;

CREATE SEQUENCE IF NOT EXISTS invoice_no_seq START 1;

CREATE TABLE "Invoice" (
    "id"         TEXT NOT NULL,
    "invoiceNo"  TEXT NOT NULL,
    "consumerId" TEXT NOT NULL,
    "currency"   TEXT NOT NULL DEFAULT 'PKR',
    "issueDate"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal"   DECIMAL(65,30) NOT NULL,
    "taxRate"    DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxAmount"  DECIMAL(65,30) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(65,30) NOT NULL,
    "status"     "InvoiceStatus" NOT NULL DEFAULT 'GENERATED',
    "paidAt"     TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceItem" (
    "id"          TEXT NOT NULL,
    "invoiceId"   TEXT NOT NULL,
    "ticketId"    TEXT NOT NULL,
    "position"    INTEGER NOT NULL,
    "batchNo"     TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "courtLine"   TEXT,
    "caseTitle"   TEXT,
    "judge"       TEXT,
    "serviceCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "printing"    DECIMAL(65,30) NOT NULL DEFAULT 0,
    "attested"    DECIMAL(65,30) NOT NULL DEFAULT 0,
    "nonAttested" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "delivery"    DECIMAL(65,30) NOT NULL DEFAULT 0,
    "additional"  DECIMAL(65,30) NOT NULL DEFAULT 0,
    "lineTotal"   DECIMAL(65,30) NOT NULL DEFAULT 0,
    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invoice_invoiceNo_key" ON "Invoice"("invoiceNo");
CREATE INDEX "Invoice_consumerId_issueDate_idx" ON "Invoice"("consumerId", "issueDate");
CREATE UNIQUE INDEX "InvoiceItem_ticketId_key" ON "InvoiceItem"("ticketId");
CREATE INDEX "InvoiceItem_invoiceId_position_idx" ON "InvoiceItem"("invoiceId", "position");

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_consumerId_fkey"
    FOREIGN KEY ("consumerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SENT is unreachable now that the (never-implemented) send-email path is gone.
ALTER TYPE "InvoiceStatus" RENAME TO "InvoiceStatus_old";
CREATE TYPE "InvoiceStatus" AS ENUM ('GENERATED', 'PARTIALLY_PAID', 'PAID');
ALTER TABLE "Invoice" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Invoice" ALTER COLUMN "status" TYPE "InvoiceStatus"
    USING ("status"::text::"InvoiceStatus");
ALTER TABLE "Invoice" ALTER COLUMN "status" SET DEFAULT 'GENERATED';
DROP TYPE "InvoiceStatus_old";
```

- [ ] **Step 3: Regenerate the client and typecheck**

```bash
cd apps/api && pnpm prisma:generate && pnpm typecheck
```
Expected: generate succeeds. **Typecheck WILL fail** — `finance.service.ts` and `payments.service.ts` still reference `invoice.ticketId` / `dueAmount` / `sentAt`. That is expected; Task 7 removes them. Record the errors and move on.

- [ ] **Step 4: Do NOT apply to Neon yet**

Applying is deferred to Task 9, after the code compiles. **Do not run `prisma migrate dev` — it is unusable on this DB.**

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma
git commit -m "feat(api): reshape Invoice to multi-ticket + add InvoiceItem snapshot"
```

---

### Task 2: Pure line-item assembly

**Files:**
- Create: `apps/api/src/invoices/invoice-lines.ts`
- Test: `apps/api/src/invoices/invoice-lines.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface InvoiceTicketInput {
    id: string; batchNo: string; currency: string;
    intakeFlow?: string | null; formPayload?: unknown;
    serviceCost: number; additionalServiceCost: number;
    printingCharges: number; attestedCharges: number; nonAttestedCharges: number;
    deliveryCharges: number; additionalCharges: number;
    discountPrice: number; promoDiscount: number;
    service?: { name?: string | null } | null;
  }
  export interface InvoiceLine {
    position: number; ticketId: string; batchNo: string; description: string;
    courtLine: string | null; caseTitle: string | null; judge: string | null;
    serviceCost: number; printing: number; attested: number;
    nonAttested: number; delivery: number; additional: number; lineTotal: number;
  }
  export function buildInvoiceLines(tickets: InvoiceTicketInput[]): InvoiceLine[];
  export function summariseInvoice(
    lines: InvoiceLine[],
    opts: { taxRate: number; discountTotal: number },
  ): { subtotal: number; taxableBase: number; taxAmount: number; grandTotal: number };
  export function formatInvoiceNo(seq: number): string;   // 348 -> "000348"
  ```
  Consumed by Tasks 3 and 5.

**Context you need.** From the owner's template, a line's description block is three parts:

```
035210 - Case Files Lower Court 2025           <- batchNo - description
(Family Court - Islamabad)                     <- courtLine
Case Title (Ali Ijaz vs Mrs Maryam Ali Ijaz - Attested )   <- caseTitle
Case Judge (Amina Asif Butt)                   <- judge
```

The sample renders `Case Judge ()` with empty parens when there's no judge. **That's a defect — omit the line when there is no judge** (spec, Out of scope).

`formPayload` keys (from the intake wizard, aliased server-side): `case_title`, `court_name`/`select_court`, `city`, `judge_name`. Read defensively — legacy tickets may lack any of them.

**Money:** `serviceCost` on a line is `serviceCost + additionalServiceCost` (matches the template's single "Service Cost" column and the `computeTicketTotal` service base). `lineTotal` is the sum of the six money columns — **it does not include tax or discount**, which are invoice-level.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/invoices/invoice-lines.spec.ts`:

```ts
import {
  buildInvoiceLines,
  summariseInvoice,
  formatInvoiceNo,
  type InvoiceTicketInput,
} from './invoice-lines';

const base: InvoiceTicketInput = {
  id: 't1',
  batchNo: '035210',
  currency: 'PKR',
  intakeFlow: 'judicial_case_files',
  formPayload: {
    case_title: 'Ali Ijaz vs Mrs Maryam Ali Ijaz',
    court_name: 'Family Court',
    city: 'Islamabad',
    judge_name: 'Amina Asif Butt',
  },
  serviceCost: 2500,
  additionalServiceCost: 0,
  printingCharges: 2450,
  attestedCharges: 0,
  nonAttestedCharges: 0,
  deliveryCharges: 0,
  additionalCharges: 0,
  discountPrice: 0,
  promoDiscount: 0,
  service: { name: 'Case Files Lower Court 2025' },
};

describe('formatInvoiceNo', () => {
  it('zero-pads to 6 digits', () => {
    expect(formatInvoiceNo(1)).toBe('000001');
    expect(formatInvoiceNo(348)).toBe('000348');
    expect(formatInvoiceNo(364692)).toBe('364692');
  });

  it('does not truncate past 6 digits', () => {
    expect(formatInvoiceNo(1234567)).toBe('1234567');
  });
});

describe('buildInvoiceLines', () => {
  it('numbers positions from 1', () => {
    const lines = buildInvoiceLines([base, { ...base, id: 't2', batchNo: '345579' }]);
    expect(lines.map((l) => l.position)).toEqual([1, 2]);
  });

  it('builds the template description block', () => {
    const [l] = buildInvoiceLines([base]);
    expect(l.description).toBe('Case Files Lower Court 2025');
    expect(l.courtLine).toBe('(Family Court - Islamabad)');
    expect(l.caseTitle).toBe('Ali Ijaz vs Mrs Maryam Ali Ijaz');
    expect(l.judge).toBe('Amina Asif Butt');
  });

  it('folds additionalServiceCost into the Service Cost column', () => {
    const [l] = buildInvoiceLines([{ ...base, additionalServiceCost: 500 }]);
    expect(l.serviceCost).toBe(3000);
  });

  it('sums lineTotal across the six money columns, excluding tax/discount', () => {
    const [l] = buildInvoiceLines([
      { ...base, attestedCharges: 1000, deliveryCharges: 1200, additionalCharges: 300, discountPrice: 9999 },
    ]);
    // 2500 service + 2450 printing + 1000 attested + 1200 delivery + 300 additional
    expect(l.lineTotal).toBe(7450);
  });

  it('omits the judge when absent (never renders empty parens)', () => {
    const [l] = buildInvoiceLines([{ ...base, formPayload: { case_title: 'X' } }]);
    expect(l.judge).toBeNull();
  });

  it('survives a legacy ticket with no formPayload', () => {
    const [l] = buildInvoiceLines([{ ...base, formPayload: null, service: null }]);
    expect(l.courtLine).toBeNull();
    expect(l.caseTitle).toBeNull();
    expect(l.description).toBe('Ticket 035210');
  });
});

describe('summariseInvoice', () => {
  const lines = buildInvoiceLines([base]);  // lineTotal 4950, service 2500

  it('sums subtotal from line totals', () => {
    expect(summariseInvoice(lines, { taxRate: 0, discountTotal: 0 }).subtotal).toBe(4950);
  });

  it('taxes the SERVICE base only, not the whole bill', () => {
    const s = summariseInvoice(lines, { taxRate: 0.17, discountTotal: 0 });
    expect(s.taxableBase).toBe(2500);          // service only, NOT 4950
    expect(s.taxAmount).toBe(425);             // 2500 * 0.17
    expect(s.grandTotal).toBe(5375);           // 4950 + 425
  });

  it('applies discount before tax and to the grand total', () => {
    const s = summariseInvoice(lines, { taxRate: 0.17, discountTotal: 500 });
    expect(s.taxableBase).toBe(2000);          // 2500 - 500
    expect(s.taxAmount).toBe(340);
    expect(s.grandTotal).toBe(4790);           // (4950 - 500) + 340
  });

  it('never goes negative on an over-large discount', () => {
    const s = summariseInvoice(lines, { taxRate: 0.17, discountTotal: 99999 });
    expect(s.taxableBase).toBe(0);
    expect(s.taxAmount).toBe(0);
    expect(s.grandTotal).toBe(0);
  });

  it('sums a 4-ticket invoice like the owner sample', () => {
    const many = buildInvoiceLines([
      { ...base, id: 'a', serviceCost: 10500, printingCharges: 24500, deliveryCharges: 4500, additionalCharges: 7000 },
      { ...base, id: 'b', serviceCost: 2500, printingCharges: 2450 },
      { ...base, id: 'c', serviceCost: 1500, printingCharges: 0 },
      { ...base, id: 'd', serviceCost: 2000, printingCharges: 0 },
    ]);
    expect(summariseInvoice(many, { taxRate: 0, discountTotal: 0 }).subtotal).toBe(54950);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @wusuq/api test -- invoice-lines`
Expected: FAIL — `Cannot find module './invoice-lines'`

- [ ] **Step 3: Implement**

Create `apps/api/src/invoices/invoice-lines.ts`:

```ts
import { round2 } from '@wusuq/shared';

export interface InvoiceTicketInput {
  id: string;
  batchNo: string;
  currency: string;
  intakeFlow?: string | null;
  formPayload?: unknown;
  serviceCost: number;
  additionalServiceCost: number;
  printingCharges: number;
  attestedCharges: number;
  nonAttestedCharges: number;
  deliveryCharges: number;
  additionalCharges: number;
  discountPrice: number;
  promoDiscount: number;
  service?: { name?: string | null } | null;
}

export interface InvoiceLine {
  position: number;
  ticketId: string;
  batchNo: string;
  description: string;
  courtLine: string | null;
  caseTitle: string | null;
  judge: string | null;
  serviceCost: number;
  printing: number;
  attested: number;
  nonAttested: number;
  delivery: number;
  additional: number;
  lineTotal: number;
}

/** Sequence value -> the template's bare 6-digit number. Never truncates. */
export function formatInvoiceNo(seq: number): string {
  return String(seq).padStart(6, '0');
}

function str(payload: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = payload[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function buildLine(t: InvoiceTicketInput, position: number): InvoiceLine {
  const payload = (t.formPayload ?? {}) as Record<string, unknown>;

  const court = str(payload, 'court_name', 'select_court', 'court');
  const city = str(payload, 'city', 'service_city');
  const courtLine =
    court && city ? `(${court} - ${city})` : court ? `(${court})` : city ? `(${city})` : null;

  const serviceCost = round2(Number(t.serviceCost) + Number(t.additionalServiceCost));
  const printing = round2(Number(t.printingCharges));
  const attested = round2(Number(t.attestedCharges));
  const nonAttested = round2(Number(t.nonAttestedCharges));
  const delivery = round2(Number(t.deliveryCharges));
  const additional = round2(Number(t.additionalCharges));

  return {
    position,
    ticketId: t.id,
    batchNo: t.batchNo,
    description: t.service?.name?.trim() || `Ticket ${t.batchNo}`,
    courtLine,
    caseTitle: str(payload, 'case_title', 'caseTitle'),
    // The owner's sample renders "Case Judge ()" when empty. That's a defect —
    // null here means the renderer omits the line entirely.
    judge: str(payload, 'judge_name', 'judge'),
    serviceCost,
    printing,
    attested,
    nonAttested,
    delivery,
    additional,
    // Tax and discount are invoice-level, never per-line.
    lineTotal: round2(serviceCost + printing + attested + nonAttested + delivery + additional),
  };
}

export function buildInvoiceLines(tickets: InvoiceTicketInput[]): InvoiceLine[] {
  return tickets.map((t, i) => buildLine(t, i + 1));
}

/**
 * Invoice-level totals.
 *
 * Mirrors computeTicketTotal's contract: tax applies to the SERVICE base only
 * (serviceCost + additionalServiceCost, already folded into line.serviceCost),
 * NOT the whole bill. Delivery/printing/attested/non-attested/additional stay
 * in the total but untaxed.
 */
export function summariseInvoice(
  lines: InvoiceLine[],
  opts: { taxRate: number; discountTotal: number },
): { subtotal: number; taxableBase: number; taxAmount: number; grandTotal: number } {
  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const serviceBase = round2(lines.reduce((s, l) => s + l.serviceCost, 0));
  const discount = Math.max(0, round2(opts.discountTotal));

  const taxableBase = Math.max(0, round2(serviceBase - discount));
  const taxAmount = round2(taxableBase * Math.max(0, opts.taxRate));
  const grandTotal = Math.max(0, round2(Math.max(0, subtotal - discount) + taxAmount));

  return { subtotal, taxableBase, taxAmount, grandTotal };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @wusuq/api test -- invoice-lines`
Expected: 13 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/invoices/invoice-lines.ts apps/api/src/invoices/invoice-lines.spec.ts
git commit -m "feat(api): add pure invoice line-item assembly + totals"
```

---

### Task 3: Company settings

**Files:**
- Modify: `apps/api/src/settings/settings.service.ts`
- Modify: `apps/api/src/settings/settings.controller.ts`
- Create: `apps/api/src/settings/dto/company-settings.dto.ts`
- Test: `apps/api/src/settings/company-settings.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface CompanySettings {
    name: string; country: string; phone: string; email: string;
  }
  // on SettingsService:
  getCompanySettings(): Promise<CompanySettings>;
  setCompanySettings(input: CompanySettings, actorUserId?: string): Promise<CompanySettings>;
  ```
  Consumed by Task 5 (the PDF header).

**Context you need.** `AppSetting` is a key-value string table keyed by `key` (`@id`). The existing pattern is `readKey()` → `findUnique` → coerce, and `upsert` inside `$transaction([...])`. Follow it exactly — see `settings.service.ts:16-63`.

Defaults come from the owner's template header: `WUSUQ` / `Pakistan` / `0300-1998787` / `wusuqlq@icloud.com`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/settings/company-settings.spec.ts`:

```ts
import { SettingsService } from './settings.service';

function makePrisma(rows: Record<string, string> = {}) {
  return {
    appSetting: {
      findUnique: jest.fn(({ where }: { where: { key: string } }) =>
        Promise.resolve(rows[where.key] != null ? { key: where.key, value: rows[where.key] } : null),
      ),
      upsert: jest.fn((args: unknown) => args),
    },
    $transaction: jest.fn((ops: unknown[]) => Promise.resolve(ops)),
  } as never;
}

describe('SettingsService company settings', () => {
  it('falls back to the template defaults when unset', async () => {
    const s = new SettingsService(makePrisma());
    await expect(s.getCompanySettings()).resolves.toEqual({
      name: 'WUSUQ',
      country: 'Pakistan',
      phone: '0300-1998787',
      email: 'wusuqlq@icloud.com',
    });
  });

  it('reads persisted values', async () => {
    const s = new SettingsService(
      makePrisma({ 'company.name': 'Wusuq Pvt Ltd', 'company.phone': '0300-0000000' }),
    );
    const c = await s.getCompanySettings();
    expect(c.name).toBe('Wusuq Pvt Ltd');
    expect(c.phone).toBe('0300-0000000');
    expect(c.country).toBe('Pakistan'); // still the default
  });

  it('writes all four keys in one transaction', async () => {
    const prisma = makePrisma();
    const s = new SettingsService(prisma);
    await s.setCompanySettings(
      { name: 'A', country: 'B', phone: 'C', email: 'd@e.f' },
      'user-1',
    );
    expect((prisma as never as { $transaction: jest.Mock }).$transaction).toHaveBeenCalledTimes(1);
    const ops = (prisma as never as { $transaction: jest.Mock }).$transaction.mock.calls[0][0];
    expect(ops).toHaveLength(4);
  });

  it('trims whitespace', async () => {
    const s = new SettingsService(makePrisma({ 'company.name': '  Spacey  ' }));
    expect((await s.getCompanySettings()).name).toBe('Spacey');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @wusuq/api test -- company-settings`
Expected: FAIL — `s.getCompanySettings is not a function`

- [ ] **Step 3: Implement in `settings.service.ts`**

Add near the existing `TAX_*` constants:

```ts
const COMPANY_KEYS = {
  name: 'company.name',
  country: 'company.country',
  phone: 'company.phone',
  email: 'company.email',
} as const;

/** Defaults match the owner's invoice template header (spec 2026-07-16). */
const COMPANY_DEFAULTS: CompanySettings = {
  name: 'WUSUQ',
  country: 'Pakistan',
  phone: '0300-1998787',
  email: 'wusuqlq@icloud.com',
};

export interface CompanySettings {
  name: string;
  country: string;
  phone: string;
  email: string;
}
```

Add these methods to the class:

```ts
  /** Company identity block on the invoice header. Admin-editable, no deploy. */
  async getCompanySettings(): Promise<CompanySettings> {
    const entries = await Promise.all(
      (Object.keys(COMPANY_KEYS) as Array<keyof CompanySettings>).map(
        async (field) => [field, (await this.readKey(COMPANY_KEYS[field]))?.trim() || COMPANY_DEFAULTS[field]] as const,
      ),
    );
    return Object.fromEntries(entries) as CompanySettings;
  }

  async setCompanySettings(
    input: CompanySettings,
    actorUserId?: string,
  ): Promise<CompanySettings> {
    const next: CompanySettings = {
      name: input.name.trim(),
      country: input.country.trim(),
      phone: input.phone.trim(),
      email: input.email.trim(),
    };
    await this.prisma.$transaction(
      (Object.keys(COMPANY_KEYS) as Array<keyof CompanySettings>).map((field) =>
        this.prisma.appSetting.upsert({
          where: { key: COMPANY_KEYS[field] },
          create: { key: COMPANY_KEYS[field], value: next[field], updatedByUserId: actorUserId },
          update: { value: next[field], updatedByUserId: actorUserId },
        }),
      ),
    );
    return next;
  }
```

- [ ] **Step 4: Add the DTO**

Create `apps/api/src/settings/dto/company-settings.dto.ts`:

```ts
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class CompanySettingsDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsString() @MinLength(1) @MaxLength(120) country!: string;
  @IsString() @MinLength(1) @MaxLength(40) phone!: string;
  @IsEmail() @MaxLength(160) email!: string;
}
```

- [ ] **Step 5: Add the routes**

In `apps/api/src/settings/settings.controller.ts`, following the existing style (permission decorator **before** the verb):

```ts
  @RequirePermissions('settings.read')
  @Get('company')
  getCompany() {
    return this.settings.getCompanySettings();
  }

  @RequirePermissions('settings.write')
  @Put('company')
  setCompany(@Body() dto: CompanySettingsDto, @CurrentUser() actor: JwtUser | undefined) {
    return this.settings.setCompanySettings(dto, actor?.sub);
  }
```

Import `CompanySettingsDto`. Add `Put`/`Body` to the `@nestjs/common` import if not present.

- [ ] **Step 6: Run + commit**

```bash
pnpm --filter @wusuq/api test -- company-settings
pnpm --filter @wusuq/api lint
git add apps/api/src/settings
git commit -m "feat(api): add admin-editable company settings for the invoice header"
```
Expected: 4 tests PASS; lint 0 errors.

---

### Task 4: Invoices service — guards, sequence, snapshot

**Files:**
- Create: `apps/api/src/invoices/invoices.service.ts`
- Create: `apps/api/src/invoices/dto/create-invoice.dto.ts`
- Test: `apps/api/src/invoices/invoices.service.spec.ts`

**Interfaces:**
- Consumes: `buildInvoiceLines`, `summariseInvoice`, `formatInvoiceNo` (Task 2); `SettingsService.getTaxRate()` (existing).
- Produces:
  ```ts
  class InvoicesService {
    generate(ticketIds: string[], actorUserId: string): Promise<{ id: string; invoiceNo: string }>;
    list(actor: JwtUser): Promise<InvoiceSummary[]>;
    findOne(id: string, actor: JwtUser): Promise<InvoiceDetail>;   // throws NotFound on IDOR
  }
  ```
  Consumed by Tasks 5, 6.

**Context you need — the guards are the point of this task.** All reject at generation:

| Guard | Why |
|---|---|
| Empty selection | Nothing to bill |
| Tickets from >1 consumer | An invoice is billed to one person |
| Mixed currency | PKR + USD cannot sum to one GRAND TOTAL |
| Ticket already invoiced | Double-billing. `InvoiceItem.ticketId @unique` is the DB backstop; check up-front for a clean 409 |
| Archived ticket | Soft-deleted (audit 4.2) |

**The IDOR guard is a regression-critical test.** Copy the shape from `tickets.service.ts:1835`:
```ts
if (!isStaffRole(caller.role) && (ticket.consumerId !== caller.userId || ticket.archivedAt))
  throw new NotFoundException('Ticket not found');
```
A `representative` is **neither** staff nor consumer-class, so an `isConsumerRole` check here would be a no-op and let any clerk pull any consumer's invoice. Use `isStaffRole`. Return **404, not 403**, so ids can't be probed.

**Sequence:** `nextval` must run **inside** the same transaction as the insert.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/invoices/invoices.service.spec.ts`:

```ts
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InvoicesService } from './invoices.service';

type Ticket = Record<string, unknown>;

const ticket = (over: Partial<Ticket> = {}): Ticket => ({
  id: 't1', batchNo: '035210', consumerId: 'c1', currency: 'PKR', archivedAt: null,
  intakeFlow: 'judicial_case_files', formPayload: {},
  serviceCost: 2500, additionalServiceCost: 0, printingCharges: 2450,
  attestedCharges: 0, nonAttestedCharges: 0, deliveryCharges: 0, additionalCharges: 0,
  discountPrice: 0, promoDiscount: 0, service: { name: 'Case Files Lower Court 2025' },
  invoiceItem: null,
  ...over,
});

function makeService(tickets: Ticket[], opts: { taxRate?: number } = {}) {
  const created: Record<string, unknown>[] = [];
  const tx = {
    ticket: { findMany: jest.fn(() => Promise.resolve(tickets)) },
    invoice: { create: jest.fn((a: { data: Record<string, unknown> }) => { created.push(a.data); return Promise.resolve({ id: 'inv1', invoiceNo: a.data.invoiceNo }); }) },
    $queryRawUnsafe: jest.fn(() => Promise.resolve([{ nextval: 348n }])),
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
  const settings = { getTaxRate: jest.fn(() => Promise.resolve(opts.taxRate ?? 0)) };
  return { svc: new InvoicesService(prisma as never, settings as never), created, prisma, tx };
}

const STAFF = { sub: 'admin1', role: 'super-admin' } as never;

describe('InvoicesService.generate guards', () => {
  it('rejects an empty selection', async () => {
    const { svc } = makeService([]);
    await expect(svc.generate([], 'admin1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects tickets from more than one consumer', async () => {
    const { svc } = makeService([ticket(), ticket({ id: 't2', consumerId: 'c2' })]);
    await expect(svc.generate(['t1', 't2'], 'admin1')).rejects.toThrow(/one consumer/i);
  });

  it('rejects mixed currency (PKR and USD cannot sum)', async () => {
    const { svc } = makeService([ticket(), ticket({ id: 't2', currency: 'USD' })]);
    await expect(svc.generate(['t1', 't2'], 'admin1')).rejects.toThrow(/currency/i);
  });

  it('rejects a ticket already on another invoice', async () => {
    const { svc } = makeService([ticket({ invoiceItem: { invoiceId: 'inv-old' } })]);
    await expect(svc.generate(['t1'], 'admin1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an archived ticket', async () => {
    const { svc } = makeService([ticket({ archivedAt: new Date() })]);
    await expect(svc.generate(['t1'], 'admin1')).rejects.toThrow(/archived/i);
  });

  it('rejects when a requested id does not exist', async () => {
    const { svc } = makeService([ticket()]);
    await expect(svc.generate(['t1', 'missing'], 'admin1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('InvoicesService.generate', () => {
  it('formats the sequence value as a 6-digit number', async () => {
    const { svc, created } = makeService([ticket()]);
    const out = await svc.generate(['t1'], 'admin1');
    expect(out.invoiceNo).toBe('000348');
    expect(created[0].invoiceNo).toBe('000348');
  });

  it('draws the sequence INSIDE the transaction', async () => {
    const { svc, prisma, tx } = makeService([ticket()]);
    await svc.generate(['t1'], 'admin1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRawUnsafe).toHaveBeenCalled();
  });

  it('snapshots the line items onto the invoice', async () => {
    const { svc, created } = makeService([ticket()]);
    await svc.generate(['t1'], 'admin1');
    const items = (created[0].items as { create: Record<string, unknown>[] }).create;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      ticketId: 't1', batchNo: '035210', position: 1,
      serviceCost: 2500, printing: 2450, lineTotal: 4950,
    });
  });

  it('snapshots the tax rate and currency', async () => {
    const { svc, created } = makeService([ticket()], { taxRate: 0.17 });
    await svc.generate(['t1'], 'admin1');
    expect(created[0]).toMatchObject({ currency: 'PKR', taxRate: 0.17, taxAmount: 425, grandTotal: 5375 });
  });

  it('never writes clerkCost onto the invoice', async () => {
    const { svc, created } = makeService([ticket({ clerkCost: 999 })]);
    await svc.generate(['t1'], 'admin1');
    expect(JSON.stringify(created[0])).not.toContain('999');
    expect(JSON.stringify(created[0]).toLowerCase()).not.toContain('clerk');
  });
});

describe('InvoicesService.findOne authorization', () => {
  const invoice = { id: 'inv1', consumerId: 'c1', items: [], consumer: {} };

  function svcWith(inv: unknown) {
    const prisma = { invoice: { findUnique: jest.fn(() => Promise.resolve(inv)) } };
    return new InvoicesService(prisma as never, { getTaxRate: jest.fn() } as never);
  }

  it('lets staff read any invoice', async () => {
    await expect(svcWith(invoice).findOne('inv1', STAFF)).resolves.toMatchObject({ id: 'inv1' });
  });

  it('lets the owning consumer read their own', async () => {
    await expect(
      svcWith(invoice).findOne('inv1', { sub: 'c1', role: 'consumer' } as never),
    ).resolves.toMatchObject({ id: 'inv1' });
  });

  it('404s a non-owning consumer (ids must not be probeable)', async () => {
    await expect(
      svcWith(invoice).findOne('inv1', { sub: 'c9', role: 'consumer' } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s a representative — a clerk must never pull a consumer invoice (3.1-class IDOR)', async () => {
    await expect(
      svcWith(invoice).findOne('inv1', { sub: 'rep1', role: 'representative' } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s a missing invoice', async () => {
    await expect(svcWith(null).findOne('nope', STAFF)).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @wusuq/api test -- invoices.service`
Expected: FAIL — `Cannot find module './invoices.service'`

- [ ] **Step 3: Write the DTO**

Create `apps/api/src/invoices/dto/create-invoice.dto.ts`:

```ts
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsString } from 'class-validator';

export class CreateInvoiceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  ticketIds!: string[];
}
```

- [ ] **Step 4: Implement the service**

Create `apps/api/src/invoices/invoices.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isStaffRole, round2 } from '@wusuq/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import type { JwtUser } from '../auth/types/jwt-user.type';
import { buildInvoiceLines, formatInvoiceNo, summariseInvoice } from './invoice-lines';

const TICKET_SELECT = {
  id: true, batchNo: true, consumerId: true, currency: true, archivedAt: true,
  intakeFlow: true, formPayload: true,
  serviceCost: true, additionalServiceCost: true, printingCharges: true,
  attestedCharges: true, nonAttestedCharges: true, deliveryCharges: true,
  additionalCharges: true, discountPrice: true, promoDiscount: true,
  service: { select: { name: true } },
  invoiceItem: { select: { invoiceId: true } },
  // NOTE: clerkCost is deliberately NOT selected. It must never reach an invoice.
} as const;

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Issue one invoice covering N tickets of a single consumer.
   *
   * Every money field is SNAPSHOTTED: an issued invoice is a legal document and
   * must not change when the underlying tickets are later edited.
   */
  async generate(ticketIds: string[], actorUserId: string) {
    if (!ticketIds.length) throw new BadRequestException('Select at least one ticket to invoice.');

    return this.prisma.$transaction(async (tx) => {
      const tickets = await tx.ticket.findMany({
        where: { id: { in: ticketIds } },
        select: TICKET_SELECT,
      });

      if (tickets.length !== ticketIds.length) {
        throw new NotFoundException('One or more tickets were not found.');
      }

      const archived = tickets.find((t) => t.archivedAt);
      if (archived) {
        throw new BadRequestException(`Ticket ${archived.batchNo} is archived and cannot be invoiced.`);
      }

      const consumerIds = new Set(tickets.map((t) => t.consumerId));
      if (consumerIds.size > 1) {
        throw new BadRequestException('All tickets on an invoice must belong to one consumer.');
      }

      const currencies = new Set(tickets.map((t) => t.currency ?? 'PKR'));
      if (currencies.size > 1) {
        throw new BadRequestException(
          `Cannot invoice mixed currencies (${[...currencies].join(', ')}) — totals would not sum.`,
        );
      }

      const already = tickets.find((t) => t.invoiceItem);
      if (already) {
        throw new ConflictException(`Ticket ${already.batchNo} is already on another invoice.`);
      }

      const num = (v: unknown) => Number(v ?? 0);
      const lines = buildInvoiceLines(
        tickets.map((t) => ({
          id: t.id, batchNo: t.batchNo, currency: t.currency ?? 'PKR',
          intakeFlow: t.intakeFlow, formPayload: t.formPayload,
          serviceCost: num(t.serviceCost), additionalServiceCost: num(t.additionalServiceCost),
          printingCharges: num(t.printingCharges), attestedCharges: num(t.attestedCharges),
          nonAttestedCharges: num(t.nonAttestedCharges), deliveryCharges: num(t.deliveryCharges),
          additionalCharges: num(t.additionalCharges),
          discountPrice: num(t.discountPrice), promoDiscount: num(t.promoDiscount),
          service: t.service,
        })),
      );

      const currency = tickets[0].currency ?? 'PKR';
      // USD is an all-inclusive flat price list — no tax (CLAUDE.md, country pricing).
      const taxRate = currency === 'USD' ? 0 : await this.settings.getTaxRate();
      const discountTotal = round2(
        tickets.reduce((s, t) => s + num(t.discountPrice) + num(t.promoDiscount), 0),
      );
      const totals = summariseInvoice(lines, { taxRate, discountTotal });

      // nextval MUST run inside this transaction so a concurrent generate can't
      // reuse the number.
      const seqRows = await tx.$queryRawUnsafe<Array<{ nextval: bigint }>>(
        `SELECT nextval('invoice_no_seq')`,
      );
      const invoiceNo = formatInvoiceNo(Number(seqRows[0].nextval));

      const created = await tx.invoice.create({
        data: {
          invoiceNo,
          consumerId: tickets[0].consumerId,
          currency,
          subtotal: totals.subtotal,
          taxRate,
          taxAmount: totals.taxAmount,
          grandTotal: totals.grandTotal,
          items: {
            create: lines.map((l) => ({
              ticketId: l.ticketId, position: l.position, batchNo: l.batchNo,
              description: l.description, courtLine: l.courtLine,
              caseTitle: l.caseTitle, judge: l.judge,
              serviceCost: l.serviceCost, printing: l.printing, attested: l.attested,
              nonAttested: l.nonAttested, delivery: l.delivery, additional: l.additional,
              lineTotal: l.lineTotal,
            })),
          },
        },
        select: { id: true, invoiceNo: true },
      });

      return created;
    });
  }

  /** Staff see all; a consumer sees their own; anyone else (e.g. a clerk) sees none. */
  async list(actor: JwtUser) {
    const staff = isStaffRole(actor.role);
    if (!staff && !actor.sub) return [];
    return this.prisma.invoice.findMany({
      where: staff ? {} : { consumerId: actor.sub },
      orderBy: { issueDate: 'desc' },
      select: {
        id: true, invoiceNo: true, issueDate: true, currency: true,
        grandTotal: true, status: true,
        consumer: { select: { id: true, name: true, email: true } },
        _count: { select: { items: true } },
      },
    });
  }

  /**
   * 404 (not 403) for anyone who may not read this invoice, so ids can't be probed.
   *
   * isStaffRole — NOT isConsumerRole. A `representative` is neither staff nor
   * consumer-class, so an isConsumerRole check would be a silent no-op and let
   * any clerk pull any consumer's invoice (the 3.1-class IDOR).
   */
  async findOne(id: string, actor: JwtUser) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        items: { orderBy: { position: 'asc' } },
        consumer: {
          select: { id: true, name: true, email: true, phone: true, address: true },
        },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (!isStaffRole(actor.role) && invoice.consumerId !== actor.sub) {
      throw new NotFoundException('Invoice not found');
    }
    return invoice;
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @wusuq/api test -- invoices.service`
Expected: 16 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/invoices
git commit -m "feat(api): add invoices service with guards, sequence, and snapshot"
```

---

### Task 5: The PDF renderer

**Files:**
- Create: `apps/api/src/invoices/invoice.pdf.ts`
- Test: `apps/api/src/invoices/invoice.pdf.spec.ts`

**Interfaces:**
- Consumes: `InvoiceLine` (Task 2), `CompanySettings` (Task 3).
- Produces:
  ```ts
  export interface InvoiceView {
    invoiceNo: string; issueDate: Date; currency: 'PKR' | 'USD';
    company: CompanySettings;
    billTo: { name: string; address?: string | null; phone?: string | null; email?: string | null };
    lines: InvoiceLine[];
    subtotal: number; taxRate: number; taxAmount: number; grandTotal: number;
    payment?: { accountTitle?: string | null; jazzCash?: string | null;
                easyPaisa?: string | null; accountNumber?: string | null; bankName?: string | null } | null;
  }
  export function renderInvoicePdf(view: InvoiceView): Promise<Buffer>;
  ```
  Consumed by Task 6.

**Context you need — replicate this layout** (from the owner's samples):

```
[logo tile]                              WUSUQ
                                       Pakistan
                                   0300-1998787
                              wusuqlq@icloud.com
────────────────────────────────────────────────
INVOICE TO:                     INVOICE 364692
Rehman Sher Saif           Date of Invoice: 28-06-2026
Chamber 237, Sialkot
+923334777070
rssadv@yahoo.com

# | DESCRIPTION | Service | Printing | Attested | Non-Att | Delivery | Additional | Total
1 | 035210 - Case Files ...  (purple # cell, grey header, striped rows)
  | (Family Court - Islamabad)
  | Case Title (Ali Ijaz vs Mrs Maryam Ali Ijaz)
  | Case Judge (Amina Asif Butt)
                                        SUBTOTAL   54950
                                        TAX (17%)   9342
                                     GRAND TOTAL   64292
──────────────────────────────── (purple rule)
[grey block] Payment Information
             Name / JazzCash / EasyPaisa / Bank Account

     Helping you is our purpose satisfying you is our business.
              THANK YOU FOR USING WUSUQ!
```

**Deviations from the sample, all agreed (spec Part 4):** Attested + Non-Attested get their own columns (the sample folded them invisibly); the tax row shows the real rate and amount, not a literal `TAX %`; money carries its currency via `formatMoney`; `Case Judge` is omitted when absent.

**Brand colours:** purple `#7b248d`, header grey `#f1f5f9`, stripe `#f8fafc`, muted text `#64748b`.

**Seven money columns is tight on A4 portrait (595pt wide, 50pt margins → 495pt usable).** Budget: `#` 22pt, description 155pt, then 7 money columns at 45pt = 315pt. Total 492pt. Money font 8pt, header 7pt. **If the description column proves unreadable, switch the page to landscape (`layout: 'landscape'`) and report it — do not silently truncate text.**

**`align: 'right'` with `continued: true` does NOT make a money column** — it aligns within the remaining line box. That bug is why the old consumer PDF never lined up. Always pass explicit `x` and `width`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/invoices/invoice.pdf.spec.ts`:

```ts
import { renderInvoicePdf, type InvoiceView } from './invoice.pdf';

const view: InvoiceView = {
  invoiceNo: '000348',
  issueDate: new Date('2026-06-28T00:00:00Z'),
  currency: 'PKR',
  company: { name: 'WUSUQ', country: 'Pakistan', phone: '0300-1998787', email: 'wusuqlq@icloud.com' },
  billTo: { name: 'Urooj Fatima', phone: '+923218337776', email: 'urooj@yahoo.com' },
  lines: [
    {
      position: 1, ticketId: 't1', batchNo: '035210',
      description: 'Case Files Special Court 2024',
      courtLine: '(Special Courts - Karachi)',
      caseTitle: 'State vs Naimat Ullah Khan & others',
      judge: null,
      serviceCost: 10500, printing: 24500, attested: 0, nonAttested: 0,
      delivery: 4500, additional: 7000, lineTotal: 46500,
    },
  ],
  subtotal: 46500, taxRate: 0.17, taxAmount: 1785, grandTotal: 48285,
  payment: { accountTitle: 'Ali Zain', jazzCash: '0300-4680800', easyPaisa: '0300-4680800', accountNumber: 'PK62ABPA0010002772510013' },
};

describe('renderInvoicePdf', () => {
  it('produces a real PDF buffer', async () => {
    const buf = await renderInvoicePdf(view);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('renders without throwing on many lines (page overflow path)', async () => {
    const many = { ...view, lines: Array.from({ length: 40 }, (_, i) => ({ ...view.lines[0], position: i + 1, ticketId: `t${i}` })) };
    const buf = await renderInvoicePdf(many);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('renders a USD invoice', async () => {
    const buf = await renderInvoicePdf({ ...view, currency: 'USD', taxRate: 0, taxAmount: 0 });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('renders with no payment settings configured', async () => {
    const buf = await renderInvoicePdf({ ...view, payment: null });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('renders a line with no court, title, or judge (legacy ticket)', async () => {
    const bare = { ...view, lines: [{ ...view.lines[0], courtLine: null, caseTitle: null, judge: null }] };
    const buf = await renderInvoicePdf(bare);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @wusuq/api test -- invoice.pdf`
Expected: FAIL — `Cannot find module './invoice.pdf'`

- [ ] **Step 3: Implement**

Create `apps/api/src/invoices/invoice.pdf.ts`:

```ts
import { existsSync } from 'fs';
import { join } from 'path';
import PDFDocument from 'pdfkit';
import { formatMoney, type Currency } from '@wusuq/shared';
import type { CompanySettings } from '../settings/settings.service';
import type { InvoiceLine } from './invoice-lines';

export interface InvoiceView {
  invoiceNo: string;
  issueDate: Date;
  currency: Currency;
  company: CompanySettings;
  billTo: { name: string; address?: string | null; phone?: string | null; email?: string | null };
  lines: InvoiceLine[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  grandTotal: number;
  payment?: {
    accountTitle?: string | null; jazzCash?: string | null;
    easyPaisa?: string | null; accountNumber?: string | null; bankName?: string | null;
  } | null;
}

const PURPLE = '#7b248d';
const HEADER_BG = '#f1f5f9';
const STRIPE = '#f8fafc';
const MUTED = '#64748b';
const INK = '#121f35';

const M = 50;                       // page margin
const PAGE_W = 595;                 // A4 portrait
const CONTENT_W = PAGE_W - M * 2;   // 495

// Column x-offsets from the left margin. 22 + 155 + 7*45 = 492 <= 495.
const COL_NUM_W = 22;
const COL_DESC_W = 155;
const MONEY_W = 45;
const MONEY_COLS = ['Service', 'Printing', 'Attested', 'Non-Att', 'Delivery', 'Additional', 'Total'] as const;

function moneyX(i: number): number {
  return M + COL_NUM_W + COL_DESC_W + i * MONEY_W;
}

function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
}

/** Exact rate — "TAX (17.5%)", never Math.round (which made the old PDF lie). */
function taxLabel(rate: number): string {
  if (!rate) return 'TAX';
  const pct = rate * 100;
  const shown = Number.isInteger(pct) ? String(pct) : String(Number(pct.toFixed(2)));
  return `TAX (${shown}%)`;
}

function logoPath(): string | null {
  // Rendered white-on-purple in the header tile, mirroring the owner's template.
  const p = join(process.cwd(), '..', 'web', 'public', 'brand', 'wusuq-mark-white.png');
  return existsSync(p) ? p : null;
}

function drawHeader(doc: PDFKit.PDFDocument, v: InvoiceView): void {
  const tile = 56;
  doc.roundedRect(M, M, tile, tile, 6).fill(PURPLE);
  const logo = logoPath();
  if (logo) {
    try {
      doc.image(logo, M + 10, M + 10, { fit: [tile - 20, tile - 20], align: 'center', valign: 'center' });
    } catch {
      // A missing/corrupt asset must never fail an invoice.
    }
  }

  const right = M + CONTENT_W;
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(13)
    .text(v.company.name, right - 200, M + 4, { width: 200, align: 'right' });
  doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  doc.text(v.company.country, right - 200, doc.y, { width: 200, align: 'right' });
  doc.text(v.company.phone, right - 200, doc.y, { width: 200, align: 'right' });
  doc.fillColor(PURPLE).text(v.company.email, right - 200, doc.y, { width: 200, align: 'right' });

  const ruleY = M + tile + 12;
  doc.moveTo(M, ruleY).lineTo(right, ruleY).lineWidth(0.5).strokeColor('#cbd5e1').stroke();
}

function drawBillTo(doc: PDFKit.PDFDocument, v: InvoiceView): number {
  const top = M + 90;
  doc.rect(M, top, 2, 42).fill(PURPLE);

  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('INVOICE TO:', M + 8, top);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(12).text(v.billTo.name, M + 8, top + 12);
  doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  let y = top + 28;
  if (v.billTo.address) { doc.text(v.billTo.address, M + 8, y, { width: 220 }); y = doc.y; }
  if (v.billTo.phone) { doc.text(v.billTo.phone, M + 8, y); y = doc.y; }
  if (v.billTo.email) { doc.fillColor(PURPLE).text(v.billTo.email, M + 8, y); y = doc.y; }

  const right = M + CONTENT_W;
  doc.fillColor(PURPLE).font('Helvetica').fontSize(20)
    .text(`INVOICE ${v.invoiceNo}`, right - 240, top, { width: 240, align: 'right' });
  doc.fillColor(MUTED).fontSize(8)
    .text(`Date of Invoice: ${fmtDate(v.issueDate)}`, right - 240, top + 26, { width: 240, align: 'right' });

  return Math.max(y, top + 46) + 18;
}

function drawTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  const h = 26;
  doc.rect(M, y, CONTENT_W, h).fill(HEADER_BG);
  doc.fillColor(MUTED).font('Helvetica').fontSize(7);
  doc.text('#', M + 6, y + 10);
  doc.text('DESCRIPTION', M + COL_NUM_W + 6, y + 10);
  MONEY_COLS.forEach((label, i) => {
    doc.text(label, moneyX(i), y + 10, { width: MONEY_W - 4, align: 'right' });
  });
  return y + h;
}

function drawLine(doc: PDFKit.PDFDocument, line: InvoiceLine, y: number, c: Currency, striped: boolean): number {
  const desc: string[] = [];
  if (line.courtLine) desc.push(line.courtLine);
  if (line.caseTitle) desc.push(`Case Title (${line.caseTitle})`);
  // Omitted entirely when absent — the sample's "Case Judge ()" is a defect.
  if (line.judge) desc.push(`Case Judge (${line.judge})`);

  const title = `${line.batchNo} - ${line.description}`;
  const titleH = doc.font('Helvetica').fontSize(9).heightOfString(title, { width: COL_DESC_W - 12 });
  const subH = desc.length
    ? doc.fontSize(7).heightOfString(desc.join('\n'), { width: COL_DESC_W - 12 })
    : 0;
  const h = Math.max(38, titleH + subH + 16);

  if (striped) doc.rect(M, y, CONTENT_W, h).fill(STRIPE);
  doc.rect(M, y, COL_NUM_W, h).fill(PURPLE);
  doc.fillColor('#ffffff').font('Helvetica').fontSize(9)
    .text(String(line.position), M, y + h / 2 - 5, { width: COL_NUM_W, align: 'center' });

  doc.fillColor(PURPLE).font('Helvetica').fontSize(9)
    .text(title, M + COL_NUM_W + 6, y + 6, { width: COL_DESC_W - 12 });
  if (desc.length) {
    doc.fillColor(MUTED).fontSize(7)
      .text(desc.join('\n'), M + COL_NUM_W + 6, y + 6 + titleH + 2, { width: COL_DESC_W - 12 });
  }

  const amounts = [line.serviceCost, line.printing, line.attested, line.nonAttested, line.delivery, line.additional, line.lineTotal];
  doc.fillColor(INK).font('Helvetica').fontSize(8);
  amounts.forEach((amt, i) => {
    // Explicit x + width — `continued: true` + align:'right' does NOT make a column.
    doc.text(formatMoney(amt, c), moneyX(i), y + h / 2 - 4, { width: MONEY_W - 4, align: 'right' });
  });

  return y + h;
}

function drawTotals(doc: PDFKit.PDFDocument, v: InvoiceView, y: number): number {
  const right = M + CONTENT_W;
  const rows: Array<[string, number, boolean]> = [
    ['SUBTOTAL', v.subtotal, false],
    [taxLabel(v.taxRate), v.taxAmount, false],
    ['GRAND TOTAL', v.grandTotal, true],
  ];
  let cur = y + 10;
  for (const [label, amount, strong] of rows) {
    doc.fillColor(strong ? PURPLE : INK)
      .font('Helvetica').fontSize(strong ? 13 : 10)
      .text(label, right - 300, cur, { width: 190, align: 'right' })
      .text(formatMoney(amount, v.currency), right - 100, cur, { width: 100, align: 'right' });
    cur += strong ? 26 : 20;
  }
  doc.moveTo(M, cur + 4).lineTo(right, cur + 4).lineWidth(1).strokeColor(PURPLE).stroke();
  return cur + 16;
}

function drawPaymentAndFooter(doc: PDFKit.PDFDocument, v: InvoiceView, y: number): void {
  const p = v.payment;
  let cur = y;
  if (p) {
    const lines = [
      p.accountTitle ? `Name: ${p.accountTitle}` : null,
      p.jazzCash ? `JazzCash Account: ${p.jazzCash}` : null,
      p.easyPaisa ? `EasyPaisa Account: ${p.easyPaisa}` : null,
      p.accountNumber ? `Bank Account : ${p.accountNumber}` : null,
    ].filter(Boolean) as string[];

    if (lines.length) {
      const h = 22 + lines.length * 11;
      doc.rect(M, cur, CONTENT_W, h).fill(HEADER_BG);
      doc.fillColor(PURPLE).font('Helvetica').fontSize(10).text('Payment Information', M + 12, cur + 8);
      doc.fillColor(MUTED).fontSize(7.5).text(lines.join('\n'), M + 12, cur + 22, { width: CONTENT_W - 24 });
      cur += h + 24;
    }
  }

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(10)
    .text('Helping you is our purpose satisfying you is our business.', M, cur, { width: CONTENT_W, align: 'center' });
  doc.fillColor(PURPLE).font('Helvetica').fontSize(15)
    .text('THANK YOU FOR USING WUSUQ!', M, cur + 24, { width: CONTENT_W, align: 'center' });
}

export function renderInvoicePdf(v: InvoiceView): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: M });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      drawHeader(doc, v);
      let y = drawBillTo(doc, v);
      y = drawTableHeader(doc, y);

      v.lines.forEach((line, i) => {
        // Reserve room for the totals block; break before it collides.
        if (y > 700) {
          doc.addPage();
          y = M;
          y = drawTableHeader(doc, y);
        }
        y = drawLine(doc, line, y, v.currency, i % 2 === 1);
      });

      if (y > 620) { doc.addPage(); y = M; }
      y = drawTotals(doc, v, y);
      drawPaymentAndFooter(doc, v, y);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @wusuq/api test -- invoice.pdf`
Expected: 5 tests PASS.

- [ ] **Step 5: Eyeball the output against the owner's sample**

```bash
cd apps/api && npx tsx -e "
import { renderInvoicePdf } from './src/invoices/invoice.pdf';
import { writeFileSync } from 'fs';
renderInvoicePdf({
  invoiceNo: '000348', issueDate: new Date('2026-06-28'), currency: 'PKR',
  company: { name: 'WUSUQ', country: 'Pakistan', phone: '0300-1998787', email: 'wusuqlq@icloud.com' },
  billTo: { name: 'Urooj Fatima', phone: '+923218337776', email: 'urooj@yahoo.com' },
  lines: [
    { position:1, ticketId:'a', batchNo:'035210', description:'Case Files Special Court 2024', courtLine:'(Special Courts (Control of Narcotic Substances) - Karachi)', caseTitle:'State vs Naimat Ullah Khan & others - Non Attested', judge:null, serviceCost:10500, printing:24500, attested:0, nonAttested:0, delivery:4500, additional:7000, lineTotal:46500 },
    { position:2, ticketId:'b', batchNo:'345579', description:'Case Files Lower Court 2025', courtLine:'(Family Court - Islamabad)', caseTitle:'Ali Ijaz vs Mrs Maryam Ali Ijaz - Attested', judge:'Amina Asif Butt', serviceCost:2500, printing:2450, attested:0, nonAttested:0, delivery:0, additional:0, lineTotal:4950 },
    { position:3, ticketId:'c', batchNo:'009075', description:'Power Of Attorney Lower Court 2026', courtLine:'(Family Court - Rawalpindi)', caseTitle:'Najma Shahid vs Nadeem Baig', judge:'Yasir Bilal', serviceCost:1500, printing:0, attested:0, nonAttested:0, delivery:0, additional:0, lineTotal:1500 },
    { position:4, ticketId:'d', batchNo:'152020', description:'Case Search Lower Court 2026', courtLine:'(Civil Court - Islamabad)', caseTitle:'Sadia Zahid vs Zahid Mushtaq', judge:'Adnan Rasheed', serviceCost:2000, printing:0, attested:0, nonAttested:0, delivery:0, additional:0, lineTotal:2000 },
  ],
  subtotal: 54950, taxRate: 0, taxAmount: 0, grandTotal: 54950,
  payment: { accountTitle:'Ali Zain', jazzCash:'0300-4680800', easyPaisa:'0300-4680800', accountNumber:'PK62ABPA0010002772510013' },
}).then(b => { writeFileSync('/tmp/invoice-preview.pdf', b); console.log('wrote /tmp/invoice-preview.pdf'); });
" && open /tmp/invoice-preview.pdf
```

Compare side-by-side with `/Users/muhammadasad/Downloads/_Lower Court Paralegal Service_2026-06-28 (1).pdf`. It should reproduce the 4-row sample (subtotal 54950), with the two extra Attested/Non-Att columns.

**Check specifically:** money columns line up; description text isn't clipped; the purple `#` cells are full-height. **If the seven money columns are cramped, report it and propose landscape — do not silently shrink the font below 7pt.**

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/invoices/invoice.pdf.ts apps/api/src/invoices/invoice.pdf.spec.ts
git commit -m "feat(api): add unified invoice PDF renderer replicating the owner template"
```

---

### Task 6: Controller + module

**Files:**
- Create: `apps/api/src/invoices/invoices.controller.ts`
- Create: `apps/api/src/invoices/invoices.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/invoices/invoices.controller.spec.ts`

**Interfaces:**
- Consumes: `InvoicesService` (Task 4), `renderInvoicePdf` (Task 5), `SettingsService` (Task 3).

**Context you need.** Global guards (`JwtAuthGuard`, `PermissionsGuard`) run app-wide as `APP_GUARD` providers — no `@UseGuards` needed. **`PermissionsGuard` fail-opens on routes with no `@RequirePermissions` metadata**, so every route must declare one (JWT is still required).

Permissions (owner decision 2026-07-16):
- `POST /invoices` → `finance.write` — **super-admin only**, the only role holding it.
- `GET /invoices` and `GET /invoices/:id/download` → **`tickets.read`** + in-service scoping. They cannot use `finance.read`: consumers don't hold it, and they must read their own invoices.

The `payment` block reads the existing `PaymentSettings` singleton (bank/JazzCash/EasyPaisa already admin-editable via the Finance board).

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/invoices/invoices.controller.spec.ts`:

```ts
import { InvoicesController } from './invoices.controller';

describe('InvoicesController permissions metadata', () => {
  const perms = (method: string): string[] =>
    Reflect.getMetadata('permissions', InvoicesController.prototype[method as never]) ?? [];

  it('generate is finance.write (super-admin only)', () => {
    expect(perms('generate')).toEqual(['finance.write']);
  });

  it('list is tickets.read — consumers must read their own', () => {
    expect(perms('list')).toEqual(['tickets.read']);
  });

  it('download is tickets.read (scoped in-service, never finance.read)', () => {
    expect(perms('download')).toEqual(['tickets.read']);
  });

  it('every route declares a permission (PermissionsGuard fail-opens without one)', () => {
    for (const m of ['generate', 'list', 'download']) {
      expect(perms(m).length).toBeGreaterThan(0);
    }
  });
});
```

If the metadata key differs, read `apps/api/src/roles-permissions/decorators/permissions.decorator.ts` and use its actual key.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @wusuq/api test -- invoices.controller`
Expected: FAIL — `Cannot find module './invoices.controller'`

- [ ] **Step 3: Implement the controller**

Create `apps/api/src/invoices/invoices.controller.ts`:

```ts
import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { toCurrency } from '@wusuq/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/types/jwt-user.type';
import { RequirePermissions } from '../roles-permissions/decorators/permissions.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoicesService } from './invoices.service';
import { renderInvoicePdf } from './invoice.pdf';

@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  /** Issue an invoice over N tickets. finance.write = super-admin only. */
  @RequirePermissions('finance.write')
  @Post()
  generate(@Body() dto: CreateInvoiceDto, @CurrentUser() actor: JwtUser) {
    return this.invoices.generate(dto.ticketIds, actor.sub);
  }

  /** Staff see all; a consumer sees their own. Scoped in-service by role. */
  @RequirePermissions('tickets.read')
  @Get()
  list(@CurrentUser() actor: JwtUser) {
    return this.invoices.list(actor);
  }

  @RequirePermissions('tickets.read')
  @Get(':id/download')
  async download(@Param('id') id: string, @CurrentUser() actor: JwtUser, @Res() res: Response) {
    // findOne 404s any caller who may not read this invoice (incl. reps).
    const inv = await this.invoices.findOne(id, actor);
    const [company, payment] = await Promise.all([
      this.settings.getCompanySettings(),
      this.prisma.paymentSettings.findFirst(),
    ]);

    const buf = await renderInvoicePdf({
      invoiceNo: inv.invoiceNo,
      issueDate: inv.issueDate,
      currency: toCurrency(inv.currency),
      company,
      billTo: {
        name: inv.consumer.name ?? 'Customer',
        address: inv.consumer.address,
        phone: inv.consumer.phone,
        email: inv.consumer.email,
      },
      lines: inv.items.map((i) => ({
        position: i.position, ticketId: i.ticketId, batchNo: i.batchNo,
        description: i.description, courtLine: i.courtLine,
        caseTitle: i.caseTitle, judge: i.judge,
        serviceCost: Number(i.serviceCost), printing: Number(i.printing),
        attested: Number(i.attested), nonAttested: Number(i.nonAttested),
        delivery: Number(i.delivery), additional: Number(i.additional),
        lineTotal: Number(i.lineTotal),
      })),
      subtotal: Number(inv.subtotal),
      taxRate: Number(inv.taxRate),
      taxAmount: Number(inv.taxAmount),
      grandTotal: Number(inv.grandTotal),
      payment,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${inv.invoiceNo}.pdf"`);
    res.send(buf);
  }
}
```

- [ ] **Step 4: Implement the module + register it**

Create `apps/api/src/invoices/invoices.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [PrismaModule, SettingsModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
```

In `apps/api/src/app.module.ts`, add `import { InvoicesModule } from './invoices/invoices.module';` with the other module imports, and `InvoicesModule` to the `imports:` array.

- [ ] **Step 5: Run + commit**

```bash
pnpm --filter @wusuq/api test -- invoices
pnpm --filter @wusuq/api lint
git add apps/api/src/invoices apps/api/src/app.module.ts
git commit -m "feat(api): add invoices controller + module"
```
Expected: all invoice tests PASS; lint 0 errors.

---

### Task 7: Retire the old pipelines

**Files:**
- Delete: `apps/api/src/tickets/consumer-invoice.pdf.ts`, `consumer-invoice.spec.ts`, `consumer-invoice-endpoint.spec.ts`
- Modify: `apps/api/src/tickets/tickets.service.ts` (drop `buildConsumerInvoice`)
- Modify: `apps/api/src/tickets/tickets.controller.ts` (drop `GET :id/invoice`)
- Modify: `apps/api/src/finance/finance.service.ts` (drop `buildInvoicePdf`, `generateInvoice`, `sendInvoice`, `generateInvoiceNo`)
- Modify: `apps/api/src/finance/finance.controller.ts` (drop invoice routes)
- Modify: `apps/api/src/finance/finance.service.spec.ts`, `reconcile-proof.spec.ts` (drop invoice cases)
- Modify: `apps/api/src/payments/payments.service.ts:215-235` (drop the Invoice upsert)
- Modify: `apps/api/src/payments/payments.service.spec.ts`, `payments-hardening.spec.ts`

**Context you need.** This is the task that makes Task 1's typecheck errors go away. Everything here is dead-by-design once Tasks 4–6 land:

- **`sendInvoice` never sent an email.** It set `sentAt`, flipped status to `SENT`, and wrote an `INVOICE_SENT` audit log while `EmailService` was never imported. Owner decision 2026-07-16: hide the button **and remove the endpoint** — leaving it live means the audit trail claims invoices were sent that never were.
- **`payments.service.ts:219`** upserts an `Invoice` with `INV-${Date.now()}-${ticketId.slice(-6)}`, a second numbering scheme writing the same column. The sequence replaces it. A payment no longer creates an invoice; invoices are issued deliberately by an admin.
- **`finance.service.ts:564`** printed `Clerk Cost` on a customer-facing PDF. Do not preserve any of it.

- [ ] **Step 1: Delete the consumer invoice renderer + its tests**

```bash
git rm apps/api/src/tickets/consumer-invoice.pdf.ts \
       apps/api/src/tickets/consumer-invoice.spec.ts \
       apps/api/src/tickets/consumer-invoice-endpoint.spec.ts
```

- [ ] **Step 2: Remove `buildConsumerInvoice` + the route**

In `apps/api/src/tickets/tickets.service.ts`, delete the whole `buildConsumerInvoice` method (~1806-1888) and the now-unused `consumerInvoiceLineItems` / `renderConsumerInvoicePdf` imports.

In `apps/api/src/tickets/tickets.controller.ts`, delete the `@Get(':id/invoice')` handler (~361-371).

- [ ] **Step 3: Remove the finance invoice paths**

In `apps/api/src/finance/finance.service.ts`, delete `buildInvoicePdf`, `generateInvoice`, `sendInvoice`, and `generateInvoiceNo`, plus the now-unused `PDFDocument` import.

In `apps/api/src/finance/finance.controller.ts`, delete the invoice routes (`generateInvoice`, `sendInvoice`, `GET :ticketId/invoice/download`).

Delete their cases from `finance.service.spec.ts` and `reconcile-proof.spec.ts`. **Do not delete unrelated tests in those files.**

- [ ] **Step 4: Remove the payments Invoice upsert**

In `apps/api/src/payments/payments.service.ts`, delete the `prisma.invoice.upsert(...)` block at ~215-235. Update `payments.service.spec.ts` / `payments-hardening.spec.ts` cases that assert an invoice is created on payment — an invoice is now issued deliberately, not as a payment side-effect.

- [ ] **Step 5: Verify nothing dangles**

```bash
grep -rn "buildConsumerInvoice\|consumerInvoiceLineItems\|renderConsumerInvoicePdf\|buildInvoicePdf\|generateInvoiceNo\|invoice/download\|INVOICE_SENT" apps/api/src || echo "clean"
```
Expected: `clean`.

- [ ] **Step 6: Typecheck + full test run**

```bash
pnpm --filter @wusuq/api typecheck
pnpm --filter @wusuq/api test
```
Expected: typecheck exit 0 (Task 1's errors are now resolved). All tests pass. Record the count — it will be **below** the 495 baseline because retired tests were deleted and new ones added; report the delta explicitly rather than treating a drop as failure.

- [ ] **Step 7: Commit**

```bash
git add -A apps/api/src
git commit -m "refactor(api): retire the two legacy invoice pipelines"
```

---

### Task 8: Web — staff generate + consumer list

**Files:**
- Create: `apps/web/app/(portal)/invoices/page.tsx`
- Create: `apps/web/components/invoices-board.tsx`
- Create: `apps/web/app/(consumer)/consumer/invoices/page.tsx`
- Create: `apps/web/components/consumer-invoices-board.tsx`
- Create: `apps/web/lib/download-invoice.ts`
- Test: `apps/web/lib/download-invoice.test.ts`
- Modify: `apps/web/components/nav.tsx:73` (the dead `href: '#'`)
- Modify: `apps/web/components/consumer-nav.tsx` (add Invoices)
- Modify: `apps/web/components/ticket-board.tsx` (bulk "Generate invoice")
- Modify: `apps/web/components/consumer-ticket-board.tsx:151-176` + `:581-590` + `:928-932`
- Modify: `apps/web/components/finance-board.tsx:254-290, 782-786, 851-864` (drop invoice actions)

**Context you need.**
- **`nav.tsx:73` is `{ label: 'Invoices', href: '#', icon: FileText }`** — a real `<Link href="#">` that navigates nowhere. This task finally gives it `/invoices`.
- **`downloadTicketInvoice` (`consumer-ticket-board.tsx:151-176`) swallows failures with `console.error` at `:172`** — no toast, no user-visible error. Fix that while extracting it.
- **`finance-board.tsx:274` duplicates the base64→blob logic** instead of reusing the helper. Consolidate.
- The consumer button must render **only when the ticket is on an issued invoice** (spec Part 4). `findAll`/`findOne` must therefore expose the invoice linkage — add `invoiceItem: { select: { invoiceId: true, invoice: { select: { invoiceNo: true } } } }` to the ticket selects, and confirm it is **not** redacted for consumers (it's their own billing data).
- Jest here is `testEnvironment: 'node'` — no DOM. Test the pure helper only.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/download-invoice.test.ts`:

```ts
import { invoiceFilename, base64ToBlobParts } from './download-invoice';

describe('invoiceFilename', () => {
  it('names the file by invoice number', () => {
    expect(invoiceFilename('000348')).toBe('invoice-000348.pdf');
  });
});

describe('base64ToBlobParts', () => {
  it('decodes base64 into bytes', () => {
    const b64 = Buffer.from('%PDF-1.4').toString('base64');
    const bytes = base64ToBlobParts(b64);
    expect(Buffer.from(bytes).toString()).toBe('%PDF-1.4');
  });

  it('returns an empty array for empty input rather than throwing', () => {
    expect(base64ToBlobParts('').length).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @wusuq/web test -- download-invoice`
Expected: FAIL — `Cannot find module './download-invoice'`

- [ ] **Step 3: Implement the shared helper**

Create `apps/web/lib/download-invoice.ts`:

```ts
export function invoiceFilename(invoiceNo: string): string {
  return `invoice-${invoiceNo}.pdf`;
}

export function base64ToBlobParts(b64: string): Uint8Array {
  if (!b64) return new Uint8Array(0);
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
```

Add the browser-only download function in the same file (guard it so the Node test never runs it):

```ts
import { apiClient } from './api-client';

/**
 * Download an issued invoice. The single implementation — finance-board and
 * the consumer board both call this rather than re-rolling base64->blob.
 *
 * Throws on failure so the caller can surface a toast; the old
 * downloadTicketInvoice swallowed errors into console.error.
 */
export async function downloadInvoice(invoiceId: string, invoiceNo: string): Promise<void> {
  const b64 = await apiClient.getBlob(`/invoices/${invoiceId}/download`);
  const blob = new Blob([base64ToBlobParts(b64)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = invoiceFilename(invoiceNo);
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
```

Match `apiClient`'s actual blob method — check `apps/web/lib/api-client.ts`; WS-B's `DocumentPreview` uses `apiClient.getBlob`. If the response shape differs, adapt and note it.

- [ ] **Step 4: Point the dead nav item at the real route**

`apps/web/components/nav.tsx:73`:
```tsx
    { label: 'Invoices', href: '/invoices', icon: FileText },
```

- [ ] **Step 5: Build the staff board**

> **Implementer note:** Steps 5–8 are the least prescriptive in either plan. The UI here is conventional list/table work with no novel logic, and this codebase already has close templates — **read `apps/web/components/finance-board.tsx` and `consumer-ticket-board.tsx` first and mirror their structure, data-fetching, loading/empty states, and toast usage.** Do not invent a new pattern. If a decision feels load-bearing (e.g. the shape of `apiClient.getBlob`'s return), stop and ask rather than guessing.

Create `apps/web/components/invoices-board.tsx` — a client component listing `GET /invoices`:

| Column | Source |
|---|---|
| Invoice # | `invoiceNo` |
| Date | `issueDate`, `DD-MM-YYYY` (match the PDF) |
| Consumer | `consumer.name` / `consumer.email` |
| Items | `_count.items` |
| Total | `formatMoney(Number(grandTotal), toCurrency(currency))` |
| Status | `status` |
| — | Download button → `downloadInvoice(id, invoiceNo)` |

**Use `formatMoney` from `@wusuq/shared`, not hand-rolled `PKR ` string concatenation** — most staff boards still hand-roll PKR and would mislabel a USD invoice (known debt, CLAUDE.md). Do not add to it.

Wrap the download in try/catch and surface failures via the existing `useToast` (`components/ui/toast.tsx`).

Create `apps/web/app/(portal)/invoices/page.tsx`:
```tsx
import { InvoicesBoard } from '@/components/invoices-board';

export const metadata = { title: 'Invoices · Wusuq' };

export default function InvoicesPage() {
  return <InvoicesBoard />;
}
```

- [ ] **Step 6: Add "Generate invoice" to the ticket board**

In `apps/web/components/ticket-board.tsx`, add a bulk action that POSTs `{ ticketIds: selected }` to `/invoices`. Follow the existing `runBulkAction` pattern — **including its confirm dialog** (WS-G added confirmation naming the action + count) and its clearing of **both** `selected` and `pendingSelected`.

Gate the control on the actor holding `finance.write` — read the stored user's role and show it only for `super-admin`, since the endpoint rejects everyone else. Surface the server's 400/409 guard messages verbatim in a toast; they are written for the user ("Ticket 035210 is already on another invoice.").

- [ ] **Step 7: Consumer surfaces**

Create `apps/web/components/consumer-invoices-board.tsx` + `apps/web/app/(consumer)/consumer/invoices/page.tsx`, listing the consumer's own invoices with Download. Add `{ label: 'Invoices', href: '/consumer/invoices', icon: FileText }` to `consumer-nav.tsx`.

In `apps/web/components/consumer-ticket-board.tsx`: delete `downloadTicketInvoice` (`:151-176`) and rewire both call sites (`:581-590` card, `:928-932` detail) to `downloadInvoice(invoiceId, invoiceNo)` from the shared helper — **rendering the button only when `ticket.invoiceItem?.invoice?.invoiceNo` exists**. On failure, show a toast (the old code only logged).

- [ ] **Step 8: Strip the retired finance-board invoice UI**

In `apps/web/components/finance-board.tsx`, remove `generateInvoice` (`:254`), `sendInvoice` (`:264`), `downloadInvoice` (`:274`), the Invoice column (`:782-786`), the action row (`:851-864`), and the "Issued Invoices" stat (`:437`) — all call endpoints deleted in Task 7. **The "Send Invoice Email" button goes with them** (owner decision: hide it; the feature never existed).

Delete the dead `invoice: { invoiceNo, status } | null` field at `ticket-charges-board.tsx:36` — declared and never rendered.

- [ ] **Step 9: Verify**

```bash
pnpm --filter @wusuq/web test
pnpm --filter @wusuq/web typecheck
pnpm --filter @wusuq/web lint
pnpm --filter @wusuq/web build
grep -rn "tickets/.*\/invoice\|finance/.*invoice" apps/web/components apps/web/lib || echo "no stale invoice endpoints"
```
Expected: all green; grep prints `no stale invoice endpoints`.

- [ ] **Step 10: Commit**

```bash
git add -A apps/web
git commit -m "feat(web): invoice list + generate UI, retire per-ticket invoice download"
```

---

### Task 9: Apply the migration + end-to-end verification

**Files:** none — deploy + verification only.

**Context you need.** `prisma migrate dev` is **unusable** on this Neon DB: the applied migration `20260523090000_unified_ticket_status` was edited after apply, so `migrate dev` demands a full reset. Apply non-destructively, exactly as the D1/D3/E migrations were.

- [ ] **Step 1: Apply to Neon**

```bash
cd apps/api
npx prisma db execute --file prisma/migrations/20260716000000_unified_invoice/migration.sql --schema prisma/schema.prisma
npx prisma migrate resolve --applied 20260716000000_unified_invoice
npx prisma migrate status
```
Expected: `migrate status` reports up to date. **If it reports drift, STOP and report — do not reset.**

- [ ] **Step 2: Confirm the sequence exists**

```bash
npx prisma db execute --stdin --schema prisma/schema.prisma <<< "SELECT last_value FROM invoice_no_seq;"
```
Expected: succeeds (value 1).

- [ ] **Step 3: Full suite**

```bash
pnpm lint && pnpm typecheck && pnpm --filter @wusuq/api test && pnpm --filter @wusuq/web test && pnpm build
```
Expected: all green. Record actual counts.

- [ ] **Step 4: Drive it end-to-end**

```bash
pnpm dev
```

As **super-admin** (`superadmin@wusuq.com` / `password`):
1. `/tickets` — select 2+ tickets for the **same** consumer → Generate invoice → succeeds, returns a number like `000001`.
2. `/invoices` — the invoice is listed with the right item count and total.
3. Download it. Compare against `/Users/muhammadasad/Downloads/_Lower Court Paralegal Service_2026-06-28 (1).pdf`.
4. Select the **same** tickets again → Generate → expect a clean 409 "already on another invoice".
5. Select tickets from **two different consumers** → expect 400 "must belong to one consumer".

As a **consumer** (`testconsumer@wusuq.com` / `password123`):
6. `/consumer/invoices` — only their own invoices.
7. A ticket **on** an invoice shows Download; a ticket **not** on one shows no button.

**IDOR check** — as a **representative**, with an invoice id from step 2:
```bash
curl -i -H "Authorization: Bearer <REP_TOKEN>" http://localhost:4000/api/invoices/<INVOICE_ID>/download
```
Expected: **404** (not 403, not 200). **If this returns 200, STOP — that is the 3.1-class IDOR and it is a release blocker.**

- [ ] **Step 5: Report**

Report: actual test counts and the delta vs the 495/61 baseline; the migration status output; every check above with its real result; and a side-by-side judgement of the PDF against the owner's sample. **Do not claim completion without having run these.**
