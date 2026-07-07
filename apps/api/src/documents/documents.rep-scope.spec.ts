import { jest } from '@jest/globals';
import { DocumentsService } from './documents.service';
import type { PaginationQueryDto } from '../common/dto/pagination-query.dto';

/**
 * Representative scoping for `/documents` (H1 IDOR).
 *
 * `DocumentsController.list`/`export` only forced `query.consumerId` when
 * `isConsumerRole(user.role)` was true. `representative` is NOT
 * consumer-class, so a rep's request fell through unfiltered and a client
 * `?consumerId=<anyone>` was honoured verbatim — any rep could read any
 * consumer's documents. A representative must instead be scoped to the
 * tickets they are assigned to (mirrors `tickets.service.ts`'s
 * `assignments: { some: { representativeId } }` shape used in
 * `countsByStatus`/`findOne`), and any client-supplied `consumerId` must be
 * ignored entirely.
 */

function makeService() {
  const findMany = jest.fn().mockResolvedValue([]);
  const count = jest.fn().mockResolvedValue(0);
  const prisma = {
    ticketDocument: { findMany, count },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return {
    service: new DocumentsService(prisma as never),
    findMany,
    count,
  };
}

function query(overrides: Partial<PaginationQueryDto> = {}) {
  return { page: 1, limit: 10, ...overrides } as PaginationQueryDto;
}

describe('DocumentsService rep scoping (H1)', () => {
  it('scopes a representative to their assigned tickets and ignores client consumerId', async () => {
    const { service, findMany } = makeService();
    await service.list(query({ consumerId: 'other' }), {
      forRepresentative: true,
      representativeId: 'rep-1',
    });
    const where = findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('rep-1');
    expect(JSON.stringify(where)).not.toContain('other');
  });

  it('also scopes the count query the same way', async () => {
    const { service, count } = makeService();
    await service.list(query({ consumerId: 'other' }), {
      forRepresentative: true,
      representativeId: 'rep-1',
    });
    const where = count.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('rep-1');
    expect(JSON.stringify(where)).not.toContain('other');
  });

  it('staff (no opts) are unaffected and client consumerId still applies for a non-rep caller', async () => {
    const { service, findMany } = makeService();
    await service.list(query({ consumerId: 'someone' }));
    const where = findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('someone');
    expect(JSON.stringify(where)).not.toContain('rep-1');
  });
});
