'use client';

import { Select } from '@/components/ui/select';
import { COUNTRIES } from '@/lib/countries';

export function CountryPicker({
  value,
  onChange,
  ariaLabel = 'Country',
  placeholder = 'Select your country…',
  disabled,
}: {
  value: string;
  onChange: (code: string) => void;
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const options = COUNTRIES.map((c) => ({
    value: c.code,
    label: `${c.flag}  ${c.name}`,
    description: c.code,
  }));

  return (
    <Select
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder="Search country…"
      ariaLabel={ariaLabel}
      disabled={disabled}
    />
  );
}
