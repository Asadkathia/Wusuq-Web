'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { SectionHeader } from '@/components/ui/section-header';
import { PanelCard } from '@/components/ui/panel-card';
import { ChevronDown, ChevronRight, MapPin, Plus, RefreshCw, Trash2 } from 'lucide-react';

type GeoCity = { id: string; name: string };
type GeoDistrict = { id: string; name: string; cities: GeoCity[] };
type GeoProvince = { id: string; name: string; districts: GeoDistrict[] };

export function GeoManagementBoard() {
  const [provinces, setProvinces] = useState<GeoProvince[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Add forms
  const [newProvince, setNewProvince] = useState('');
  const [newDistrict, setNewDistrict] = useState<Record<string, string>>({});
  const [newCity, setNewCity] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<GeoProvince[]>('/geo/tree');
      setProvinces(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setMessage(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const msg = (text: string) => { setMessage(text); setTimeout(() => setMessage(''), 4000); };

  const seed = async () => {
    try {
      const res = await apiClient.post<{ message: string; created: Record<string, number> }>('/geo/seed', {});
      msg(`${res.message} — provinces: ${res.created.provinces}, districts: ${res.created.districts}, cities: ${res.created.cities}`);
      load();
    } catch (e: any) { msg(e.message || 'Seed failed'); }
  };

  const resetAndSeed = async () => {
    const confirmed = window.confirm(
      'This will delete all current provinces, districts, cities, courts, and police stations, then reseed from the bundled Pakistan dataset. Continue?',
    );
    if (!confirmed) return;

    try {
      const res = await apiClient.post<{ message: string; created: Record<string, number> }>(
        '/geo/reset-seed',
        {},
      );
      msg(
        `${res.message} — provinces: ${res.created.provinces}, districts: ${res.created.districts}, cities: ${res.created.cities}`,
      );
      load();
    } catch (e: any) {
      msg(e.message || 'Reset and reseed failed');
    }
  };

  const addProvince = async () => {
    if (!newProvince.trim()) return;
    try {
      await apiClient.post('/geo/provinces', { name: newProvince.trim() });
      setNewProvince('');
      msg('Province added');
      load();
    } catch (e: any) { msg(e.message || 'Failed'); }
  };

  const deleteProvince = async (id: string) => {
    try {
      await apiClient.delete(`/geo/provinces/${id}`);
      msg('Province deleted');
      load();
    } catch (e: any) { msg(e.message || 'Failed'); }
  };

  const addDistrict = async (provinceId: string) => {
    const name = newDistrict[provinceId]?.trim();
    if (!name) return;
    try {
      await apiClient.post(`/geo/provinces/${provinceId}/districts`, { name });
      setNewDistrict(p => ({ ...p, [provinceId]: '' }));
      msg('District added');
      load();
    } catch (e: any) { msg(e.message || 'Failed'); }
  };

  const deleteDistrict = async (id: string) => {
    try {
      await apiClient.delete(`/geo/districts/${id}`);
      msg('District deleted');
      load();
    } catch (e: any) { msg(e.message || 'Failed'); }
  };

  const addCity = async (districtId: string) => {
    const name = newCity[districtId]?.trim();
    if (!name) return;
    try {
      await apiClient.post(`/geo/districts/${districtId}/cities`, { name });
      setNewCity(p => ({ ...p, [districtId]: '' }));
      msg('City added');
      load();
    } catch (e: any) { msg(e.message || 'Failed'); }
  };

  const deleteCity = async (id: string) => {
    try {
      await apiClient.delete(`/geo/cities/${id}`);
      msg('City deleted');
      load();
    } catch (e: any) { msg(e.message || 'Failed'); }
  };

  const toggle = (id: string) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Geographic Management"
        description="Manage provinces, districts, and cities used for cost rule resolution at ticket intake."
        action={
          <div className="flex gap-2">
            <button
              onClick={resetAndSeed}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Reset & Reseed
            </button>
            <button
              onClick={seed}
              className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 transition-colors"
            >
              <MapPin className="h-4 w-4" />
              Seed Pakistan Data
            </button>
            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-surface px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-border-soft hover:bg-surface-muted disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        }
      />

      {message && (
        <div className={`p-4 rounded-xl text-sm font-medium ${message.toLowerCase().includes('fail') || message.toLowerCase().includes('error') ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
          {message}
        </div>
      )}

      {/* Add Province */}
      <PanelCard className="p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Add Province</h3>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-600"
            placeholder="Province name"
            value={newProvince}
            onChange={e => setNewProvince(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addProvince()}
          />
          <button
            onClick={addProvince}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
      </PanelCard>

      {/* Tree */}
      <div className="space-y-3">
        {loading && <p className="text-sm text-slate-400 text-center py-8">Loading...</p>}
        {!loading && provinces.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">No provinces yet. Use "Seed Pakistan Data" to populate.</p>
        )}
        {provinces.map(province => (
          <PanelCard key={province.id} className="overflow-hidden">
            {/* Province row */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
              <button
                onClick={() => toggle(province.id)}
                className="flex items-center gap-2 text-sm font-semibold text-slate-900 hover:text-primary-700"
              >
                {expanded[province.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <MapPin className="h-4 w-4 text-primary-500" />
                {province.name}
                <span className="text-xs font-normal text-slate-400">{province.districts.length} district{province.districts.length !== 1 ? 's' : ''}</span>
              </button>
              <button
                onClick={() => deleteProvince(province.id)}
                className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors rounded"
                title="Delete province"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {expanded[province.id] && (
              <div className="px-4 py-3 space-y-3">
                {/* Add district */}
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-600"
                    placeholder="New district name"
                    value={newDistrict[province.id] ?? ''}
                    onChange={e => setNewDistrict(p => ({ ...p, [province.id]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addDistrict(province.id)}
                  />
                  <button
                    onClick={() => addDistrict(province.id)}
                    className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 transition-colors"
                  >
                    <Plus className="h-3 w-3" /> District
                  </button>
                </div>

                {/* Districts */}
                {province.districts.map(district => (
                  <div key={district.id} className="border border-slate-100 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-slate-50/60">
                      <button
                        onClick={() => toggle(district.id)}
                        className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-primary-700"
                      >
                        {expanded[district.id] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        {district.name}
                        <span className="text-xs font-normal text-slate-400">{district.cities.length} cit{district.cities.length !== 1 ? 'ies' : 'y'}</span>
                      </button>
                      <button
                        onClick={() => deleteDistrict(district.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors rounded"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>

                    {expanded[district.id] && (
                      <div className="px-3 py-2 space-y-2">
                        {/* Add city */}
                        <div className="flex gap-2">
                          <input
                            className="flex-1 rounded border border-slate-200 px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-primary-600"
                            placeholder="New city name"
                            value={newCity[district.id] ?? ''}
                            onChange={e => setNewCity(p => ({ ...p, [district.id]: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && addCity(district.id)}
                          />
                          <button
                            onClick={() => addCity(district.id)}
                            className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-700 transition-colors"
                          >
                            <Plus className="h-3 w-3" /> City
                          </button>
                        </div>

                        {/* City list */}
                        <div className="flex flex-wrap gap-1.5">
                          {district.cities.map(city => (
                            <span
                              key={city.id}
                              className="group inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700"
                            >
                              {city.name}
                              <button
                                onClick={() => deleteCity(city.id)}
                                className="sm:opacity-0 sm:group-hover:opacity-100 text-slate-400 hover:text-rose-600 transition-all"
                              >
                                <Trash2 className="h-2.5 w-2.5" />
                              </button>
                            </span>
                          ))}
                          {district.cities.length === 0 && (
                            <span className="text-xs text-slate-400 italic">No cities yet</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {province.districts.length === 0 && (
                  <p className="text-xs text-slate-400 italic">No districts yet.</p>
                )}
              </div>
            )}
          </PanelCard>
        ))}
      </div>
    </div>
  );
}
