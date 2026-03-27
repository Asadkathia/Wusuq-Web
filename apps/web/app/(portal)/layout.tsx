import type { ReactNode } from 'react';
import { SidebarNav } from '@/components/nav';
import { Topbar } from '@/components/topbar';
import { PortalAuthGuard } from '@/components/portal-auth-guard';

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <PortalAuthGuard>
      <div className="flex min-h-screen bg-background text-foreground">
        <SidebarNav />
        <div className="flex flex-1 flex-col">
          <Topbar />
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </PortalAuthGuard>
  );
}
