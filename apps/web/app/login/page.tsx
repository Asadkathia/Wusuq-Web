import { redirect } from 'next/navigation';
import { staffLoginHref } from '@/lib/staff-routes';

/**
 * Legacy staff-login path. Kept as a permanent redirect so existing staff
 * bookmarks survive the move to /staff-portal (spec 2026-07-16, Part 2).
 *
 * The `next` query MUST be forwarded: PortalAuthGuard sends users here as
 * `/login?next=…` on a stale JWT, and dropping it breaks post-login bounce-back.
 */
export default async function LegacyLoginRedirect({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = params.next;
  const next = Array.isArray(raw) ? raw[0] : raw;
  redirect(staffLoginHref(next));
}
