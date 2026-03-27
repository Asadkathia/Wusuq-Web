import type { ReactNode } from 'react';
import { Search } from 'lucide-react';

interface FilterBarProps {
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  actions?: ReactNode;
}

export function FilterBar({ 
  onSearch, 
  searchPlaceholder = 'Search...', 
  filters, 
  actions 
}: FilterBarProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
      <div className="flex flex-col sm:flex-row flex-1 gap-4 items-start sm:items-center w-full">
        {onSearch && (
          <div className="relative w-full sm:max-w-xs">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              onChange={(e) => onSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="block w-full rounded-lg border-0 py-1.5 pl-10 text-slate-900 ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-primary-600 sm:text-sm sm:leading-6"
            />
          </div>
        )}
        {filters && <div className="flex items-center gap-2">{filters}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
