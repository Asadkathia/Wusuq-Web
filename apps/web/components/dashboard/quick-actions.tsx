import Link from 'next/link';
import {
  FilePlus,
  Briefcase,
  WalletCards,
  ClipboardCheck,
  BarChart3,
  type LucideIcon,
} from 'lucide-react';

type Action = {
  label: string;
  href: string;
  icon: LucideIcon;
  variant: 'primary' | 'ghost';
};

const ACTIONS: Action[] = [
  { label: 'New Judicial Ticket', href: '/paralegal-services/judicial', icon: FilePlus, variant: 'primary' },
  { label: 'New Non-Judicial Ticket', href: '/paralegal-services/non-judicial', icon: FilePlus, variant: 'primary' },
  { label: 'Open Cases', href: '/cases', icon: Briefcase, variant: 'ghost' },
  { label: 'Verify Wallets', href: '/wallet', icon: WalletCards, variant: 'ghost' },
  { label: 'Approvals', href: '/tickets/waiting-approval', icon: ClipboardCheck, variant: 'ghost' },
  { label: 'Reports', href: '/reports', icon: BarChart3, variant: 'ghost' },
];

export function QuickActions() {
  return (
    <div className="flex flex-wrap items-center gap-2 overflow-x-auto rounded-2xl border border-border-soft bg-surface p-3 shadow-elev-1">
      {ACTIONS.map(({ label, href, icon: Icon, variant }) => {
        const base =
          'inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-[background-color,box-shadow,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40';
        const styles =
          variant === 'primary'
            ? 'bg-brand-500 text-white shadow-elev-1 hover:bg-brand-600 hover:shadow-elev-2'
            : 'border border-border-soft bg-surface text-slate-700 hover:border-brand-200 hover:bg-surface-hover';
        return (
          <Link key={href} href={href} className={`${base} ${styles}`}>
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
