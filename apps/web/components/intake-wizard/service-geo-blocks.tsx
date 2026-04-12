'use client';

type GeoState = {
  provinces: { id: string; name: string }[];
  districts: { id: string; name: string }[];
  policeStations: { id: string; name: string }[];
};

type GeoIds = { provinceId: string; districtId: string; cityId: string };

type JudicialCourtBlockProps = {
  serviceId: string;
  selectedServiceCourts: string[];
  courtCityOptions: string[];
  selectCourt: string;
  selectCourtCity: string;
  selectClass: string;
  onCourtChange: (court: string) => void;
  onCourtCityChange: (city: string) => void;
};

export function JudicialCourtBlock({
  serviceId,
  selectedServiceCourts,
  courtCityOptions,
  selectCourt,
  selectCourtCity,
  selectClass,
  onCourtChange,
  onCourtCityChange,
}: JudicialCourtBlockProps) {
  if (!serviceId) return null;
  return (
    <div className="md:col-span-2 grid gap-4 md:grid-cols-2 p-4 bg-slate-50 rounded-xl border border-slate-200">
      <label className="block">
        <span className="text-sm font-medium text-slate-700">
          Court<span className="text-rose-500 ml-0.5">*</span>
        </span>
        <select
          className={selectClass}
          value={selectCourt}
          onChange={(e) => onCourtChange(e.target.value)}
        >
          <option value="">— Select Court —</option>
          {selectedServiceCourts.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">
          Court City<span className="text-rose-500 ml-0.5">*</span>
        </span>
        <select
          className={selectClass}
          value={selectCourtCity}
          disabled={!selectCourt}
          onChange={(e) => onCourtCityChange(e.target.value)}
        >
          <option value="">— Select Court City —</option>
          {courtCityOptions.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>
        {selectCourt && courtCityOptions.length === 0 && (
          <p className="mt-1 text-xs text-slate-400">No cities configured for this court</p>
        )}
      </label>
    </div>
  );
}

type FirBlockProps = {
  geo: GeoState;
  geoIds: GeoIds;
  stationId: string;
  policeStation: string;
  cityType: string;
  inputClass: string;
  selectClass: string;
  onProvinceChange: (provinceId: string, name: string) => void;
  onDistrictChange: (districtId: string, name: string) => void;
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
  selectClass,
  onProvinceChange,
  onDistrictChange,
  onStationIdChange,
  onPoliceStationChange,
  onCityTypeChange,
}: FirBlockProps) {
  return (
    <div className="md:col-span-2 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Province<span className="text-rose-500 ml-0.5">*</span>
          </span>
          <select
            className={selectClass}
            value={geoIds.provinceId}
            onChange={(e) => {
              const opt = e.target.options[e.target.selectedIndex];
              onProvinceChange(e.target.value, opt?.text ?? '');
            }}
          >
            <option value="">— Province —</option>
            {geo.provinces.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            District<span className="text-rose-500 ml-0.5">*</span>
          </span>
          <select
            className={selectClass}
            value={geoIds.districtId}
            disabled={!geoIds.provinceId}
            onChange={(e) => {
              const opt = e.target.options[e.target.selectedIndex];
              onDistrictChange(e.target.value, opt?.text ?? '');
            }}
          >
            <option value="">— District —</option>
            {geo.districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {geoIds.districtId && geo.policeStations.length > 0 ? (
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Police Station<span className="text-rose-500 ml-0.5">*</span>
          </span>
          <select
            className={selectClass}
            value={stationId}
            onChange={(e) => {
              const opt = e.target.options[e.target.selectedIndex];
              onStationIdChange(e.target.value, opt?.text ?? '');
            }}
          >
            <option value="">— Police Station —</option>
            {geo.policeStations.map((ps) => (
              <option key={ps.id} value={ps.id}>
                {ps.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Police Station<span className="text-rose-500 ml-0.5">*</span>
          </span>
          <input
            className={inputClass}
            type="text"
            value={policeStation}
            disabled={!geoIds.districtId}
            onChange={(e) => onPoliceStationChange(e.target.value)}
            placeholder={
              !geoIds.districtId ? 'Select district first' : 'Enter police station name'
            }
          />
          {geoIds.districtId && (
            <p className="mt-1 text-xs text-slate-400">
              No configured stations for this district. Enter the police station manually.
            </p>
          )}
        </label>
      )}

      <fieldset>
        <legend className="text-sm font-medium text-slate-700">
          City Type<span className="text-rose-500 ml-0.5">*</span>
        </legend>
        <div className="flex gap-6 mt-2">
          {['City', 'Sadar', 'Unknown'].map((o) => (
            <label key={o} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="city_type"
                value={o}
                checked={cityType === o}
                onChange={() => onCityTypeChange(o)}
                className="h-4 w-4 text-primary-600 border-slate-300 focus:ring-primary-600"
              />
              <span className="text-sm text-slate-700">{o}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

type RegistryDeedBlockProps = {
  cityType: string;
  inputClass: string;
  onCityTypeChange: (value: string) => void;
};

export function RegistryDeedBlock({
  cityType,
  inputClass,
  onCityTypeChange,
}: RegistryDeedBlockProps) {
  return (
    <div className="md:col-span-2 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-slate-700">
          Office Name<span className="text-rose-500 ml-0.5">*</span>
        </span>
        <input className={`${inputClass} bg-slate-50`} type="text" value="Sub Registrar" readOnly />
      </label>

      <fieldset>
        <legend className="text-sm font-medium text-slate-700">
          City Type<span className="text-rose-500 ml-0.5">*</span>
        </legend>
        <div className="flex gap-6 mt-2">
          {['City', 'Sadar', 'Unknown'].map((o) => (
            <label key={o} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="city_type"
                value={o}
                checked={cityType === o}
                onChange={() => onCityTypeChange(o)}
                className="h-4 w-4 text-primary-600 border-slate-300 focus:ring-primary-600"
              />
              <span className="text-sm text-slate-700">{o}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
