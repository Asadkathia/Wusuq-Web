# Workstream B — Documents, Deliverables & Hearings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix consumer document download/visibility, add an inline document viewer, reconcile the next-hearing date, let clerks upload after submitting costs, and ship a consumer-safe downloadable invoice.

**Architecture:** Mostly localized fixes: a consumer visibility filter on the `/documents` endpoints (B1/B2); a `scheduledDate` option threaded into `buildCaseView` + a dashboard query fix (B3); a frontend gating change (B10); and a new consumer-safe pdfkit invoice builder + ownership-scoped endpoint (C14). Plus a new `<DocumentPreview>` component wired into three surfaces (B1 viewer). No schema changes.

**Tech Stack:** NestJS/Prisma (`apps/api`), Next.js 16/React 19 (`apps/web`), pdfkit (already a dep); Jest (API + web unit), Playwright (e2e).

**Spec:** `DOcs/superpowers/specs/2026-07-06-workstream-b-documents-hearings-design.md`.

## Global Constraints

- **Clerk cost is internal-only** — the consumer invoice must NEVER include clerk cost / clerk earnings.
- **Consumer document visibility gate** = `visibleToConsumer === true` AND ticket `status ∈ {COMPLETED, DELIVERED}` — identical to `redactTicketForConsumer` (`tickets.service.ts:553-560`). Staff callers are unfiltered.
- **Phase-2 charge lines** (delivery/printing/attested/non-attested/additional) appear on the consumer invoice ONLY when `remainderFinalizedAt` is set (WS-A B4 gating); Service + Tax always.
- **`computeTicketTotal` / `Ticket.totalAmount`** is the single source for the invoice Total; tax is base-only (WS-A C1).
- **Clerk-set `Ticket.scheduledDate` wins** for "next hearing", falling back to intake `formPayload.future_date`.
- Ownership check on the invoice endpoint mirrors `resolveDocumentDownload` (consumer owns the ticket, else staff).
- Run `pnpm typecheck` + `pnpm lint` (both apps) and relevant tests before each commit. React 19 set-state-in-effect → `startTransition`. Commit messages end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File Structure

- **Modify** `apps/api/src/documents/documents.service.ts` + `documents.controller.ts` — consumer visibility filter (B1/B2).
- **Modify** `apps/api/src/tickets/tickets.controller.ts` — stream `.on('error')` (B1) + new `GET :id/invoice` route (C14).
- **Create** `apps/api/src/tickets/consumer-invoice.pdf.ts` — pure line-item assembler + pdfkit renderer (C14).
- **Modify** `apps/api/src/tickets/tickets.service.ts` — `buildConsumerInvoice(ticketId, caller)` method (C14).
- **Modify** `apps/api/src/dashboard/dashboard.service.ts` — drop `caseId` filter (B3).
- **Modify** `apps/web/lib/case-view.ts` — `buildCaseView` scheduledDate opt (B3).
- **Create** `apps/web/components/document-preview.tsx` — inline PDF/image viewer (B1).
- **Modify** `apps/web/components/consumer-ticket-board.tsx`, `consumer-documents-board.tsx`, `ticket-detail-panel.tsx`, `ticket-board.tsx` — wiring (B3, C14, B1, B10).

Tasks are ordered so the two API-heavy independent pieces (documents filter; invoice) and the FE pieces are separable and file-disjoint for parallel waves.

---

### Task 1: Consumer document visibility filter (B1 + B2)

**Files:**
- Modify: `apps/api/src/documents/documents.service.ts` (`list`, `export`)
- Modify: `apps/api/src/documents/documents.controller.ts` (pass caller role)
- Test: `apps/api/src/documents/documents.visibility.spec.ts`

**Interfaces:**
- Produces: `DocumentsService.list(filters, opts?: { forConsumer?: boolean })` and `export(...)` — when `forConsumer`, return only `TicketDocument`s with `visibleToConsumer: true` whose ticket `status ∈ {COMPLETED, DELIVERED}`.

- [ ] **Step 1: Write the failing test** — mock prisma; assert a consumer-scoped `list` excludes a `visibleToConsumer:false` doc and a doc on an `IN_PROGRESS` ticket, and includes a visible doc on a COMPLETED ticket; a staff call returns all. (Follow the inline-mock pattern in existing `apps/api/src/**/*.spec.ts`.)

