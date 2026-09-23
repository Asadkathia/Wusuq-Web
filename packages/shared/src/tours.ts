/**
 * Guided-tour registry — the ONLY list of valid tour ids.
 *
 * The API validates `PUT /tours/progress/:tourId` against this list (so a
 * client cannot create junk rows) and the web tour registry is typed against
 * `TourId` (so a tour data file cannot reference an unknown tour).
 *
 * Bump a tour's `version` when its content changes materially: every user who
 * saw an older version sees it once more.
 */
import { ROLE_PERMISSIONS, isConsumerRole, isStaffRole, type Permission, type UserRole } from './index.js';

export const TOUR_IDS = [
  'consumer.getting-started',
  'consumer.dashboard',
  'consumer.services',
  'consumer.intake',
  'consumer.my-tickets',
  'consumer.pay',
  'consumer.wallet',
  'consumer.drafts',
  'consumer.case-files',
  'consumer.documents',
  'consumer.invoices',
  'consumer.profile',
] as const;

export type TourId = (typeof TOUR_IDS)[number];
export type TourStatusValue = 'COMPLETED' | 'DISMISSED';

export interface TourMeta {
  version: number;
  audience: 'consumer' | 'staff';
  /** Staff tours only: the permission the page requires (mirrors the sidebar). */
  permission?: Permission;
}

const consumer = (version = 1): TourMeta => ({ version, audience: 'consumer' });

export const TOUR_META: Record<TourId, TourMeta> = {
  'consumer.getting-started': consumer(),
  'consumer.dashboard': consumer(),
  'consumer.services': consumer(),
  'consumer.intake': consumer(),
  'consumer.my-tickets': consumer(),
  'consumer.pay': consumer(),
  'consumer.wallet': consumer(),
  'consumer.drafts': consumer(),
  'consumer.case-files': consumer(),
  'consumer.documents': consumer(),
  'consumer.invoices': consumer(),
  'consumer.profile': consumer(),
};

/** Reserved id persisting the "don't show tours automatically" preference. */
export const TOUR_AUTO_OFF_ID = 'tours.auto-off';

export function isTourId(id: string): id is TourId {
  return (TOUR_IDS as readonly string[]).includes(id);
}

export function isKnownTourId(id: string): boolean {
  return id === TOUR_AUTO_OFF_ID || isTourId(id);
}

export function expectedTourVersion(id: string): number | null {
  if (id === TOUR_AUTO_OFF_ID) return 1;
  if (!isTourId(id)) return null;
  return TOUR_META[id].version;
}

export function tourAppliesToRole(id: TourId, role: string | null | undefined): boolean {
  const meta = TOUR_META[id];
  if (meta.audience === 'consumer') return isConsumerRole(role);
  if (!isStaffRole(role)) return false;
  if (!meta.permission) return true;
  const perms = ROLE_PERMISSIONS[role as UserRole] ?? [];
  return perms.includes(meta.permission);
}
