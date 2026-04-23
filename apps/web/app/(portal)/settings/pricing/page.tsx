import { PricingRulesBoard } from '@/components/pricing-rules-board';

export default function PricingSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Pricing Configuration</h1>
        <p className="mt-1 text-sm text-slate-500">
          Define pricing rules for each intake flow. Rules are matched by flow, court level, case
          status, year range, and set type — the highest-priority match sets the ticket price.
        </p>
      </div>
      <PricingRulesBoard />
    </div>
  );
}