```ts
// apps/api/src/documents/documents.visibility.spec.ts
import { DocumentsService } from './documents.service';

function svc(rows: any[]) {
  const prisma = { ticketDocument: { findMany: jest.fn(async ({ where }: any) => rows.filter((r) => {
    if (where?.visibleToConsumer !== undefined && r.visibleToConsumer !== where.visibleToConsumer) return false;
    if (where?.ticket?.status?.in && !where.ticket.status.in.includes(r.ticket.status)) return false;
    return true;
  })) } } as any;
  return new DocumentsService(prisma);
}
const rows = [
  { id: 'd1', visibleToConsumer: true, ticket: { status: 'COMPLETED' } },
  { id: 'd2', visibleToConsumer: false, ticket: { status: 'COMPLETED' } },
  { id: 'd3', visibleToConsumer: true, ticket: { status: 'IN_PROGRESS' } },
];
describe('DocumentsService consumer visibility (B1/B2)', () => {
  it('consumer sees only visible docs on completed/delivered tickets', async () => {
    const out = await svc(rows).list({ consumerId: 'c1' }, { forConsumer: true });
    expect(out.map((d: any) => d.id)).toEqual(['d1']);
  });
  it('staff sees all', async () => {
    const out = await svc(rows).list({ consumerId: 'c1' });
    expect(out.map((d: any) => d.id).sort()).toEqual(['d1', 'd2', 'd3']);
  });
});
```

(Read the real `DocumentsService.list` signature first and adapt the mock to its actual prisma query shape and return type — the test asserts the filtering behavior, not the exact query object.)

- [ ] **Step 2: Run → FAIL** (`cd apps/api && pnpm test -- --testPathPatterns=documents.visibility`).
- [ ] **Step 3: Implement** — add an `opts?: { forConsumer?: boolean }` param to `list` and `export`; when `forConsumer`, add `visibleToConsumer: true` and `ticket: { status: { in: ['COMPLETED','DELIVERED'] } }` to the `where`. In `documents.controller.ts`, derive `forConsumer = isConsumerRole(user.role)` (import `isConsumerRole` from `@wusuq/shared`) and pass it. Keep staff behavior unchanged.
- [ ] **Step 4: Run → PASS**, then full API suite (`cd apps/api && pnpm test`), `pnpm typecheck`.
- [ ] **Step 5: Commit** — `fix(documents): consumer list/export only returns downloadable deliverables (B1/B2)`.

---

### Task 2: Stream error handling on document download (B1)

**Files:**
- Modify: `apps/api/src/tickets/tickets.controller.ts` (the two `createReadStream(...).pipe(res)` sites, ~654 and ~679)

- [ ] **Step 1: Implement** — wrap each stream:

```ts
const stream = createReadStream(filePath);
stream.on('error', () => {
  if (!res.headersSent) res.status(404).json({ statusCode: 404, message: 'File not found' });
  else res.destroy();
});
stream.pipe(res);
```

- [ ] **Step 2: Typecheck** (`cd apps/api && pnpm typecheck`) — no test (integration-level; verified manually via a missing file). Confirm both download handlers use the guarded stream.
- [ ] **Step 3: Commit** — `fix(tickets): return 404 (not an unhandled stream error) when a document file is missing (B1)`.

---

### Task 3: Consumer-safe invoice PDF builder (C14) — pure assembler + renderer

**Files:**
- Create: `apps/api/src/tickets/consumer-invoice.pdf.ts`
- Test: `apps/api/src/tickets/consumer-invoice.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ConsumerInvoiceInput {
    batchNo: string; status: string;
    consumer: { name?: string | null; email?: string | null };
    serviceCost: number; additionalServiceCost: number;
    deliveryCharges: number; printingCharges: number; attestedCharges: number;
    nonAttestedCharges: number; additionalCharges: number;
    discountPrice: number; promoDiscount: number; taxAmount: number; taxRate: number;
    totalAmount: number; amountPaid: number; currency: 'PKR' | 'USD';
    remainderFinalizedAt?: string | null;
    payment?: { bankName?: string|null; accountTitle?: string|null; accountNumber?: string|null; iban?: string|null; jazzCash?: string|null; easyPaisa?: string|null } | null;
  }
  // Pure — returns the consumer-safe line items (NO clerk cost); phase-2 lines only when finalized.
  export function consumerInvoiceLineItems(i: ConsumerInvoiceInput): Array<{ label: string; amount: number }>;
  // Renders the PDF to a base64 string using pdfkit.
  export function renderConsumerInvoicePdf(i: ConsumerInvoiceInput): Promise<string>;
  ```

