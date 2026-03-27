import type { ReactNode } from 'react';
import { PanelCard } from './panel-card';

interface DataTableShellProps {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function DataTableShell({ children, header, footer, className = '' }: DataTableShellProps) {
  return (
    <PanelCard noPadding className={`flex flex-col overflow-hidden ${className}`}>
      {header && (
        <div className="border-b border-border-soft bg-surface py-4 px-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {header}
        </div>
      )}
      <div className="flex-1 w-full overflow-x-auto">
        <div className="min-w-full align-middle">
          {children}
        </div>
      </div>
      {footer && (
        <div className="border-t border-border-soft bg-surface-muted px-6 py-3">
          {footer}
        </div>
      )}
    </PanelCard>
  );
}
