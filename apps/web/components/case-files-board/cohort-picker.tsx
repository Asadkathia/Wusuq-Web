'use client';

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { CityBlock, JudicialServiceBlock } from '@/components/intake-wizard/service-geo-blocks';
import { ServiceCardGrid } from '@/components/intake-wizard';
import type { ServiceHit, CityCourt, CityCourtGroup } from '@/components/intake-wizard/types';

type Service = {
  id: string;
  name: string;
  category?: string;
  courtLevel?: string | null;
  description?: string;
};

type City = { id: string; name: string; district?: string; province?: string };

export type CohortValue = {
  serviceId: string;
  serviceName: string;
  cityId: string;
  cityName: string;
  courtName: string;
  courtType: string;
};

type Props = {
  value: Partial<CohortValue>;
  onChange: (value: Partial<CohortValue>) => void;
};

export function CohortPicker({ value, onChange }: Props) {
  const [services, setServices] = useState<Service[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [cityCourtGroups, setCityCourtGroups] = useState<CityCourtGroup[]>([]);

  useEffect(() => {
    apiClient
      .get<Service[] | { items?: Service[] }>('/services')
      .then((r) => {
        const items = Array.isArray(r) ? r : (r.items ?? []);
        setServices(items);
      })
      .catch(() => setServices([]));
    apiClient
      .get<City[]>('/geo/cities')
      .then((r) => setCities(r ?? []))
      .catch(() => setCities([]));
  }, []);

  // Load court groups whenever cityId changes externally (e.g. after a
  // controlled-reset from the parent).
  useEffect(() => {
    if (!value.cityId) {
      startTransition(() => setCityCourtGroups([]));
      return;
    }
    let cancelled = false;
    apiClient
      .get<CityCourtGroup[]>(`/geo/cities/${value.cityId}/courts`)
      .then((r) => {
        if (cancelled) return;
        startTransition(() => setCityCourtGroups(r ?? []));
      })
      .catch(() => {
        if (cancelled) return;
        startTransition(() => setCityCourtGroups([]));
      });
    return () => {
      cancelled = true;
    };
  }, [value.cityId]);

  const cityCourtTypes = useMemo(
    () => new Set(cityCourtGroups.map((g) => g.type)),
    [cityCourtGroups],
  );

  const availableServices: ServiceHit[] = useMemo(() => {
    const mapped: ServiceHit[] = services.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category ?? '',
      courtLevel: s.courtLevel ?? null,
      caseTypes: [],
    }));
    if (!value.cityId) return mapped;
    return mapped.filter((s) => !s.courtLevel || cityCourtTypes.has(s.courtLevel));
  }, [services, value.cityId, cityCourtTypes]);

  const selectedService = useMemo(
    () => services.find((s) => s.id === value.serviceId) ?? null,
    [services, value.serviceId],
  );
  const selectedCourtGroup = useMemo(() => {
    if (!selectedService?.courtLevel) return null;
    return cityCourtGroups.find((g) => g.type === selectedService.courtLevel) ?? null;
  }, [selectedService, cityCourtGroups]);
  const selectedCourtList: CityCourt[] = selectedCourtGroup?.courts ?? [];
  const selectedCourtType = selectedService?.courtLevel ?? '';

  const handleCityChange = useCallback(
    (cityId: string, cityName: string) => {
      // Reset service + court when the city changes — the previously
      // selected service may not be offered in the new city's tier list,
      // and any court name from the previous city is meaningless here.
      onChange({
        cityId,
        cityName,
        serviceId: undefined,
        serviceName: undefined,
        courtName: undefined,
        courtType: undefined,
      });
    },
    [onChange],
  );

  const handleServicePick = useCallback(
    (svc: ServiceHit) => {
      onChange({
        ...value,
        serviceId: svc.id,
        serviceName: svc.name,
        courtName: undefined,
        courtType: svc.courtLevel ?? undefined,
      });
    },
    [onChange, value],
  );

  const handleCourtPick = useCallback(
    (court: CityCourt) => {
      onChange({
        ...value,
        courtName: court.name,
        courtType: selectedCourtType,
      });
    },
    [onChange, value, selectedCourtType],
  );

  return (
    <div className="space-y-6">
      <CityBlock
        cities={cities}
        cityId={value.cityId ?? ''}
        onCityChange={handleCityChange}
      />

      {value.cityId ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">
            Service<span className="text-rose-500 ml-0.5">*</span>
          </p>
          {availableServices.length === 0 ? (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700 ring-1 ring-inset ring-amber-100">
              No services available for {value.cityName}. Pick a different city.
            </p>
          ) : (
            <ServiceCardGrid
              services={availableServices}
              value={value.serviceId ?? ''}
              onSelect={handleServicePick}
            />
          )}
        </div>
      ) : null}

      {value.serviceId && selectedService?.courtLevel && selectedCourtList.length > 0 ? (
        <JudicialServiceBlock
          courtTierId={value.serviceId}
          cityName={value.cityName ?? ''}
          courtTierName={selectedCourtType}
          services={selectedCourtList}
          selectServiceId={
            selectedCourtList.find((c) => c.name === value.courtName)?.id ?? ''
          }
          onServiceChange={handleCourtPick}
        />
      ) : null}
    </div>
  );
}