- [ ] **Step 1: Write the failing test** (pure line-item assembly — the load-bearing, testable part):

```ts
// apps/api/src/tickets/consumer-invoice.spec.ts
import { consumerInvoiceLineItems } from './consumer-invoice.pdf';

const base = {
  batchNo: 'TKT-1', status: 'COMPLETED', consumer: { name: 'A', email: 'a@x.com' },
  serviceCost: 500, additionalServiceCost: 0, deliveryCharges: 300, printingCharges: 50,
  attestedCharges: 0, nonAttestedCharges: 0, additionalCharges: 0,
  discountPrice: 0, promoDiscount: 0, taxAmount: 85, taxRate: 0.17,
  totalAmount: 935, amountPaid: 0, currency: 'PKR' as const, remainderFinalizedAt: '2026-07-06',
};

describe('consumerInvoiceLineItems (C14)', () => {
  it('never includes clerk cost, includes tax', () => {
    const labels = consumerInvoiceLineItems(base).map((r) => r.label.toLowerCase());
    expect(labels.some((l) => l.includes('clerk'))).toBe(false);
    expect(labels.some((l) => l.includes('tax'))).toBe(true);
    expect(labels).toEqual(expect.arrayContaining(['service', 'delivery', 'printing']));
  });
  it('hides phase-2 lines until finalized', () => {
    const rows = consumerInvoiceLineItems({ ...base, remainderFinalizedAt: null });
    const labels = rows.map((r) => r.label.toLowerCase());
    expect(labels).toEqual(expect.arrayContaining(['service']));
    expect(labels.some((l) => l.includes('delivery') || l.includes('printing'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** `consumer-invoice.pdf.ts`:

```ts
import PDFDocument from 'pdfkit';

export interface ConsumerInvoiceInput { /* …as in Interfaces above… */ }

const money = (n: number, c: 'PKR' | 'USD') =>
  c === 'USD' ? `$${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : `PKR ${Math.round(n).toLocaleString()}`;

export function consumerInvoiceLineItems(i: ConsumerInvoiceInput): Array<{ label: string; amount: number }> {
  const rows: Array<{ label: string; amount: number }> = [];
  const serviceBase = Number(i.serviceCost) + Number(i.additionalServiceCost);
  if (serviceBase) rows.push({ label: 'Service', amount: serviceBase });
  if (i.remainderFinalizedAt) {
    for (const [label, amt] of [
      ['Delivery', i.deliveryCharges], ['Printing', i.printingCharges],
      ['Attested', i.attestedCharges], ['Non-attested', i.nonAttestedCharges],
      ['Additional', i.additionalCharges],
    ] as Array<[string, number]>) if (Number(amt)) rows.push({ label, amount: Number(amt) });
  }
  const discount = Number(i.discountPrice) + Number(i.promoDiscount);
  if (discount) rows.push({ label: 'Discount', amount: -discount });
  if (Number(i.taxAmount)) rows.push({ label: `Tax (${Math.round(i.taxRate * 100)}%)`, amount: Number(i.taxAmount) });
  return rows;
}

export function renderConsumerInvoicePdf(i: ConsumerInvoiceInput): Promise<string> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
    doc.on('error', reject);
    doc.fontSize(20).text('Wusuq', { continued: false });
    doc.fontSize(10).fillColor('#555').text(`Invoice ${i.batchNo}`).text(`Status: ${i.status}`).moveDown();
    doc.fillColor('#000').fontSize(11).text(`Bill to: ${i.consumer.name ?? ''}`).text(i.consumer.email ?? '').moveDown();
    for (const row of consumerInvoiceLineItems(i)) {
      doc.text(row.label, { continued: true }).text(money(row.amount, i.currency), { align: 'right' });
    }
    doc.moveDown();
    doc.font('Helvetica-Bold').text('Total', { continued: true }).text(money(i.totalAmount, i.currency), { align: 'right' });
    doc.font('Helvetica').text('Paid', { continued: true }).text(money(i.amountPaid, i.currency), { align: 'right' });
    doc.text('Due', { continued: true }).text(money(Math.max(0, i.totalAmount - i.amountPaid), i.currency), { align: 'right' });
    if (i.payment) {
      doc.moveDown().fontSize(9).fillColor('#555').text('Payment details:');
      if (i.payment.bankName) doc.text(`Bank: ${i.payment.bankName} — ${i.payment.accountTitle ?? ''} — ${i.payment.accountNumber ?? ''}`);
      if (i.payment.iban) doc.text(`IBAN: ${i.payment.iban}`);
      if (i.payment.jazzCash) doc.text(`JazzCash: ${i.payment.jazzCash}`);
      if (i.payment.easyPaisa) doc.text(`EasyPaisa: ${i.payment.easyPaisa}`);
    }
    doc.end();
  });
}
```

