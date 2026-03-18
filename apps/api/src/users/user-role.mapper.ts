import { UserRole as PrismaUserRole } from '@prisma/client';
import type { UserRole } from '@wusuq/shared';

const prismaToShared: Record<PrismaUserRole, UserRole> = {
  super_admin: 'super-admin',
  manager_admin: 'manager-admin',
  staff_admin: 'staff-admin',
  lead_admin: 'lead-admin',
  lawyer: 'lawyer',
  consumer: 'consumer',
  representative: 'representative',
  investor: 'investor',
  company: 'company',
};

const sharedToPrisma: Record<UserRole, PrismaUserRole> = {
  'super-admin': PrismaUserRole.super_admin,
  'manager-admin': PrismaUserRole.manager_admin,
  'staff-admin': PrismaUserRole.staff_admin,
  'lead-admin': PrismaUserRole.lead_admin,
  lawyer: PrismaUserRole.lawyer,
  consumer: PrismaUserRole.consumer,
  representative: PrismaUserRole.representative,
  investor: PrismaUserRole.investor,
  company: PrismaUserRole.company,
};

export function mapPrismaRoleToShared(role: PrismaUserRole): UserRole {
  return prismaToShared[role];
}

export function mapSharedRoleToPrisma(role: UserRole): PrismaUserRole {
  return sharedToPrisma[role];
}
