'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { Select } from '@/components/ui/select';
import { CountryPicker } from '@/components/ui/country-picker';
import { DEFAULT_COUNTRY_CODE } from '@/lib/countries';

type CityRow = { id: string; name: string; district?: string; province?: string };

export function ProfileStep({
  name,
  onNameChange,
  cityName,
  onCityChange,
  onSubmit,
  onSkip,
  loading,
}: {
  name: string;
  onNameChange: (v: string) => void;
  cityName: string;
  onCityChange: (v: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
  loading: boolean;
}) {
  const [cities, setCities] = useState<CityRow[]>([]);
  // Country picker is frontend-only for now; selection is held in local
  // component state and will be wired to pricing once the backend contract
  // is defined. Defaults to Pakistan.
  const [countryCode, setCountryCode] = useState<string>(DEFAULT_COUNTRY_CODE);

  useEffect(() => {
    apiClient
      .get<CityRow[]>('/geo/cities')
      .then((rows) => {
        setCities(rows);
      })
      .catch(() => {
        // city is optional — silent fall-through
      });
  }, []);

  // Disambiguate cross-region cities (e.g. Khanpur in Punjab vs Sindh) by
  // suffixing district/province into the value. Keeps the value a plain
  // string (matches the User.city column contract) and gives a unique React
  // key in the underlying Select option list.
  const cityOptions = cities.map((c) => {
    const suffix = [c.district, c.province].filter(Boolean).join(', ');
    return {
      value: suffix ? `${c.name}, ${suffix}` : c.name,
      label: c.name,
      description: [c.district, c.province].filter(Boolean).join(' · '),
    };
  });

  const valid = name.trim().length >= 2;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Tell us about you</h2>
        <p className="mt-1 text-sm text-slate-500">This helps us serve you better.</p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-slate-700">Full name *</span>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Ali Raza"
          className="rounded-xl border-0 px-3.5 py-2.5 text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-brand-500/50"
          autoFocus
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-slate-700">Country *</span>
        <CountryPicker value={countryCode} onChange={setCountryCode} />
        <span className="text-xs text-slate-500">
          Pricing is calculated based on your country.
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-slate-700">City (optional)</span>
        <Select
          value={cityName}
          onChange={onCityChange}
          options={cityOptions}
          placeholder="Search your city…"
          searchPlaceholder="Search city…"
          allowClear
          ariaLabel="City"
        />
      </label>

      <button
        type="button"
        onClick={onSubmit}
        disabled={!valid || loading}
        className="rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-40"
      >
        {loading ? 'Saving…' : 'Continue to dashboard →'}
      </button>

      <button
        type="button"
        onClick={onSkip}
        className="text-center text-xs text-slate-500 hover:underline"
      >
        I&apos;ll do this later
      </button>
    </div>
  );
}
