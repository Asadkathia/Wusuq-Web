'use client';

import { useEffect, useState, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Button } from '@/components/ui/button';
import { PanelCard } from '@/components/ui/panel-card';
import { ArrowLeft, ArrowRight, CheckCircle2, Home, MapPin } from 'lucide-react';

type GeoRow = { id: string; name: string };

const STEPS = ['Address', 'Location', 'Finish'] as const;

export default function ConsumerOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');

  const [provinceId, setProvinceId] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [cityName, setCityName] = useState('');

  const [provinces, setProvinces] = useState<GeoRow[]>([]);
  const [districts, setDistricts] = useState<GeoRow[]>([]);
  const [cities, setCities] = useState<GeoRow[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Pull the name set at signup (completeProfile requires it) + load provinces.
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('wusuq_user') || 'null') as { name?: string } | null;
      if (u?.name) startTransition(() => setName(u.name as string));
    } catch {
      // localStorage unavailable
    }
    apiClient
      .get<GeoRow[]>('/geo/provinces')
      .then((rows) => startTransition(() => setProvinces(rows)))
      .catch(() => {});
  }, []);

  // Cascading: province → districts.
  useEffect(() => {
    if (!provinceId) {
      startTransition(() => setDistricts([]));
      return;
    }
    apiClient
      .get<GeoRow[]>(`/geo/provinces/${provinceId}/districts`)
      .then((rows) => startTransition(() => setDistricts(rows)))
      .catch(() => {});
  }, [provinceId]);

  // Cascading: district → cities.
  useEffect(() => {
    if (!districtId) {
      startTransition(() => setCities([]));
      return;
    }
    apiClient
      .get<GeoRow[]>(`/geo/districts/${districtId}/cities`)
      .then((rows) => startTransition(() => setCities(rows)))
      .catch(() => {});
  }, [districtId]);

  const provinceName = provinces.find((p) => p.id === provinceId)?.name;
  const districtName = districts.find((d) => d.id === districtId)?.name;

  const skip = () => router.replace('/consumer/dashboard');

  const finish = async () => {
    setSaving(true);
    setError('');
    try {
      await apiClient.post('/auth/profile/complete', {
        name,
        ...(address.trim() ? { address: address.trim() } : {}),
        ...(postalCode.trim() ? { postalCode: postalCode.trim() } : {}),
        ...(provinceName ? { province: provinceName } : {}),
        ...(districtName ? { district: districtName } : {}),
        ...(cityName ? { cityName } : {}),
      });
      try {
        const raw = localStorage.getItem('wusuq_user');
        if (raw) {
          const u = JSON.parse(raw) as Record<string, unknown>;
          if (cityName) u.city = cityName;
          localStorage.setItem('wusuq_user', JSON.stringify(u));
        }
      } catch {
        // localStorage unavailable
      }
      router.replace('/consumer/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Finish setting up your profile</h1>
          <p className="mt-1 text-sm text-slate-500">
            A couple of quick details so we can serve you better. You can do this later.
          </p>
        </div>
        <button type="button" onClick={skip} className="text-sm font-medium text-slate-500 hover:text-slate-700">
          Skip for now
        </button>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                i + 1 < step
                  ? 'bg-brand-500 text-white'
                  : i + 1 === step
                    ? 'bg-brand-500 text-white ring-4 ring-brand-100'
                    : 'bg-slate-100 text-slate-500'
              }`}
            >
              {i + 1 < step ? '✓' : i + 1}
            </span>
            <span className={`text-sm ${i + 1 === step ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>{label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-slate-200" />}
          </div>
        ))}
      </div>

      <PanelCard className="space-y-5">
        {step === 1 && (
          <>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Home className="h-4 w-4 text-brand-500" /> Your address
            </div>
            <FormField label="Street address" htmlFor="ob-address">
              <Input
                id="ob-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="House / street / area"
              />
            </FormField>
            <FormField label="Postal code" htmlFor="ob-postal">
              <Input
                id="ob-postal"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="e.g. 44000"
              />
            </FormField>
          </>
        )}

        {step === 2 && (
          <>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <MapPin className="h-4 w-4 text-brand-500" /> Your location
            </div>
            <FormField label="Province" htmlFor="ob-province">
              <Select
                value={provinceId}
                onChange={(v) => {
                  setProvinceId(v);
                  setDistrictId('');
                  setCityName('');
                }}
                options={provinces.map((p) => ({ value: p.id, label: p.name }))}
                placeholder="Select province"
                searchable
              />
            </FormField>
            <FormField label="District" htmlFor="ob-district">
              <Select
                value={districtId}
                onChange={(v) => {
                  setDistrictId(v);
                  setCityName('');
                }}
                options={districts.map((d) => ({ value: d.id, label: d.name }))}
                placeholder={provinceId ? 'Select district' : 'Select a province first'}
                searchable
              />
            </FormField>
            <FormField label="City" htmlFor="ob-city">
              <Select
                value={cityName}
                onChange={(v) => setCityName(v)}
                options={cities.map((c) => ({ value: c.name, label: c.name }))}
                placeholder={districtId ? 'Select city' : 'Select a district first'}
                searchable
              />
            </FormField>
          </>
        )}

        {step === 3 && (
          <>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Review &amp; finish
            </div>
            <dl className="space-y-2 text-sm">
              <Row label="Address" value={address || '—'} />
              <Row label="Postal code" value={postalCode || '—'} />
              <Row label="Province" value={provinceName || '—'} />
              <Row label="District" value={districtName || '—'} />
              <Row label="City" value={cityName || '—'} />
            </dl>
            {error ? (
              <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
            ) : null}
          </>
        )}

        <div className="flex items-center justify-between pt-2">
          {step > 1 ? (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)} leftIcon={<ArrowLeft className="h-4 w-4" />}>
              Back
            </Button>
          ) : (
            <span />
          )}
          {step < STEPS.length ? (
            <Button variant="brand" onClick={() => setStep((s) => s + 1)} rightIcon={<ArrowRight className="h-4 w-4" />}>
              Next
            </Button>
          ) : (
            <Button variant="brand" onClick={finish} loading={saving}>
              {saving ? 'Saving…' : 'Finish'}
            </Button>
          )}
        </div>
      </PanelCard>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-slate-50 pb-1.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  );
}
