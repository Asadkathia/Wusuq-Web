'use client';

import { startTransition, useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  BriefcaseBusiness,
  FileText,
  FolderOpen,
  Info,
  LayoutDashboard,
  Scale,
  Settings,
  Tag,
  Ticket,
  Truck,
  Vote,
  Wallet,
  WalletCards,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import { ShellNav, type NavItem, type NavSubItem } from './ui/shell-nav';
import { apiClient } from '@/lib/api-client';

const STATUS_HREF: Record<string, string> = {
  UNPAID: '/tickets/unpaid',
  PAID: '/tickets/paid',
  ASSIGNED: '/tickets/assigned',
  IN_PROGRESS: '/tickets/in-progress',
  WAITING_APPROVAL: '/tickets/waiting-approval',
  COMPLETED: '/tickets/completed',
  DELIVERED: '/tickets/delivered',
};

function buildNavItems(counts: Record<string, number>): NavItem[] {
  const hrefCount: Record<string, number> = {};
  for (const [status, href] of Object.entries(STATUS_HREF)) {
    if (counts[status]) hrefCount[href] = counts[status];
  }
  const total = Object.values(hrefCount).reduce((s, n) => s + n, 0);

  return [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Cases', href: '/cases', icon: FolderOpen },
    {
      label: 'Paralegal Services',
      icon: Scale,
      children: [
        { label: 'Judicial', href: '/paralegal-services/judicial' },
        { label: 'Non judicial', href: '/paralegal-services/non-judicial' },
      ],
    },
    {
      label: 'Paralegal Tickets',
      icon: Ticket,
      count: total || undefined,
      children: [
        { label: 'Unpaid Tickets', href: '/tickets/unpaid', count: hrefCount['/tickets/unpaid'] },
        { label: 'Paid Tickets', href: '/tickets/paid', count: hrefCount['/tickets/paid'] },
        { label: 'Assigned Tickets', href: '/tickets/assigned', count: hrefCount['/tickets/assigned'] },
        { label: 'In Progress Tickets', href: '/tickets/in-progress', count: hrefCount['/tickets/in-progress'] },
        { label: 'Waiting Approval', href: '/tickets/waiting-approval', count: hrefCount['/tickets/waiting-approval'] },
        { label: 'Completed Tickets', href: '/tickets/completed', count: hrefCount['/tickets/completed'] },
        { label: 'Delivered Tickets', href: '/tickets/delivered', count: hrefCount['/tickets/delivered'] },
        // Restore/unarchive follow-up: no count badge — /tickets/counts is
        // scoped to non-archived tickets, and this tab is admin-only anyway
        // (buildClerkItems below doesn't include it).
        { label: 'Archived Tickets', href: '/tickets/archived' },
      ],
    },
    { label: 'Finance', href: '/finance', icon: WalletCards },
    { label: 'Reports', href: '/reports', icon: BarChart3 },
    { label: 'Documents', href: '/documents', icon: FolderOpen },
    { label: 'Wallet', href: '/wallet', icon: Wallet },
    { label: 'Invoices', href: '#', icon: FileText },
    { label: 'Elections & Cabinet', href: '/elections-cabinet/elections', icon: Vote },
    { label: 'Promo Codes', href: '/promos', icon: Tag },
    { label: 'About', href: '/about', icon: Info },
    {
      label: 'Settings',
      icon: Settings,
      children: [
        { label: 'Users', href: '/manage-users/users' },
        { label: 'Representatives', href: '/manage-users/representatives' },
        { label: 'Pricing', href: '/settings/pricing' },
        { label: 'Ticket Charges', href: '/manage-cost/ticket-charges' },
        { label: 'Exchange Rates', href: '/manage-cost/exchange-rates' },
        { label: 'Geographic Data', href: '/manage-cost/geo' },
      ],
    },
    { label: 'Profile', href: '/profile', icon: BriefcaseBusiness },
  ];
}

function buildClerkItems(counts: Record<string, number>): NavItem[] {
  // The clerk dashboard (/dashboard renders a clerk view backed by
  // /dashboard/clerk-summary, gated on tickets.read which reps hold) shows their
  // earnings + metrics; it is their landing page.
  return [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    {
      label: 'My Assigned Tickets',
      href: '/tickets/assigned',
      icon: Ticket,
      count: counts['ASSIGNED'],
    },
    {
      label: 'Submit Receipt',
      href: '/tickets/waiting-approval',
      icon: FileText,
      count: counts['WAITING_APPROVAL'],
    },
    {
      label: 'Ready to Dispatch',
      href: '/tickets/completed',
      icon: Truck,
      count: counts['COMPLETED'],
    },
    {
      label: 'Paralegal Tickets',
      icon: Ticket,
      children: [
        { label: 'Ticket Requests', href: '/tickets/assigned', count: counts['ASSIGNED'] },
        { label: 'Assigned Tickets', href: '/tickets/in-progress', count: counts['IN_PROGRESS'] },
        { label: 'Finalized Tickets', href: '/tickets/waiting-approval', count: counts['WAITING_APPROVAL'] },
      ],
    },
    { label: 'Documents', href: '/documents', icon: FolderOpen },
    { label: 'Profile', href: '/profile', icon: BriefcaseBusiness },
  ];
}

function readIsClerk(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const u = JSON.parse(localStorage.getItem('wusuq_user') || 'null');
    return u?.role === 'representative';
  } catch {
    return false;
  }
}

export function useStaffNavItems(): NavItem[] {
  const [isClerk, setIsClerk] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const genRef = useRef(0);
  const pathname = usePathname();

  useEffect(() => {
    startTransition(() => setIsClerk(readIsClerk()));
  }, []);

  useEffect(() => {
    const gen = ++genRef.current;
    apiClient
      .get<Record<string, number>>('/tickets/counts')
      .then((data) => {
        if (gen !== genRef.current) return;
        startTransition(() => setCounts(data));
      })
      .catch(() => {
        /* ignore — nav still renders without counts */
      });
  }, [pathname]);

  return isClerk ? buildClerkItems(counts) : buildNavItems(counts);
}

export function SidebarNav() {
  const items = useStaffNavItems();
  return <ShellNav items={items} variant="staff" />;
}

// Re-export for legacy usage
export type { NavItem, NavSubItem };
