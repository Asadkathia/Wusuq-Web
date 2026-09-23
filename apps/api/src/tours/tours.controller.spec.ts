import { jest } from '@jest/globals';
import type { JwtUser } from '../auth/types/jwt-user.type';
import { ToursController } from './tours.controller';

// IDOR guard: every route resolves the user strictly from the JWT subject.
// No route declares a user-id parameter, so user A can never read or write B.
describe('ToursController (self-scoped)', () => {
  function make() {
    const svc = {
      list: jest.fn(async (_u: string) => []),
      save: jest.fn(async (_u: string, _t: string, _d: unknown) => ({})),
      remove: jest.fn(async (_u: string, _t: string) => ({ deleted: true })),
    };
    return { ctrl: new ToursController(svc as never), svc };
  }
  const actor = { sub: 'user-a', role: 'consumer' } as JwtUser;

  it('list uses actor.sub', async () => {
    const { ctrl, svc } = make();
    await ctrl.list(actor);
    expect(svc.list).toHaveBeenCalledWith('user-a');
  });

  it('save uses actor.sub and the path tour id', async () => {
    const { ctrl, svc } = make();
    await ctrl.save(actor, 'consumer.wallet', {
      version: 1,
      status: 'COMPLETED',
    });
    expect(svc.save).toHaveBeenCalledWith('user-a', 'consumer.wallet', {
      version: 1,
      status: 'COMPLETED',
    });
  });

  it('remove uses actor.sub and the path tour id', async () => {
    const { ctrl, svc } = make();
    await ctrl.remove(actor, 'tours.auto-off');
    expect(svc.remove).toHaveBeenCalledWith('user-a', 'tours.auto-off');
  });
});
