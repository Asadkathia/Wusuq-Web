import type { ReactNode } from 'react';
import { SidebarNav } from '@/components/nav';

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <SidebarNav />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
