'use client';

import { Select, type SelectOption } from '@/components/ui/select';
import { Building2, MapPin, MapPinned, ShieldAlert } from 'lucide-react';

type GeoState = {
  provinces: { id: string; name: string }[];
  districts: { id: string; name: string }[];
  cities: { id: string; name: string }[];
  policeStations: { id: string; name: string }[];
};

type GeoIds = { provinceId: string; districtId: string; cityId: string };

function toOptions(items: { id: string; name: string }[]): SelectOption[] {
  return items.map((item) => ({ value: item.id, label: item.name }));
}

function SectionHeader({ icon, title, description }: { icon: React.ReactNode; title: string; description?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-500">{icon}</span>
      <div>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        {description ? <p className="text-xs text-slate-500">{description}</p> : null}
      </div>
    </div>
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span className="mb-1.5 block text-sm font-medium text-slate-700">
      {children}
      {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
    </span>
  );
}

function ChipGroup({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value === o;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={[
              'inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium',
              'transition-[background-color,border-color,color] duration-150',
              active
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-border-soft bg-surface text-slate-700 hover:bg-surface-muted',
            ].join(' ')}
          >
            <span
              className={[
                'h-3.5 w-3.5 rounded-full border-2 transition-colors',
                active ? 'border-brand-500 bg-brand-500 ring-2 ring-inset ring-white' : 'border-slate-300',
              ].join(' ')}
            />
            {o}
          </button>
        );
      })}
    </div>
  );
}

// ─── Location Block (Province → District → City) ────────────────────────────
type LocationBlockProps = {
  geo: GeoState;
  geoIds: GeoIds;
  onProvinceChange: (provinceId: string, name: string) => void;
  onDistrictChange: (districtId: string, name: string) => void;
  onCityChange: (cityId: string, name: string) => void;
};

export function LocationBlock({
  geo,
  geoIds,
  onProvinceChange,
  onDistrictChange,
  onCityChange,
}: LocationBlockProps) {
  const provinceOptions = toOptions(geo.provinces);
  const districtOptions = toOptions(geo.districts);
  const cityOptions = toOptions(geo.cities);
  const findName = (items: { id: string; name: string }[], id: string) =>
    items.find((x) => x.id === id)?.name ?? '';

  return (
    <div className="md:col-span-2 rounded-2xl border border-border-soft bg-surface-muted/50 p-5 space-y-5">
      <SectionHeader
        icon={<MapPinned className="h-4 w-4" />}
        title="Service location"
        description="Tell us where this service is required — province, district, then city."
      />
      <div className="grid gap-4 md:grid-cols-3">
        <label className="block">
          <FieldLabel required>Province</FieldLabel>
          <Select
            value={geoIds.provinceId}
            onChange={(v) => onProvinceChange(v, findName(geo.provinces, v))}
            options={provinceOptions}
            placeholder="Select province"
            searchPlaceholder="Search provinces…"
            allowClear
            ariaLabel="Province"
          />
        </label>
        <label className="block">
          <FieldLabel required>District</FieldLabel>
          <Select
            value={geoIds.districtId}
            onChange={(v) => onDistrictChange(v, findName(geo.districts, v))}
            options={districtOptions}
            placeholder={geoIds.provinceId ? 'Select district' : 'Select province first'}
            searchPlaceholder="Search districts…"
            allowClear
            disabled={!geoIds.provinceId}
            ariaLabel="District"
          />
        </label>
        <label className="block">
          <FieldLabel required>City</FieldLabel>
          <Select
            value={geoIds.cityId}
            onChange={(v) => onCityChange(v, findName(geo.cities, v))}
            options={cityOptions}
            placeholder={geoIds.districtId ? 'Select city' : 'Select district first'}
            searchPlaceholder="Search cities…"
            allowClear
            disabled={!geoIds.districtId}
            ariaLabel="City"
          />
        </label>
      </div>
    </div>
  );
}

// ─── Judicial Court Block ────────────────────────────────────────────────────
type JudicialCourtBlockProps = {
  serviceId: string;
  courtOptions: string[];
  selectCourt: string;
  cityName: string;
  hasCity: boolean;
  onCourtChange: (court: string) => void;
};

