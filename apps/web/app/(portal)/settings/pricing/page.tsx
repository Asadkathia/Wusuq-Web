import { PricingRulesBoard } from '@/components/pricing-rules-board';
import { TaxSettingsForm } from '@/components/tax-settings-form';

export default function PricingSettingsPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Pricing Configuration</h1>
        <p className="mt-1 text-sm text-slate-500">
          Define pricing rules for each intake flow. Rules are matched by flow, court level, case
          status, year range, and set type — the highest-priority match sets the ticket price.
        </p>
      </div>

      {/* ── Tax Settings ─────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Tax</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Configure the applicable tax rate shown on consumer invoices.
          </p>
        </div>
        <TaxSettingsForm />
      </section>

      {/* ── Pricing Rules ─────────────────────────────────────────────────────── */}
      <section>
        <PricingRulesBoard />
      </section>
    </div>
  );
}
