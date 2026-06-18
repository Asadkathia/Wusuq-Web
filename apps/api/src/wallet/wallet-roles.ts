import { STAFF_ROLES, isStaffRole, type UserRole } from '@wusuq/shared';

// Roles that may act on behalf of any user (manage manual top-ups, list all
// wallets, view any user's transactions). Delegates to the shared STAFF_ROLES
// so the back-office role set has exactly one definition.
export const ADMIN_WALLET_ROLES: ReadonlySet<UserRole> = new Set<UserRole>(
  STAFF_ROLES,
);

export function isAdminWalletRole(role: UserRole | undefined): boolean {
  return isStaffRole(role);
}
