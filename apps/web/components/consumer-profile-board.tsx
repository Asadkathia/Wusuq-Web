/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Home, KeyRound, MapPin, Save, Shield, User as UserIcon } from 'lucide-react';
import { CONSUMER_KINDS, CONSUMER_KIND_LABELS, type ConsumerKind } from '@wusuq/shared';
import { apiClient } from '@/lib/api-client';
import { advanceOnEnter } from '@/lib/form-utils';
import { COUNTRIES, findCountry } from '@/lib/countries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { PanelCard } from '@/components/ui/panel-card';
import { Select } from '@/components/ui/select';
import { CountryPicker } from '@/components/ui/country-picker';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';

type GeoRow = { id: string; name: string };

// PK numbers are validated strictly (mirrors signup); anything else is a
// generic 7-15 digit check bounded to stay under the server's E.164 cap once
// the dial prefix is composed on (H1/H3 — same rules as signup, kept local
// since the signup page duplicates them the same way rather than sharing a
// lib module).
const PK_PHONE_REGEX = /^(\+?92|0)?3\d{9}$/;
const GENERIC_PHONE_REGEX = /^(?:\D*\d){7,15}\D*$/;

// Best-effort split of a stored E.164 number into { countryCode, local } when
// the account's `country` field isn't on file (legacy rows). Picks the
// longest matching dial code among all known countries to reduce ambiguity.
function splitByKnownDial(e164: string): { countryCode: string; local: string } {
  const digits = e164.replace(/^\+/, '');
  let bestCode = '';
  let bestDial = '';
  for (const c of COUNTRIES) {
    if (digits.startsWith(c.dial) && c.dial.length > bestDial.length) {
      bestCode = c.code;
      bestDial = c.dial;
    }
  }
  return bestCode ? { countryCode: bestCode, local: digits.slice(bestDial.length) } : { countryCode: '', local: digits };
}

