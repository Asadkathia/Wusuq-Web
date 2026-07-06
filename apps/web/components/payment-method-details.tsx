export type PayMethod = 'BANK_TRANSFER' | 'JAZZ_CASH' | 'EASY_PAISA';
export interface PaymentSettingsView {
  bankName?: string | null; accountTitle?: string | null; accountNumber?: string | null;
  iban?: string | null; jazzCash?: string | null; easyPaisa?: string | null;
  instructions?: string | null;
}
const LABELS: Record<PayMethod, string> = {
  BANK_TRANSFER: 'Bank transfer', JAZZ_CASH: 'JazzCash', EASY_PAISA: 'Easypaisa',
};
export function availableMethods(s: PaymentSettingsView | null | undefined): PayMethod[] {
  if (!s) return [];
  const out: PayMethod[] = [];
  if ((s.accountNumber ?? '').trim() || (s.bankName ?? '').trim()) out.push('BANK_TRANSFER');
  if ((s.jazzCash ?? '').trim()) out.push('JAZZ_CASH');
  if ((s.easyPaisa ?? '').trim()) out.push('EASY_PAISA');
  return out;
}
function Row({ label, value }: { label: string; value?: string | null }) {
  if (!(value ?? '').trim()) return null;
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}
export function PaymentMethodDetails({ settings, method, onChange }: {
  settings: PaymentSettingsView | null | undefined; method: PayMethod | null; onChange: (m: PayMethod) => void;
}) {
  const methods = availableMethods(settings);
  if (methods.length === 0) return null;
  const active = method && methods.includes(method) ? method : methods[0];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {methods.map((m) => (
          <button key={m} type="button" onClick={() => onChange(m)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ${
              m === active ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-surface text-slate-600 ring-border-soft'}`}>
            {LABELS[m]}
          </button>
        ))}
      </div>
      <div className="rounded-xl ring-1 ring-border-soft bg-surface px-4 py-3">
        {active === 'BANK_TRANSFER' && (<>
          <Row label="Bank" value={settings?.bankName} />
          <Row label="Account title" value={settings?.accountTitle} />
          <Row label="Account number" value={settings?.accountNumber} />
          <Row label="IBAN" value={settings?.iban} />
        </>)}
        {active === 'JAZZ_CASH' && <Row label="JazzCash" value={settings?.jazzCash} />}
        {active === 'EASY_PAISA' && <Row label="Easypaisa" value={settings?.easyPaisa} />}
        <Row label="Instructions" value={settings?.instructions} />
      </div>
    </div>
  );
}
