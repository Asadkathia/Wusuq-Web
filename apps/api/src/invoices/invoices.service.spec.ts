import { jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InvoicesService } from './invoices.service';

type Ticket = Record<string, unknown>;

const ticket = (over: Partial<Ticket> = {}): Ticket => ({
  id: 't1',
  batchNo: '035210',
  consumerId: 'c1',
  currency: 'PKR',
  archivedAt: null,
  // A status past the clerk-review gate, and a finalized remainder — i.e. an
  // ordinary "safe to invoice" ticket. Tests for blocker 1 (unapproved
  // phase-2 charges / WAITING_APPROVAL) explicitly override both.
  status: 'DELIVERED',
  remainderFinalizedAt: new Date('2026-01-01T00:00:00Z'),
  intakeFlow: 'judicial_case_files',
  formPayload: {},
  serviceCost: 2500,
  additionalServiceCost: 0,
  printingCharges: 2450,
  attestedCharges: 0,
  nonAttestedCharges: 0,
  deliveryCharges: 0,
  additionalCharges: 0,
  discountPrice: 0,
  promoDiscount: 0,
  // Stamped tax rate (blocker 2) — 0 by default so tests that don't care
  // about tax get taxAmount 0 without needing to pass anything.
  taxRate: 0,
  service: { name: 'Case Files Lower Court 2025' },
  invoiceItem: null,
  ...over,
});

