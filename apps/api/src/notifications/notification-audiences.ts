import { UserRole as PrismaUserRole } from '@prisma/client';

// Back-office roles that triage tickets / assignments. Mirrors the admin
// surface implied by tickets.write on non-consumer roles. Prisma enum form.
export const ADMIN_NOTIFY_ROLES: PrismaUserRole[] = [
  PrismaUserRole.super_admin,
  PrismaUserRole.manager_admin,
  PrismaUserRole.staff_admin,
  PrismaUserRole.lead_admin,
];

// Roles that act on money (verify top-ups, review costs/receipts). Subset of
// admins holding finance.* / wallet.write per ROLE_PERMISSIONS in shared.
export const FINANCE_NOTIFY_ROLES: PrismaUserRole[] = [
  PrismaUserRole.super_admin,
  PrismaUserRole.manager_admin,
  PrismaUserRole.staff_admin,
];
