import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@wusuq/shared';
import type { JwtUser } from '../../auth/types/jwt-user.type';
import { RolesPermissionsService } from '../roles-permissions.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

type RequestWithUser = {
  user?: JwtUser;
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rolesPermissionsService: RolesPermissionsService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Access denied');
    }

    if (!this.rolesPermissionsService.hasAllPermissions(user.role, required)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
