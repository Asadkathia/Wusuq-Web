'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Columns3, Check } from 'lucide-react';

interface ColumnToggleProps {
  columns: { key: string; label: string }[];
  visibleColumns: string[];
  onChange: (visible: string[]) => void;
}

export function ColumnToggle({ columns, visibleColumns, onChange }: ColumnToggleProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggle = (key: string) => {
    if (visibleColumns.includes(key)) {
      if (visibleColumns.length > 1) { // Prevent hiding all columns
        onChange(visibleColumns.filter(c => c !== key));
      }
    } else {
      onChange([...visibleColumns, key]);
    }
  };

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
      >
        <Columns3 className="h-4 w-4 text-slate-400" />
        Columns
      </button>

      {isOpen && (
        <div className="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-xl bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
          <div className="p-2 space-y-1">
            {columns.map((col) => {
              const checked = visibleColumns.includes(col.key);
              return (
                <button
                  key={col.key}
                  onClick={() => toggle(col.key)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <div className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? 'bg-primary-600 border-primary-600 text-white' : 'bg-white border-slate-300'}`}>
                    {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                  </div>
                  {col.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
