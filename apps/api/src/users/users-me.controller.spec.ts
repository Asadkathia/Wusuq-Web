import { jest } from '@jest/globals';
import { UsersController } from './users.controller';
import type { JwtUser } from '../auth/types/jwt-user.type';

// Guards the self-profile route (B9): GET /users/me must resolve strictly to the
// authenticated caller's OWN record (actor.sub) — never a client-supplied id —
// since it intentionally omits @RequirePermissions (any authenticated user).
describe('UsersController.me (self-profile, GET /users/me)', () => {
  function makeController() {
    const findOne = jest.fn(async (id: string) => ({ id, address: 'seeded' }));
    const controller = new UsersController({ findOne } as never);
    return { controller, findOne };
  }

  it("returns the caller's own record via actor.sub", async () => {
    const { controller, findOne } = makeController();
    const actor = { sub: 'user-1', role: 'consumer' } as JwtUser;
    await controller.me(actor);
    expect(findOne).toHaveBeenCalledWith('user-1');
    expect(findOne).toHaveBeenCalledTimes(1);
  });

  it('binds to the actor sub even when a different id exists elsewhere (no client id path)', async () => {
    const { controller, findOne } = makeController();
    await controller.me({ sub: 'me-2', role: 'lawyer' } as JwtUser);
    // The route signature takes only @CurrentUser — there is no @Param('id'),
    // so the only value that can reach findOne is the JWT subject.
    expect(findOne).toHaveBeenCalledWith('me-2');
  });
});
