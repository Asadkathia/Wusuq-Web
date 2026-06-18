import { PromoCodesBoard } from '@/components/promo-codes-board';

export default function PromosPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Promo Codes</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage promotional discount codes. Codes can be percentage-based or fixed-amount, with
          optional validity windows, usage caps, and service-scope restrictions.
        </p>
      </div>
      <PromoCodesBoard />
    </div>
  );
}
