'use client';

import {
  AlertCircle,
  BriefcaseBusiness,
  FileEdit,
  FileText,
  FolderOpen,
  Folders,
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
  { label: 'Unpaid', href: '/consumer/my-tickets?filter=unpaid', icon: AlertCircle },
  { label: 'Drafts', href: '/consumer/drafts', icon: FileEdit },
  // Batch-7 6.4: "this My File and this Case File — I don't know what the
  // difference is, I stay confused." All three areas are renamed to say WHO
  // OWNS the content: Wusuq's deliverables vs the consumer's own uploads,
  // case-tagged vs loose. Merging them is a product decision the client still
  // owes us; naming them honestly is not.
  { label: 'My Case Files', href: '/consumer/case-files', icon: Folders },
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
  { label: 'Documents from Wusuq', href: '/consumer/documents', icon: FileText },
  { label: 'My Storage', href: '/consumer/files', icon: HardDrive },
  { label: 'Invoices', href: '/consumer/invoices', icon: FileText },
  { label: 'Profile', href: '/consumer/profile', icon: BriefcaseBusiness },
];

export function ConsumerSidebarNav() {
  return <ShellNav items={consumerNavItems} variant="consumer" />;
}