- [ ] **Step 4: Run → PASS**, `pnpm typecheck`.
- [ ] **Step 5: Commit** — `feat(tickets): consumer-safe invoice PDF builder (no clerk cost, tax included) (C14)`.

---

### Task 4: Invoice service method + endpoint (C14)

**Files:**
- Modify: `apps/api/src/tickets/tickets.service.ts` (add `buildConsumerInvoice`)
- Modify: `apps/api/src/tickets/tickets.controller.ts` (add `GET :id/invoice`)
- Test: `apps/api/src/tickets/consumer-invoice-endpoint.spec.ts`

**Interfaces:**
- Consumes: `renderConsumerInvoicePdf`, `ConsumerInvoiceInput` (Task 3); `SettingsService`/`paymentSettings` singleton for payment block.
- Produces: `TicketsService.buildConsumerInvoice(ticketId, caller): Promise<{ filename: string; contentType: 'application/pdf'; content: string }>` — throws `NotFoundException` if a consumer requests a foreign ticket (mirror `resolveDocumentDownload` ownership).

- [ ] **Step 1: Write the failing test** — a consumer requesting their own ticket gets `{ contentType: 'application/pdf', content: <base64> }`; a consumer requesting a foreign ticket throws NotFound. (Inline prisma mock like the other ticket specs; the ticket has serviceCost/charges/totalAmount and a consumerId.)
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** `buildConsumerInvoice(ticketId, caller)`: load the ticket (+ consumer + payment settings); if `isConsumerRole(caller.role)` and `ticket.consumerId !== caller.userId` → `NotFoundException` (probe-proof, matches CLAUDE.md consumer 404). Map the ticket columns into `ConsumerInvoiceInput` (drop clerkCost), call `renderConsumerInvoicePdf`, return `{ filename: \`invoice-${ticket.batchNo}.pdf\`, contentType: 'application/pdf', content }`. Add the controller route:

```ts
@RequirePermissions('tickets.read')
@Get(':id/invoice')
async downloadInvoice(@Param('id') id: string, @CurrentUser() user: JwtUser | undefined) {
  return this.ticketsService.buildConsumerInvoice(id, { role: user!.role, userId: user!.sub });
}
```

- [ ] **Step 4: Run → PASS**, full API suite, `pnpm typecheck`.
- [ ] **Step 5: Commit** — `feat(tickets): GET :id/invoice — consumer-safe downloadable invoice (C14)`.

---

### Task 5: Hearings — buildCaseView scheduledDate + dashboard query (B3)

**Files:**
- Modify: `apps/web/lib/case-view.ts` (`buildCaseView`, `hearingsOf`)
- Modify: `apps/api/src/dashboard/dashboard.service.ts` (~87-99)
- Test: `apps/web/lib/case-view.test.ts` (extend); `apps/api/src/dashboard/*.spec.ts` (extend or new)

