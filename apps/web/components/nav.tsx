'use client';

import { useEffect, useState } from 'react';
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
      { label: 'Pending Tickets', href: '/tickets/pending' },
      { label: 'Assigned Tickets', href: '/tickets/assigned' },
      { label: 'In Progress Tickets', href: '/tickets/in-progress' },
      { label: 'Waiting Approval', href: '/tickets/waiting-approval' },
      { label: 'Completed Tickets', href: '/tickets/completed' },
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
      { label: 'Clerk Cost Rules', href: '/manage-cost/clerk-cost' },
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

export function useStaffNavItems(): NavItem[] {
  const [isClerk, setIsClerk] = useState(false);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('wusuq_user') || 'null');
      if (u?.role === 'representative') setIsClerk(true);
    } catch {}
  }, []);

  return isClerk ? clerkNavItems : navItems;
}

export function SidebarNav() {
  const items = useStaffNavItems();
  return <ShellNav items={items} variant="staff" />;
}

// Re-export for legacy usage
export type { NavItem, NavSubItem };
