import { jest } from '@jest/globals';
import { DocumentsService } from './documents.service';
import type { PaginationQueryDto } from '../common/dto/pagination-query.dto';

/**
 * Consumer document visibility filter (B1/B2).
 *
 * Mirrors the same gate as `redactTicketForConsumer`
 * (tickets.service.ts ~L553-560): a consumer may only ever see
 * TicketDocuments with `visibleToConsumer: true` whose ticket has reached
 * `COMPLETED`/`DELIVERED`. Internal WORK_DOCUMENTs and docs on
 * still-in-flight tickets must never be listed/exported for a consumer —
 * previously they rendered a Download button that then 403'd.
 */

type Row = {
  id: string;
  visibleToConsumer: boolean;
  ticket: { status: string };
};

function filterRows(rows: Row[], where: Record<string, unknown> | undefined) {
  return rows.filter((r) => {
    if (
      where?.visibleToConsumer !== undefined &&
      r.visibleToConsumer !== where.visibleToConsumer
    ) {
      return false;
    }
    const ticketWhere = where?.ticket as
      | { status?: { in?: string[] } }
      | undefined;
    if (
      ticketWhere?.status?.in &&
      !ticketWhere.status.in.includes(r.ticket.status)
    ) {
      return false;
    }
    return true;
  });
}

function makeService(rows: Row[]) {
  const prisma = {
    ticketDocument: {
      findMany: jest.fn(({ where }: { where?: Record<string, unknown> }) =>
        Promise.resolve(filterRows(rows, where)),
      ),
      count: jest.fn(({ where }: { where?: Record<string, unknown> }) =>
        Promise.resolve(filterRows(rows, where).length),
      ),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return {
    service: new DocumentsService(prisma as never),
    prisma,
  };
}

const rows: Row[] = [
  { id: 'd1', visibleToConsumer: true, ticket: { status: 'COMPLETED' } },
  { id: 'd2', visibleToConsumer: false, ticket: { status: 'COMPLETED' } },
  { id: 'd3', visibleToConsumer: true, ticket: { status: 'IN_PROGRESS' } },
  { id: 'd4', visibleToConsumer: true, ticket: { status: 'DELIVERED' } },
];

function query(overrides: Partial<PaginationQueryDto> = {}) {
  return { page: 1, limit: 10, ...overrides } as PaginationQueryDto;
}

describe('DocumentsService consumer visibility (B1/B2)', () => {
  it('forConsumer: true excludes non-visible docs and docs on non-completed tickets', async () => {
    const { service } = makeService(rows);
    const out = await service.list(query({ consumerId: 'c1' }), {
      forConsumer: true,
    });
    expect(out.items.map((d: { id: string }) => d.id)).toEqual(['d1', 'd4']);
    expect(out.total).toBe(2);
  });

  it('without forConsumer (staff), all docs are returned regardless of visibility/ticket status', async () => {
    const { service } = makeService(rows);
    const out = await service.list(query({ consumerId: 'c1' }));
    expect(out.items.map((d: { id: string }) => d.id).sort()).toEqual([
      'd1',
      'd2',
      'd3',
      'd4',
    ]);
    expect(out.total).toBe(4);
  });

  it('forConsumer: false behaves the same as omitted (staff/default path)', async () => {
    const { service } = makeService(rows);
    const out = await service.list(query({ consumerId: 'c1' }), {
      forConsumer: false,
    });
    expect(out.items.map((d: { id: string }) => d.id).sort()).toEqual([
      'd1',
      'd2',
      'd3',
      'd4',
    ]);
  });
});
