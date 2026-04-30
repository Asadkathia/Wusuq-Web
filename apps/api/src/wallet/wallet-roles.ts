import type { UserRole } from '@wusuq/shared';

// Roles that may act on behalf of any user (manage manual top-ups, list all
// wallets, view any user's transactions). Mirrors the back-office surface
// already implied by the wallet.read/write permission split, but tightened
// because consumer/lawyer/company also have wallet.read for /wallet/me.
export const ADMIN_WALLET_ROLES: ReadonlySet<UserRole> = new Set<UserRole>([
  'super-admin',
  'manager-admin',
  'staff-admin',
  'lead-admin',
]);

export function isAdminWalletRole(role: UserRole | undefined): boolean {
  return role !== undefined && ADMIN_WALLET_ROLES.has(role);
}
