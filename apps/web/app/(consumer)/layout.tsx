import type { ReactNode } from 'react';
import { ConsumerAuthGuard } from '@/components/consumer-auth-guard';
import { ConsumerSidebarNav } from '@/components/consumer-nav';
import { ConsumerTopbar } from '@/components/consumer-topbar';
import { ShellFooter } from '@/components/ui/shell-footer';

export default function ConsumerLayout({ children }: { children: ReactNode }) {
  return (
    <ConsumerAuthGuard>
      <div className="flex min-h-screen bg-background text-foreground">
        <ConsumerSidebarNav />
        <div className="flex flex-1 flex-col min-w-0">
          <ConsumerTopbar />
          <main className="flex-1 p-4 sm:p-6">{children}</main>
          <ShellFooter />
        </div>
      </div>
    </ConsumerAuthGuard>
  );
}
