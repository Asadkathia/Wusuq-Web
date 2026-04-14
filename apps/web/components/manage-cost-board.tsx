'use client';

import { useState } from 'react';
import { ServiceBaseCostsBoard } from '@/components/service-base-costs-board';
import { CostRulesBoard } from '@/components/cost-rules-board';
import { TicketChargesBoard } from '@/components/ticket-charges-board';

type Tab = 'base' | 'rules' | 'tickets';

const TABS: { id: Tab; label: string; description: string }[] = [
  { id: 'base', label: 'Base Service Pricing', description: 'Default cost per service for local and overseas citizens' },
  { id: 'rules', label: 'Advanced Rules', description: 'Province and case-type specific overrides' },
  { id: 'tickets', label: 'Ticket Charges', description: 'Edit charges on individual tickets' },
];

type ManageCostBoardProps = {
  defaultTab?: Tab;
};

export function ManageCostBoard({ defaultTab = 'base' }: ManageCostBoardProps) {
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-0" aria-label="Manage Cost tabs">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'group flex flex-col px-6 py-4 text-sm font-medium border-b-2 transition-colors focus:outline-none',
                activeTab === tab.id
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300',
              ].join(' ')}
            >
              <span>{tab.label}</span>
              <span className={`text-xs font-normal mt-0.5 ${activeTab === tab.id ? 'text-brand-400' : 'text-slate-400 group-hover:text-slate-500'}`}>
                {tab.description}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'base' && <ServiceBaseCostsBoard />}
        {activeTab === 'rules' && <CostRulesBoard title="Advanced Cost Rules" type="service" />}
        {activeTab === 'tickets' && <TicketChargesBoard />}
      </div>
    </div>
  );
}