**Interfaces:**
- Produces: `buildCaseView(payload, tier, opts?: { scheduledDate?: string | null })` — `hearings.next` prefers `opts.scheduledDate` over `payload.future_date`.

- [ ] **Step 1: Web test** — `buildCaseView(p, 'lower', { scheduledDate: '2026-07-17' })` → `hearings.next === '2026-07-17'` even when `p.future_date === '2026-07-03'`; with no `scheduledDate`, next falls back to `future_date`.
- [ ] **Step 2: Run → FAIL** (`cd apps/web && pnpm test -- case-view`).
- [ ] **Step 3: Implement** — add the `opts` param; in `hearingsOf` compute `next = (opts?.scheduledDate ?? '').trim() || val(p, 'future_date')` (remove the dead `'scheduledDate'` payload fallback from the `val` call). Update the 3 call sites (`consumer-ticket-board.tsx`, `ticket-detail-panel.tsx` clerk + admin) to pass `{ scheduledDate: ticket.scheduledDate }`.
- [ ] **Step 4: Dashboard** — in `dashboard.service.ts` next-hearing query, delete `caseId: { not: null }`; keep `consumerId` + `scheduledDate: { gte: now }`, `orderBy scheduledDate asc`. Make the `case` select optional (title may be null); if the widget needs a title, fall back to the ticket's service/case label. Add/extend an API test asserting a `caseId: null` ticket with a future `scheduledDate` is now returned.
- [ ] **Step 5: Run web + api tests → PASS**, typecheck both.
- [ ] **Step 6: Commit** — `fix(hearings): case card + dashboard read clerk-set scheduledDate; drop caseId filter (B3)`.

---

### Task 6: Clerk upload under WAITING_APPROVAL (B10)

**Files:**
- Modify: `apps/web/components/ticket-board.tsx` (~1104-1123)

- [ ] **Step 1: Implement** — extend the upload-button gate so "Upload Work Documents" renders when `status === 'IN_PROGRESS' || status === 'WAITING_APPROVAL'` (keep "Update Payments" / "Submit to Admin" gating as-is). Read the exact JSX first; the cleanest change is to lift the `Upload Work Documents` button out of the `IN_PROGRESS`-only block into a shared `(status === 'IN_PROGRESS' || status === 'WAITING_APPROVAL')` condition.
- [ ] **Step 2: Typecheck + lint** (`cd apps/web && pnpm typecheck && pnpm lint`).
- [ ] **Step 3: Commit** — `fix(clerk): allow uploading work documents while WAITING_APPROVAL (B10)`.

---

### Task 7: Inline document viewer component (B1)

**Files:**
- Create: `apps/web/components/document-preview.tsx`
- Test: `apps/web/components/document-preview.test.tsx` (pure helper only; render deferred to e2e)

**Interfaces:**
- Consumes: `apiClient.getBlob(url)` (existing).
- Produces:
  ```ts
  export function previewKind(nameOrType: string): 'pdf' | 'image' | 'other';
  export function DocumentPreview(props: { url: string; name: string; onClose: () => void }): JSX.Element;
  ```

- [ ] **Step 1: Test the pure helper** — `previewKind('x.pdf')==='pdf'`, `previewKind('application/pdf')==='pdf'`, `previewKind('a.png')==='image'`, `previewKind('image/jpeg')==='image'`, `previewKind('a.docx')==='other'`.
- [ ] **Step 2: Run → FAIL** (`cd apps/web && pnpm test -- document-preview`).
- [ ] **Step 3: Implement** — `previewKind` (branch on extension/content-type). `DocumentPreview` is a modal: on mount, `startTransition`-guard a fetch of `apiClient.getBlob(url)` → `URL.createObjectURL(blob)`; render `<iframe src={objectUrl}>` for pdf, `<img src={objectUrl}>` for image, and a "Download" link + "This file type can't be previewed" for other; revoke the object URL on unmount; show a loading + error state. Follow the codebase's existing modal/dialog styling.
- [ ] **Step 4: Run helper test → PASS**, typecheck + lint.
- [ ] **Step 5: Commit** — `feat(documents): inline PDF/image DocumentPreview component (B1)`.

---

### Task 8: Wire viewer + Download-invoice into the surfaces (B1 + C14)