function makeService(tickets: Ticket[]) {
  const created: Record<string, unknown>[] = [];
  // `tx` and `prisma` are two DISTINCT mock objects, each with their OWN
  // jest.fn instances (never spread/shared) — this is what lets a test tell
  // "drew the sequence from the transaction client" apart from "drew it from
  // the top-level client outside the transaction". A prior version built
  // `prisma` as `{ ...tx, $transaction: ... }`, which made e.g.
  // `tx.$queryRawUnsafe` and `prisma.$queryRawUnsafe` the SAME jest.fn
  // reference, so an assertion on either was meaningless — a regression that
  // called `this.prisma.$queryRawUnsafe` from OUTSIDE the transaction still
  // made every assertion pass.
  const tx = {
    ticket: { findMany: jest.fn(() => Promise.resolve(tickets)) },
    invoice: {
      create: jest.fn((a: { data: Record<string, unknown> }) => {
        created.push(a.data);
        return Promise.resolve({ id: 'inv1', invoiceNo: a.data.invoiceNo });
      }),
    },
    $queryRawUnsafe: jest.fn(() => Promise.resolve([{ nextval: 348n }])),
  };
  const prisma = {
    ticket: {
      // Used only by the P2002-conflict catch path, to name the ticket that
      // lost the race. Defaults to "no match found" for tests that never hit
      // that path. Real code never calls `this.prisma.ticket.findMany` — the
      // main lookup always runs as `tx.ticket.findMany` inside the
      // transaction.
      findFirst: jest.fn(() => Promise.resolve(null)),
    },
    invoice: { create: jest.fn() },
    // A separate jest.fn from tx.$queryRawUnsafe above. Real code must NEVER
    // call this one — nextval has to be drawn inside the transaction.
    $queryRawUnsafe: jest.fn(() => Promise.resolve([{ nextval: 1n }])),
    $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
  const auditLogsService = {
    create: jest.fn(() => Promise.resolve(undefined)),
  };
  return {
    svc: new InvoicesService(prisma as never, auditLogsService as never),
    created,
    prisma,
    tx,
    auditLogsService,
  };
}

const STAFF = { sub: 'admin1', role: 'super-admin' } as never;

describe('InvoicesService.generate guards', () => {
  it('rejects an empty selection', async () => {
    const { svc } = makeService([]);
    await expect(svc.generate([], 'admin1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects tickets from more than one consumer', async () => {
    const { svc } = makeService([
      ticket(),
      ticket({ id: 't2', consumerId: 'c2' }),
    ]);
    await expect(svc.generate(['t1', 't2'], 'admin1')).rejects.toThrow(
      /one consumer/i,
    );
  });

  it('rejects mixed currency (PKR and USD cannot sum)', async () => {
    const { svc } = makeService([
      ticket(),
      ticket({ id: 't2', currency: 'USD' }),
    ]);
    await expect(svc.generate(['t1', 't2'], 'admin1')).rejects.toThrow(
      /currency/i,
    );
  });

  it('rejects a ticket already on another invoice', async () => {
    const { svc } = makeService([
      ticket({ invoiceItem: { invoiceId: 'inv-old' } }),
    ]);
    await expect(svc.generate(['t1'], 'admin1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects an archived ticket', async () => {
    const { svc } = makeService([ticket({ archivedAt: new Date() })]);
    await expect(svc.generate(['t1'], 'admin1')).rejects.toThrow(/archived/i);
  });

  it('rejects when a requested id does not exist', async () => {
    const { svc } = makeService([ticket()]);
    await expect(
      svc.generate(['t1', 'missing'], 'admin1'),
    ).rejects.toBeInstanceOf(NotFoundException);
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
    // `tx` and `prisma` are distinct jest.fn instances (see makeService) —
    // this pair of assertions actually distinguishes "drew nextval from the
    // transaction client" from "drew it from the top-level client outside
    // the transaction", which the pre-fix mock could not.
    expect(tx.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(
      `SELECT nextval('invoice_no_seq')`,
    );
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('snapshots the line items onto the invoice', async () => {
    const { svc, created } = makeService([ticket()]);
    await svc.generate(['t1'], 'admin1');
    const items = (created[0].items as { create: Record<string, unknown>[] })
      .create;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      ticketId: 't1',
      batchNo: '035210',
      position: 1,
      serviceCost: 2500,
      printing: 2450,
      lineTotal: 4950,
    });
  });

  it('snapshots the tax rate and currency', async () => {
    const { svc, created } = makeService([ticket({ taxRate: 0.17 })]);
    await svc.generate(['t1'], 'admin1');
    expect(created[0]).toMatchObject({
      currency: 'PKR',
      taxRate: 0.17,
      taxAmount: 425,
      grandTotal: 5375,
    });
  });

  it('never writes clerkCost onto the invoice', async () => {
    const { svc, created } = makeService([ticket({ clerkCost: 999 })]);
    await svc.generate(['t1'], 'admin1');
    expect(JSON.stringify(created[0])).not.toContain('999');
    expect(JSON.stringify(created[0]).toLowerCase()).not.toContain('clerk');
  });

  it('writes an INVOICE_GENERATED audit row for the issuing actor, AFTER the invoice is created', async () => {
    const { svc, auditLogsService } = makeService([ticket({ taxRate: 0.17 })]);
    const out = await svc.generate(['t1'], 'admin1');

    expect(auditLogsService.create).toHaveBeenCalledTimes(1);
    expect(auditLogsService.create).toHaveBeenCalledWith({
      action: 'INVOICE_GENERATED',
      entity: 'INVOICE',
      entityId: out.id,
      actorUserId: 'admin1',
      metadata: {
        invoiceNo: out.invoiceNo,
        ticketIds: ['t1'],
        consumerId: 'c1',
        currency: 'PKR',
        grandTotal: 5375,
      },
    });
  });

  it('does not let clerkCost leak into the audit metadata either', async () => {
    const { svc, auditLogsService } = makeService([ticket({ clerkCost: 999 })]);
    await svc.generate(['t1'], 'admin1');
    const call = auditLogsService.create.mock.calls[0]?.[0];
    expect(JSON.stringify(call).toLowerCase()).not.toContain('clerk');
  });
});

describe('InvoicesService.generate — concurrent double-generate (P2002 race)', () => {
  // Two racing `generate(['t1'])` calls can both pass the up-front `already`
  // guard under READ COMMITTED (both see invoiceItem: null before either
  // commits); the second `tx.invoice.create` then hits the real
  // `InvoiceItem.ticketId @unique` constraint and Prisma throws P2002. The
  // service must convert that into the same ConflictException the up-front
  // guard throws, not let it surface as a raw 500.
  const ticketIdP2002 = new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed on the fields: (`ticketId`)',
    { code: 'P2002', clientVersion: 'test', meta: { target: ['ticketId'] } },
  );

  it('converts a P2002 on InvoiceItem.ticketId into a ConflictException, not a raw 500', async () => {
    const { svc, tx } = makeService([ticket()]);
    tx.invoice.create.mockImplementationOnce(() =>
      Promise.reject(ticketIdP2002),
    );
    await expect(svc.generate(['t1'], 'admin1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('does not write an audit row when the invoice was never created (rolled back)', async () => {
    const { svc, tx, auditLogsService } = makeService([ticket()]);
    tx.invoice.create.mockImplementationOnce(() =>
      Promise.reject(ticketIdP2002),
    );
    await expect(svc.generate(['t1'], 'admin1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(auditLogsService.create).not.toHaveBeenCalled();
  });

  it('names the conflicting ticket by batchNo when it can find one', async () => {
    const { svc, tx, prisma } = makeService([ticket()]);
    tx.invoice.create.mockImplementationOnce(() =>
      Promise.reject(ticketIdP2002),
    );
    prisma.ticket.findFirst.mockImplementationOnce(() =>
      Promise.resolve({ batchNo: '035210' }),
    );
    await expect(svc.generate(['t1'], 'admin1')).rejects.toThrow(
      /035210.*already on another invoice/i,
    );
  });

  it('does NOT swallow an unrelated P2002 (e.g. a different unique constraint) — real bugs still surface', async () => {
    const { svc, tx } = makeService([ticket()]);
    const otherConstraint = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`invoiceNo`)',
      { code: 'P2002', clientVersion: 'test', meta: { target: ['invoiceNo'] } },
    );
    tx.invoice.create.mockImplementationOnce(() =>
      Promise.reject(otherConstraint),
    );
    await expect(svc.generate(['t1'], 'admin1')).rejects.toBe(otherConstraint);
  });

  it('keeps the up-front guard for the common (non-racing) case — no DB round trip needed', async () => {
    const { svc, tx, prisma } = makeService([
      ticket({ invoiceItem: { invoiceId: 'inv-old' } }),
    ]);
    await expect(svc.generate(['t1'], 'admin1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.invoice.create).not.toHaveBeenCalled();
    expect(prisma.ticket.findFirst).not.toHaveBeenCalled();
  });
});

describe('InvoicesService.generate — blocker 1: unapproved phase-2 charges', () => {
  it("zeroes the clerk's unapproved phase-2 columns when remainderFinalizedAt is null — bills the phase-1 base only", async () => {
    const { svc, created } = makeService([
      ticket({
        status: 'IN_PROGRESS',
        remainderFinalizedAt: null,
        printingCharges: 8000,
        attestedCharges: 1000,
        nonAttestedCharges: 500,
        deliveryCharges: 800,
        additionalCharges: 200,
      }),
    ]);
    await svc.generate(['t1'], 'admin1');
    const items = (created[0].items as { create: Record<string, unknown>[] })
      .create;
    expect(items[0]).toMatchObject({
      serviceCost: 2500,
      printing: 0,
      attested: 0,
      nonAttested: 0,
      delivery: 0,
      additional: 0,
      lineTotal: 2500,
    });
    expect(created[0]).toMatchObject({ subtotal: 2500, grandTotal: 2500 });
  });

  it('bills the full phase-2 charges once the admin has finalized (remainderFinalizedAt set)', async () => {
    const { svc, created } = makeService([
      ticket({
        remainderFinalizedAt: new Date('2026-02-01T00:00:00Z'),
        printingCharges: 8000,
        attestedCharges: 1000,
      }),
    ]);
    await svc.generate(['t1'], 'admin1');
    const items = (created[0].items as { create: Record<string, unknown>[] })
      .create;
    expect(items[0]).toMatchObject({
      serviceCost: 2500,
      printing: 8000,
      attested: 1000,
      lineTotal: 11500,
    });
  });

  it('rejects invoicing a WAITING_APPROVAL ticket outright — once invoiced a ticket can never be re-invoiced for the eventual phase-2 remainder', async () => {
    const { svc, tx } = makeService([
      ticket({ status: 'WAITING_APPROVAL', remainderFinalizedAt: null }),
    ]);
    await expect(svc.generate(['t1'], 'admin1')).rejects.toThrow(
      /WAITING_APPROVAL/,
    );
    expect(tx.invoice.create).not.toHaveBeenCalled();
  });
});

describe('InvoicesService.generate — blocker 2: bills the stamped tax rate, not the live setting', () => {
  it("bills the ticket's own stamped taxRate", async () => {
    const { svc, created } = makeService([ticket({ taxRate: 0.17 })]);
    await svc.generate(['t1'], 'admin1');
    expect(created[0]).toMatchObject({
      taxRate: 0.17,
      taxAmount: 425,
      grandTotal: 5375,
    });
  });

  it('a lower stamped rate still bills correctly even if a hypothetical live setting were higher (proves no live lookup is consulted)', async () => {
    const { svc, created } = makeService([ticket({ taxRate: 0.05 })]);
    await svc.generate(['t1'], 'admin1');
    // 2500 * 0.05 = 125; if the live rate (e.g. 0.17) were used instead this
    // would be 425 — the mock has no settings service to consult at all, so
    // any lookup of a "live" rate would throw, not silently fall back.
    expect(created[0]).toMatchObject({ taxRate: 0.05, taxAmount: 125 });
  });

  it('rejects a mixed-tax-rate selection rather than averaging or silently picking one', async () => {
    const { svc, tx } = makeService([
      ticket({ id: 't1', batchNo: '035210', taxRate: 0.17 }),
      ticket({ id: 't2', batchNo: '345579', taxRate: 0.05 }),
    ]);
    await expect(svc.generate(['t1', 't2'], 'admin1')).rejects.toThrow(
      /mixed tax rates/i,
    );
    expect(tx.invoice.create).not.toHaveBeenCalled();
  });

  it('USD tickets are always taxed at 0 regardless of any stamped taxRate', async () => {
    const { svc, created } = makeService([
      ticket({ currency: 'USD', taxRate: 0.17 }),
    ]);
    await svc.generate(['t1'], 'admin1');
    expect(created[0]).toMatchObject({
      currency: 'USD',
      taxRate: 0,
      taxAmount: 0,
    });
  });

  it('a multi-ticket USD invoice bills 0 tax even when its tickets carry DIFFERENT stamped taxRates — the currency check must short-circuit BEFORE the mixed-tax-rate guard, not after', async () => {
    // Two USD tickets with different stamped rates (e.g. one priced before a
    // PKR tax-rate setting changed, one after — plausible for legacy/edited
    // tickets since USD ignores tax entirely and never re-derives it). If the
    // currency short-circuit were evaluated AFTER the mixed-rate guard (or
    // dropped in favour of always computing `rates` first), this legitimate
    // USD invoice would incorrectly reject with "mixed tax rates" instead of
    // succeeding at 0 — CLAUDE.md: USD is an all-inclusive flat price list,
    // tax-rate provenance on the underlying tickets is simply irrelevant.
    const { svc, created } = makeService([
      ticket({
        id: 't1',
        batchNo: 'A',
        currency: 'USD',
        taxRate: 0.17,
      }),
      ticket({
        id: 't2',
        batchNo: 'B',
        currency: 'USD',
        taxRate: 0.05,
      }),
    ]);
    await expect(svc.generate(['t1', 't2'], 'admin1')).resolves.toBeDefined();
    expect(created[0]).toMatchObject({
      currency: 'USD',
      taxRate: 0,
      taxAmount: 0,
    });
  });
});

describe('InvoicesService.generate — blocker 3: per-ticket discount clamp', () => {
  it("clamps EACH ticket's discount to its own lineTotal before summing, so one ticket's oversized discount can't erode the others' contribution", async () => {
    const { svc, created } = makeService([
      ticket({
        id: 'a',
        batchNo: 'A',
        serviceCost: 10500,
        printingCharges: 24500,
        deliveryCharges: 4500,
        additionalCharges: 7000,
        // Wildly exceeds this ticket's own lineTotal (46500) — a naive
        // aggregate-then-clamp would let this eat into b/c/d below too.
        discountPrice: 5_000_000,
      }),
      ticket({
        id: 'b',
        batchNo: 'B',
        serviceCost: 2500,
        printingCharges: 2450,
      }),
      ticket({ id: 'c', batchNo: 'C', serviceCost: 1500, printingCharges: 0 }),
      ticket({ id: 'd', batchNo: 'D', serviceCost: 2000, printingCharges: 0 }),
    ]);
    await svc.generate(['a', 'b', 'c', 'd'], 'admin1');
    expect(created[0]).toMatchObject({
      subtotal: 54950, // 46500 (a) + 4950 (b) + 1500 (c) + 2000 (d)
      // Clamped to a's own lineTotal (10500+24500+4500+7000=46500), not the
      // raw 5,000,000 — so b/c/d's combined 8450 survives untouched below.
      discount: 46500,
      grandTotal: 8450, // 54950 - 46500 = b+c+d's 8450, not floored to 0
    });
  });
});

describe('InvoicesService.findOne authorization', () => {
  const invoice = { id: 'inv1', consumerId: 'c1', items: [], consumer: {} };

  function svcWith(inv: unknown) {
    const prisma = {
      invoice: { findUnique: jest.fn(() => Promise.resolve(inv)) },
    };
    return new InvoicesService(prisma as never, { create: jest.fn() } as never);
  }

  it('lets staff read any invoice', async () => {
    await expect(
      svcWith(invoice).findOne('inv1', STAFF),
    ).resolves.toMatchObject({ id: 'inv1' });
  });

  it('lets the owning consumer read their own', async () => {
    await expect(
      svcWith(invoice).findOne('inv1', {
        sub: 'c1',
        role: 'consumer',
      } as never),
    ).resolves.toMatchObject({ id: 'inv1' });
  });

  it('404s a non-owning consumer (ids must not be probeable)', async () => {
    await expect(
      svcWith(invoice).findOne('inv1', {
        sub: 'c9',
        role: 'consumer',
      } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s a representative — a clerk must never pull a consumer invoice (3.1-class IDOR)', async () => {
    await expect(
      svcWith(invoice).findOne('inv1', {
        sub: 'rep1',
        role: 'representative',
      } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s a missing invoice', async () => {
    await expect(svcWith(null).findOne('nope', STAFF)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('InvoicesService.list scoping', () => {
  // `list` is the enumeration surface for a broad permission (tickets.read,
  // held by staff, consumer-class roles, AND representatives). In-service
  // scoping by role is the ONLY thing standing between a consumer and every
  // other consumer's billing data — there is no controller-level filter.
  // These tests assert the actual `where` clause handed to Prisma, not just
  // the returned rows: a mock that ignores the filter entirely would still
  // return whatever rows it's told to, so asserting on rows alone can pass
  // for the wrong reason (see the representative case below).
  const STAFF_ROLES = [
    'super-admin',
    'manager-admin',
    'staff-admin',
    'lead-admin',
  ] as const;
  const CONSUMER_CLASS_ROLES = ['consumer', 'lawyer', 'company'] as const;

  function svcWithFindMany(rows: unknown[] = []) {
    const findMany = jest.fn(() => Promise.resolve(rows));
    const prisma = { invoice: { findMany } };
    const svc = new InvoicesService(
      prisma as never,
      {
        create: jest.fn(),
      } as never,
    );
    return { svc, findMany };
  }

  it.each(STAFF_ROLES)(
    'staff role %s sees every invoice — passes an UNFILTERED where',
    async (role) => {
      const { svc, findMany } = svcWithFindMany();
      await svc.list({ sub: 'staff1', role } as never);
      expect(findMany).toHaveBeenCalledTimes(1);
      const arg = findMany.mock.calls[0]![0] as { where: unknown };
      expect(arg.where).toEqual({});
    },
  );

  it.each(CONSUMER_CLASS_ROLES)(
    'consumer-class role %s is scoped to where: { consumerId: actor.sub }',
    async (role) => {
      const { svc, findMany } = svcWithFindMany();
      await svc.list({ sub: 'c1', role } as never);
      const arg = findMany.mock.calls[0]![0] as { where: unknown };
      expect(arg.where).toEqual({ consumerId: 'c1' });
    },
  );

  it('a representative is scoped to where: { consumerId: actor.sub } too — the empty result in practice comes from the FILTER, not a role-based early return', async () => {
    const { svc, findMany } = svcWithFindMany();
    const rows = await svc.list({
      sub: 'rep1',
      role: 'representative',
    } as never);
    expect(findMany).toHaveBeenCalledTimes(1);
    const arg = findMany.mock.calls[0]![0] as { where: unknown };
    // A rep's own user id is never a Ticket/Invoice consumerId, so this
    // filter naturally yields no rows against a real DB — but the guard
    // under test is that the FILTER is applied at all, not merely that the
    // mock happens to return []. A version of `list` that dropped scoping
    // entirely would still make this specific assertion on `rows` pass
    // (the mock returns whatever `rows` is told to), which is exactly why
    // the `where` clause itself is asserted here, not just the output.
    expect(arg.where).toEqual({ consumerId: 'rep1' });
    expect(rows).toEqual([]);
  });

  it('a consumer-class actor with no sub gets [] without ever touching Prisma', async () => {
    const { svc, findMany } = svcWithFindMany([{ id: 'leaked' }]);
    const rows = await svc.list({ sub: '', role: 'consumer' } as never);
    expect(rows).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('returns exactly the rows Prisma resolves, unmodified', async () => {
    const rows = [{ id: 'inv1' }, { id: 'inv2' }];
    const { svc } = svcWithFindMany(rows);
    await expect(
      svc.list({ sub: 'c1', role: 'consumer' } as never),
    ).resolves.toBe(rows);
  });
});