export function ConsumerProfileBoard() {
  const [tab, setTab] = useState('general');
  const [loading, setLoading] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [phone, setPhone] = useState(''); // local digits only; dial prefix composed at save
  const [cnic, setCnic] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [consumerKind, setConsumerKind] = useState<ConsumerKind | ''>('');

  // Address + location (H1) — same province→district→city cascade as
  // /consumer/onboarding, reusing the /geo/provinces|districts|cities endpoints.
  const [address, setAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [provinceId, setProvinceId] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [cityName, setCityName] = useState('');
  const [provinces, setProvinces] = useState<GeoRow[]>([]);
  const [districts, setDistricts] = useState<GeoRow[]>([]);
  const [cities, setCities] = useState<GeoRow[]>([]);
  // Server-provided names, resolved to ids once their parent list has loaded.
  const [pendingProvinceName, setPendingProvinceName] = useState<string | null>(null);
  const [pendingDistrictName, setPendingDistrictName] = useState<string | null>(null);

  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');

  const toast = useToast();

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('wusuq_user') || 'null') as any;
      if (u) {
        setName(u.name ?? '');
        setEmail(u.email ?? '');
      }
    } catch {}
    apiClient
      .get<any>('/users/me')
      .then((r) => {
        if (r?.name) setName(r.name);
        if (r?.email) setEmail(r.email);
        if (r?.cnic) setCnic(r.cnic);
        if (r?.dateOfBirth) setDateOfBirth(String(r.dateOfBirth).slice(0, 10));
        if (r?.consumerKind) setConsumerKind(r.consumerKind as ConsumerKind);
        if (r?.address) setAddress(r.address);
        if (r?.postalCode) setPostalCode(r.postalCode);
        if (r?.city) setCityName(r.city);
        if (r?.province) setPendingProvinceName(r.province);
        if (r?.district) setPendingDistrictName(r.district);

        if (r?.phone) {
          const isoCountry = typeof r.country === 'string' ? r.country : '';
          if (isoCountry) {
            const dial = findCountry(isoCountry).dial;
            const digits = String(r.phone).replace(/^\+/, '');
            setCountryCode(isoCountry);
            setPhone(digits.startsWith(dial) ? digits.slice(dial.length) : digits);
          } else {
            const split = splitByKnownDial(String(r.phone));
            setCountryCode(split.countryCode);
            setPhone(split.local);
          }
        } else if (typeof r?.country === 'string' && r.country) {
          setCountryCode(r.country);
        }
      })
      .catch(() => {});
    apiClient
      .get<GeoRow[]>('/geo/provinces')
      .then((rows) => setProvinces(rows))
      .catch(() => {});
  }, []);

  // Resolve a pending server-supplied province name to its id once the
  // province list has loaded.
  useEffect(() => {
    if (!pendingProvinceName || provinces.length === 0) return;
    const match = provinces.find((p) => p.name === pendingProvinceName);
    if (match) setProvinceId(match.id);
    setPendingProvinceName(null);
  }, [pendingProvinceName, provinces]);

  // Cascading: province → districts.
  useEffect(() => {
    if (!provinceId) {
      setDistricts([]);
      return;
    }
    apiClient
      .get<GeoRow[]>(`/geo/provinces/${provinceId}/districts`)
      .then((rows) => setDistricts(rows))
      .catch(() => {});
  }, [provinceId]);

  // Resolve a pending server-supplied district name once its list has loaded.
  useEffect(() => {
    if (!pendingDistrictName || districts.length === 0) return;
    const match = districts.find((d) => d.name === pendingDistrictName);
    if (match) setDistrictId(match.id);
    setPendingDistrictName(null);
  }, [pendingDistrictName, districts]);

  // Cascading: district → cities.
  useEffect(() => {
    if (!districtId) {
      setCities([]);
      return;
    }
    apiClient
      .get<GeoRow[]>(`/geo/districts/${districtId}/cities`)
      .then((rows) => setCities(rows))
      .catch(() => {});
  }, [districtId]);

  const provinceName = provinces.find((p) => p.id === provinceId)?.name;
  const districtName = districts.find((d) => d.id === districtId)?.name;

  const initials = (name || email || '?')
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const composePhone = (): string | undefined => {
    const trimmed = phone.trim();
    if (!trimmed || !countryCode) return undefined;
    const digits = trimmed.replace(/[\s\-()]/g, '').replace(/^\+/, '').replace(/^0+/, '');
    const dial = findCountry(countryCode).dial;
    return digits.startsWith(dial) ? `+${digits}` : `+${dial}${digits}`;
  };

  const saveGeneral = async (e: FormEvent) => {
    e.preventDefault();

    if (phone.trim() && countryCode) {
      const phoneValid =
        countryCode === 'PK'
          ? PK_PHONE_REGEX.test(phone.trim())
          : GENERIC_PHONE_REGEX.test(phone.trim());
      if (!phoneValid) {
        toast.error('Enter a valid mobile number');
        return;
      }
    }

    setLoading(true);
    try {
      const composedPhone = composePhone();
      const res = await apiClient.post<any>('/auth/profile/complete', {
        name,
        ...(composedPhone ? { phone: composedPhone } : {}),
        ...(countryCode ? { country: countryCode } : {}),
        ...(cnic ? { cnic } : {}),
        ...(dateOfBirth ? { dateOfBirth } : {}),
        ...(consumerKind ? { consumerKind } : {}),
        ...(address.trim() ? { address: address.trim() } : {}),
        ...(postalCode.trim() ? { postalCode: postalCode.trim() } : {}),
        ...(provinceName ? { province: provinceName } : {}),
        ...(districtName ? { district: districtName } : {}),
        ...(cityName ? { cityName } : {}),
      });
      toast.success('Profile updated', 'Your changes have been saved.');
      // Refresh localStorage.wusuq_user (mirrors /consumer/onboarding) so the
      // dashboard's ProfileCompletionBanner re-evaluates on next mount instead
      // of relying on stale data from login (H5).
      try {
        const raw = localStorage.getItem('wusuq_user');
        const u = raw ? JSON.parse(raw) : {};
        localStorage.setItem(
          'wusuq_user',
          JSON.stringify({
            ...u,
            name,
            city: res?.city ?? cityName ?? u.city,
            consumerKind: res?.consumerKind ?? consumerKind ?? u.consumerKind,
          }),
        );
      } catch {}
    } catch (err: any) {
      toast.error('Update failed', err?.message);
    } finally {
      setLoading(false);
    }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (pwNew !== pwConfirm) {
      toast.error('Passwords do not match');
      return;
    }
    if (pwNew.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setPwLoading(true);
    try {
      await apiClient.patch('/users/me/password', { currentPassword: pwCurrent, newPassword: pwNew });
      toast.success('Password updated');
      setPwCurrent(''); setPwNew(''); setPwConfirm('');
    } catch (err: any) {
      toast.error('Password update failed', err?.message);
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Profile</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your account details and security.</p>
      </div>

      {/* Identity card */}
      <PanelCard className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-xl font-semibold text-brand-700 ring-1 ring-inset ring-brand-500/10">
            {initials}
          </div>
          <div>
            <p className="text-lg font-semibold tracking-tight text-slate-900">{name || 'Your account'}</p>
            <p className="text-sm text-slate-500">{email}</p>
          </div>
        </div>
      </PanelCard>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="general"><UserIcon className="h-3.5 w-3.5 mr-1.5" />General</TabsTrigger>
          <TabsTrigger value="security"><Shield className="h-3.5 w-3.5 mr-1.5" />Security</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <PanelCard>
            <form onSubmit={saveGeneral} onKeyDown={advanceOnEnter} className="space-y-6">
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField label="Full name" htmlFor="name">
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
                </FormField>
                <FormField label="Email" hint="Email changes are not supported online — contact support.">
                  <Input value={email} disabled />
                </FormField>
                <FormField label="CNIC" htmlFor="cnic">
                  <Input id="cnic" value={cnic} onChange={(e) => setCnic(e.target.value)} placeholder="XXXXX-XXXXXXX-X" />
                </FormField>
                <FormField label="Date of birth" htmlFor="dob">
                  <Input id="dob" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
                </FormField>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <FormField label="Country" htmlFor="country">
                  <CountryPicker value={countryCode} onChange={setCountryCode} />
                </FormField>
                <FormField label="Phone" htmlFor="phone">
                  <div className="flex items-stretch gap-2">
                    <span className="flex items-center rounded-xl border border-border-soft bg-surface-muted/50 px-3 text-sm font-medium text-slate-700">
                      {countryCode ? `+${findCountry(countryCode).dial}` : '+—'}
                    </span>
                    <Input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder={countryCode === 'PK' ? '03001234567' : 'Phone number'}
                      maxLength={countryCode === 'PK' ? 10 : 15}
                    />
                  </div>
                </FormField>
              </div>

              <div className="space-y-4 border-t border-border-soft pt-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <UserIcon className="h-4 w-4 text-brand-500" /> User type
                </div>
                <div role="radiogroup" aria-label="User type" className="grid grid-cols-3 gap-2">
                  {CONSUMER_KINDS.map((kind) => {
                    const selected = consumerKind === kind;
                    return (
                      <button
                        key={kind}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setConsumerKind(kind)}
                        className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                          selected
                            ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-500'
                            : 'border-border-soft bg-surface text-slate-600 hover:border-brand-300 hover:text-slate-900'
                        }`}
                      >
                        {CONSUMER_KIND_LABELS[kind]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4 border-t border-border-soft pt-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <MapPin className="h-4 w-4 text-brand-500" /> Location
                </div>
                <div className="grid gap-5 sm:grid-cols-3">
                  <FormField label="Province" htmlFor="province">
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
                  <FormField label="District" htmlFor="district">
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
                  <FormField label="City" htmlFor="city">
                    <Select
                      value={cityName}
                      onChange={(v) => setCityName(v)}
                      options={cities.map((c) => ({ value: c.name, label: c.name }))}
                      placeholder={districtId ? 'Select city' : 'Select a district first'}
                      searchable
                    />
                  </FormField>
                </div>
              </div>

              <div className="space-y-4 border-t border-border-soft pt-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Home className="h-4 w-4 text-brand-500" /> Address
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField label="Street address" htmlFor="address">
                    <Input
                      id="address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="House / street / area"
                    />
                  </FormField>
                  <FormField label="Postal code" htmlFor="postalCode">
                    <Input
                      id="postalCode"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      placeholder="e.g. 44000"
                    />
                  </FormField>
                </div>
              </div>

              <div className="flex items-center justify-end">
                <Button type="submit" variant="brand" loading={loading} leftIcon={<Save className="h-4 w-4" />}>
                  Save changes
                </Button>
              </div>
            </form>
          </PanelCard>
        </TabsContent>

        <TabsContent value="security">
          <PanelCard>
            <form onSubmit={savePassword} onKeyDown={advanceOnEnter} className="space-y-5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
                  <KeyRound className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Change password</p>
                  <p className="text-xs text-slate-500">Use a strong, unique password for your account.</p>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <FormField label="Current password" required htmlFor="pwCurrent">
                  <Input id="pwCurrent" type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} required />
                </FormField>
                <div />
                <FormField label="New password" required hint="Minimum 8 characters" htmlFor="pwNew">
                  <Input id="pwNew" type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} required />
                </FormField>
                <FormField label="Confirm new password" required htmlFor="pwConfirm">
                  <Input id="pwConfirm" type="password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} required />
                </FormField>
              </div>

              <div className="flex items-center justify-end">
                <Button type="submit" variant="brand" loading={pwLoading} leftIcon={<Shield className="h-4 w-4" />}>
                  Update password
                </Button>
              </div>
            </form>
          </PanelCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
