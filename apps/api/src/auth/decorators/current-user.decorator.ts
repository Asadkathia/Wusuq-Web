import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtUser } from '../types/jwt-user.type';

type RequestWithUser = {
  user?: JwtUser;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUser | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return request.user;
  },
);
