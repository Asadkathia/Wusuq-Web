import { Injectable } from '@nestjs/common';
import {
  ROLE_PERMISSIONS,
  type Permission,
  type UserRole,
} from '@wusuq/shared';

@Injectable()
export class RolesPermissionsService {
  hasAllPermissions(role: UserRole, required: Permission[]): boolean {
    const granted = ROLE_PERMISSIONS[role] ?? [];
    return required.every((permission) => granted.includes(permission));
  }
}
