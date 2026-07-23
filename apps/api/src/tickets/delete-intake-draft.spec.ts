import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { TicketsService } from './tickets.service';

// E1: per-row delete on the Drafts page. The important correctness point is
// the IDOR guard — a consumer must not be able to delete another consumer's
// draft, even by knowing/guessing its id.
describe('TicketsService.deleteIntakeDraftById (E1)', () => {
  function buildHarness(draftRow: unknown) {
    const draftDelete = jest.fn().mockResolvedValue({});
    const prisma = {
      ticketIntakeDraft: {
        findUnique: jest.fn().mockResolvedValue(draftRow),
        delete: draftDelete,
      },
    };
    const auditLogsService = { create: jest.fn().mockResolvedValue({}) };
    const service = new TicketsService(
      prisma as never,
      auditLogsService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, prisma, auditLogsService, draftDelete };
  }

  it("deletes the caller's own draft and writes an audit row", async () => {
    const { service, draftDelete, auditLogsService } = buildHarness({
      id: 'draft-1',
      consumerId: 'consumer-1',
      flow: 'judicial_case_information',
    });

    const result = await service.deleteIntakeDraftById('draft-1', {
      consumerId: 'consumer-1',
      actorUserId: 'consumer-1',
      actorEmail: 'me@example.com',
    });

    expect(result).toEqual({ deleted: true });
    expect(draftDelete).toHaveBeenCalledWith({ where: { id: 'draft-1' } });
    expect(auditLogsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TICKET_DRAFT_DELETED',
        entityId: 'draft-1',
      }),
    );
  });

  it('rejects (404, not a silent no-op) when the draft belongs to a different consumer — IDOR guard', async () => {
    const { service, draftDelete, auditLogsService } = buildHarness({
      id: 'draft-2',
      consumerId: 'someone-else',
      flow: 'judicial_case_information',
    });

    await expect(
      service.deleteIntakeDraftById('draft-2', {
        consumerId: 'consumer-1',
      }),
    ).rejects.toThrow(NotFoundException);

    expect(draftDelete).not.toHaveBeenCalled();
    expect(auditLogsService.create).not.toHaveBeenCalled();
  });

  it('404s when the draft does not exist at all', async () => {
    const { service, draftDelete } = buildHarness(null);

    await expect(
      service.deleteIntakeDraftById('missing-id', {
        consumerId: 'consumer-1',
      }),
    ).rejects.toThrow(NotFoundException);

    expect(draftDelete).not.toHaveBeenCalled();
  });
});
