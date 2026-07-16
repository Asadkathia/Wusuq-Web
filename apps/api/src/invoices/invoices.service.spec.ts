import { jest } from '@jest/globals';
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