**Files:**
- Modify: `apps/web/components/consumer-ticket-board.tsx` (viewer on Documents section + "Download invoice" button)
- Modify: `apps/web/components/consumer-documents-board.tsx` (viewer on each row)
- Modify: `apps/web/components/ticket-detail-panel.tsx` (viewer on admin documents)
- Test: `apps/web/tests/e2e/documents-invoice.spec.ts` (mock-API pattern)

**Interfaces:**
- Consumes: `DocumentPreview`, `previewKind` (Task 7); `GET /tickets/:id/invoice` (Task 4).

- [ ] **Step 1: Consumer ticket detail** — next to each document's Download, add a "Preview" action that opens `<DocumentPreview url={downloadUrl} name={doc.name} />`. Add a "Download invoice" button (in the charges/actions area) that `apiClient.getBlob('/tickets/${ticket.id}/invoice')` (or the base64 shape — match how finance-board downloads) → triggers a client download.
- [ ] **Step 2: My Documents** — add the same "Preview" action per row (`consumer-documents-board.tsx`), reusing `DocumentPreview`.
- [ ] **Step 3: Admin panel** — add "Preview" beside the existing document download in `ticket-detail-panel.tsx`.
- [ ] **Step 4: Typecheck + lint** (`cd apps/web && pnpm typecheck && pnpm lint`).
- [ ] **Step 5: e2e** — mirror `tests/e2e/pricing-tax-promo.spec.ts`: mock `GET /tickets/tkt-1/invoice` → a base64 PDF, click "Download invoice", assert the request fired; mock a document blob + assert clicking Preview opens an iframe/img. `test.fixme` any deep-nav part that needs a live route (accepted gap).
- [ ] **Step 6: Commit** — `feat(documents): preview + download-invoice wired into consumer & admin surfaces (B1, C14)`.

---

## Self-Review

**Spec coverage:** B1 → Tasks 1 (filter), 2 (stream 404), 7+8 (viewer); B2 → Task 1; B3 → Task 5; B10 → Task 6; C14 → Tasks 3 (builder), 4 (endpoint), 8 (button). All mapped. The three confirmed decisions (on-the-fly invoice, inline viewer, clerk-date-wins) are in Global Constraints + the relevant tasks.

**Placeholder scan:** every code step has real code; the "read the real signature/JSX first" notes are explicit verification steps against named existing code, not TODOs.

**Type consistency:** `ConsumerInvoiceInput`/`consumerInvoiceLineItems`/`renderConsumerInvoicePdf` defined in Task 3, consumed in Task 4. `buildConsumerInvoice` return shape defined in Task 4, consumed in Task 8. `buildCaseView(payload, tier, opts)` defined in Task 5, used by its call sites. `previewKind`/`DocumentPreview` defined in Task 7, consumed in Task 8. `DocumentsService.list(..., opts)` defined in Task 1.

## Parallelization (for subagent-driven execution)
- **Wave 1 (file-disjoint):** Task 1 (documents.service/controller) · Task 3 (new invoice pdf file) · Task 5 (case-view + dashboard) · Task 6 (ticket-board) · Task 7 (new document-preview file). Task 2 (tickets.controller stream) can fold into whichever wave, but note Task 4 also edits tickets.controller — so **do Task 2 + Task 4 together, after Task 3**, in a second wave, and keep them off Task 1's files.
- **Wave 2:** Task 2 + Task 4 (both touch tickets.controller/service; one agent).
- **Wave 3:** Task 8 (wires Tasks 4 + 7 into consumer-ticket-board/consumer-documents-board/ticket-detail-panel) — after Waves 1-2 merged.

## Verification (end-to-end)
1. `cd apps/api && pnpm test` + `cd apps/web && pnpm test` green.
2. `pnpm --filter @wusuq/shared build && (cd apps/api && pnpm typecheck) && (cd apps/web && pnpm typecheck && pnpm lint)` clean.
3. Manual: consumer on a COMPLETED ticket previews + downloads a deliverable (no "Download failed"), downloads an invoice (no clerk cost, tax shown); clerk uploads a doc while WAITING_APPROVAL; dashboard shows the next hearing after `recordNextHearing`.
