import { jest } from '@jest/globals';
import { DocumentsController } from './documents.controller';

function makeRes() {
  return {
    setHeader: jest.fn(),
    send: jest.fn(),
    json: jest.fn(),
  };
}

describe('GET /documents/export consumer scoping (report 3.3a)', () => {
  it('scopes the export to the calling consumer like list does', async () => {
    const list = jest
      .fn()
      .mockResolvedValue({ items: [], page: 1, limit: 5000, total: 0 });
    const controller = new DocumentsController({ list } as never);

    await controller.export(
      'csv',
      { sub: 'consumer-A', email: 'a@x.com', role: 'consumer' },
      makeRes() as never,
    );

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ consumerId: 'consumer-A' }),
    );
  });

  it('does not scope staff exports', async () => {
    const list = jest
      .fn()
      .mockResolvedValue({ items: [], page: 1, limit: 5000, total: 0 });
    const controller = new DocumentsController({ list } as never);

    await controller.export(
      'csv',
      { sub: 'admin-1', email: 'admin@x.com', role: 'staff-admin' },
      makeRes() as never,
    );

    const arg = list.mock.calls[0][0] as { consumerId?: string };
    expect(arg.consumerId).toBeUndefined();
  });
});
