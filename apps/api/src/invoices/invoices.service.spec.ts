import { jest } from '@jest/globals';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
    // `tx` and `prisma` are distinct jest.fn instances (see makeService) —
    // this pair of assertions actually distinguishes "drew nextval from the
    // transaction client" from "drew it from the top-level client outside
    // the transaction", which the pre-fix mock could not.
    expect(tx.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(`SELECT nextval('invoice_no_seq')`);
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
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
    tx.invoice.create.mockImplementationOnce(() => Promise.reject(ticketIdP2002));
    await expect(svc.generate(['t1'], 'admin1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('names the conflicting ticket by batchNo when it can find one', async () => {
    const { svc, tx, prisma } = makeService([ticket()]);
    tx.invoice.create.mockImplementationOnce(() => Promise.reject(ticketIdP2002));
    prisma.ticket.findFirst.mockImplementationOnce(() => Promise.resolve({ batchNo: '035210' }));
    await expect(svc.generate(['t1'], 'admin1')).rejects.toThrow(/035210.*already on another invoice/i);
  });

  it('does NOT swallow an unrelated P2002 (e.g. a different unique constraint) — real bugs still surface', async () => {
    const { svc, tx } = makeService([ticket()]);
    const otherConstraint = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`invoiceNo`)',
      { code: 'P2002', clientVersion: 'test', meta: { target: ['invoiceNo'] } },
    );
    tx.invoice.create.mockImplementationOnce(() => Promise.reject(otherConstraint));
    await expect(svc.generate(['t1'], 'admin1')).rejects.toBe(otherConstraint);
  });

  it('keeps the up-front guard for the common (non-racing) case — no DB round trip needed', async () => {
    const { svc, tx, prisma } = makeService([ticket({ invoiceItem: { invoiceId: 'inv-old' } })]);
    await expect(svc.generate(['t1'], 'admin1')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.invoice.create).not.toHaveBeenCalled();
    expect(prisma.ticket.findFirst).not.toHaveBeenCalled();
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
