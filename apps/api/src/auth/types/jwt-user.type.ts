import type { UserRole } from '@wusuq/shared';

export type JwtUser = {
  sub: string;
  email: string;
  role: UserRole;
};
