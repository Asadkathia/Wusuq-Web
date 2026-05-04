'use client';

import {
  BriefcaseBusiness,
  FileText,
  FolderOpen,
  HardDrive,
  LayoutDashboard,
  Scale,
  Ticket,
  Wallet,
} from 'lucide-react';
import { ShellNav, type NavItem } from './ui/shell-nav';

export const consumerNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/consumer/dashboard', icon: LayoutDashboard },
  { label: 'My Tickets', href: '/consumer/my-tickets', icon: Ticket },
  { label: 'My Cases', href: '/consumer/my-cases', icon: FolderOpen },
  { label: 'My Wallet', href: '/consumer/my-wallet', icon: Wallet },
  {
    label: 'Paralegal Services',
    icon: Scale,
    children: [
      { label: 'Judicial', href: '/consumer/paralegal-services/judicial' },
      { label: 'Non Judicial', href: '/consumer/paralegal-services/non-judicial' },
    ],
  },
  { label: 'Documents', href: '/consumer/documents', icon: FileText },
  { label: 'My Files', href: '/consumer/files', icon: HardDrive },
  { label: 'Profile', href: '/consumer/profile', icon: BriefcaseBusiness },
];

export function ConsumerSidebarNav() {
  return <ShellNav items={consumerNavItems} variant="consumer" />;
}
