'use client';

import { startTransition, useEffect, useState } from 'react';
import {
  BarChart3,
  BriefcaseBusiness,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Scale,
  Settings,
  Ticket,
  Vote,
  Wallet,
  WalletCards,
} from 'lucide-react';
import { ShellNav, type NavItem, type NavSubItem } from './ui/shell-nav';

const navItems: NavItem[] = [
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
    children: [
      { label: 'Unpaid Tickets', href: '/tickets/unpaid' },
      { label: 'Paid Tickets', href: '/tickets/paid' },
      { label: 'Assigned Tickets', href: '/tickets/assigned' },
      { label: 'In Progress Tickets', href: '/tickets/in-progress' },
      { label: 'Waiting Approval', href: '/tickets/waiting-approval' },
      { label: 'Completed Tickets', href: '/tickets/completed' },
      { label: 'Delivered Tickets', href: '/tickets/delivered' },
    ],
  },
  { label: 'Finance', href: '/finance', icon: WalletCards },
  { label: 'Reports', href: '/reports', icon: BarChart3 },
  { label: 'Documents', href: '/documents', icon: FolderOpen },
  { label: 'Wallet', href: '/wallet', icon: Wallet },
  { label: 'Invoices', href: '#', icon: FileText },
  { label: 'Elections & Cabinet', href: '/elections-cabinet/elections', icon: Vote },
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

const clerkNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'My Assigned Tickets', href: '/tickets/assigned', icon: Ticket },
  { label: 'Submit Receipt', href: '/tickets/waiting-approval', icon: FileText },
  {
    label: 'Paralegal Tickets',
    icon: Ticket,
    children: [
      { label: 'Ticket Requests', href: '/tickets/assigned' },
      { label: 'Assigned Tickets', href: '/tickets/in-progress' },
      { label: 'Finalized Tickets', href: '/tickets/waiting-approval' },
    ],
  },
  { label: 'Documents', href: '/documents', icon: FolderOpen },
  { label: 'Profile', href: '/profile', icon: BriefcaseBusiness },
];

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

  useEffect(() => {
    startTransition(() => setIsClerk(readIsClerk()));
  }, []);

  return isClerk ? clerkNavItems : navItems;
}

export function SidebarNav() {
  const items = useStaffNavItems();
  return <ShellNav items={items} variant="staff" />;
}

// Re-export for legacy usage
export type { NavItem, NavSubItem };