export function JudicialCourtBlock({
  serviceId,
  courtOptions,
  selectCourt,
  cityName,
  hasCity,
  onCourtChange,
}: JudicialCourtBlockProps) {
  if (!serviceId) return null;
  return (
    <div className="md:col-span-2 rounded-2xl border border-border-soft bg-surface-muted/50 p-5 space-y-5">
      <SectionHeader
        icon={<Building2 className="h-4 w-4" />}
        title="Court & jurisdiction"
        description={cityName ? `Pick the court in ${cityName} handling this matter.` : 'Tell us which court this request applies to.'}
      />
      <label className="block">
        <FieldLabel required>Court</FieldLabel>
        <Select
          value={selectCourt}
          onChange={onCourtChange}
          options={courtOptions}
          placeholder={hasCity ? (courtOptions.length ? 'Select court' : 'No matching courts in this city') : 'Select a city first'}
          searchPlaceholder="Search courts…"
          allowClear
          disabled={!hasCity || courtOptions.length === 0}
          ariaLabel="Court"
        />
        {hasCity && courtOptions.length === 0 ? (
          <p className="mt-1 text-xs text-slate-400">
            No courts for this service are available in {cityName}. Pick a different city in Step 1.
          </p>
        ) : null}
      </label>
    </div>
  );
}

// ─── FIR Block ────────────────────────────────────────────────────────────────
type FirBlockProps = {
  geo: GeoState;
  geoIds: GeoIds;
  stationId: string;
  policeStation: string;
  cityType: string;
  inputClass: string;
  selectClass?: string;
  onStationIdChange: (id: string, name: string) => void;
  onPoliceStationChange: (value: string) => void;
  onCityTypeChange: (value: string) => void;
};

export function FirBlock({
  geo,
  geoIds,
  stationId,
  policeStation,
  cityType,
  inputClass,
  onStationIdChange,
  onPoliceStationChange,
  onCityTypeChange,
}: FirBlockProps) {
  const stationOptions = toOptions(geo.policeStations);
  const findName = (items: { id: string; name: string }[], id: string) =>
    items.find((x) => x.id === id)?.name ?? '';

  return (
    <div className="md:col-span-2 rounded-2xl border border-border-soft bg-surface-muted/50 p-5 space-y-5">
      <SectionHeader
        icon={<ShieldAlert className="h-4 w-4" />}
        title="FIR details"
        description="Select the police station handling the FIR."
      />

      {geoIds.districtId && geo.policeStations.length > 0 ? (
        <label className="block">
          <FieldLabel required>Police station</FieldLabel>
          <Select
            value={stationId}
            onChange={(v) => onStationIdChange(v, findName(geo.policeStations, v))}
            options={stationOptions}
            placeholder="Select police station"
            searchPlaceholder="Search police stations…"
            allowClear
            ariaLabel="Police station"
          />
        </label>
      ) : (
        <label className="block">
          <FieldLabel required>Police station</FieldLabel>
          <input
            className={inputClass}
            type="text"
            value={policeStation}
            disabled={!geoIds.districtId}
            onChange={(e) => onPoliceStationChange(e.target.value)}
            placeholder={!geoIds.districtId ? 'Choose a district in Step 1 first' : 'Enter police station name'}
          />
          {geoIds.districtId ? (
            <p className="mt-1 text-xs text-slate-400">
              No configured stations for this district. Enter the name manually.
            </p>
          ) : null}
        </label>
      )}

      <fieldset>
        <FieldLabel required>City type</FieldLabel>
        <ChipGroup options={['City', 'Sadar', 'Unknown']} value={cityType} onChange={onCityTypeChange} />
      </fieldset>
    </div>
  );
}

// ─── Registry / Deed Block ────────────────────────────────────────────────────
type RegistryDeedBlockProps = {
  cityType: string;
  inputClass: string;
  onCityTypeChange: (value: string) => void;
};

export function RegistryDeedBlock({ cityType, inputClass, onCityTypeChange }: RegistryDeedBlockProps) {
  return (
    <div className="md:col-span-2 rounded-2xl border border-border-soft bg-surface-muted/50 p-5 space-y-5">
      <SectionHeader
        icon={<MapPin className="h-4 w-4" />}
        title="Registry / deed location"
        description="This request routes to the local Sub-Registrar office."
      />
      <label className="block">
        <FieldLabel required>Office</FieldLabel>
        <input className={`${inputClass} bg-surface-muted`} type="text" value="Sub Registrar" readOnly />
      </label>

      <fieldset>
        <FieldLabel required>City type</FieldLabel>
        <ChipGroup options={['City', 'Sadar', 'Unknown']} value={cityType} onChange={onCityTypeChange} />
      </fieldset>
    </div>
  );
}
