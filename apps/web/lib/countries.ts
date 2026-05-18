export type Country = {
  code: string;
  name: string;
  flag: string;
  /** E.164 country calling code (without the leading +). */
  dial: string;
};

export const DEFAULT_COUNTRY_CODE = 'PK';

export const COUNTRIES: Country[] = [
  { code: 'PK', name: 'Pakistan', flag: '🇵🇰', dial: '92' },
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪', dial: '971' },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦', dial: '966' },
  { code: 'QA', name: 'Qatar', flag: '🇶🇦', dial: '974' },
  { code: 'KW', name: 'Kuwait', flag: '🇰🇼', dial: '965' },
  { code: 'BH', name: 'Bahrain', flag: '🇧🇭', dial: '973' },
  { code: 'OM', name: 'Oman', flag: '🇴🇲', dial: '968' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', dial: '44' },
  { code: 'US', name: 'United States', flag: '🇺🇸', dial: '1' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', dial: '1' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺', dial: '61' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', dial: '49' },
  { code: 'FR', name: 'France', flag: '🇫🇷', dial: '33' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹', dial: '39' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸', dial: '34' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱', dial: '31' },
  { code: 'SE', name: 'Sweden', flag: '🇸🇪', dial: '46' },
  { code: 'NO', name: 'Norway', flag: '🇳🇴', dial: '47' },
  { code: 'DK', name: 'Denmark', flag: '🇩🇰', dial: '45' },
  { code: 'IE', name: 'Ireland', flag: '🇮🇪', dial: '353' },
  { code: 'CH', name: 'Switzerland', flag: '🇨🇭', dial: '41' },
  { code: 'BE', name: 'Belgium', flag: '🇧🇪', dial: '32' },
  { code: 'AT', name: 'Austria', flag: '🇦🇹', dial: '43' },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹', dial: '351' },
  { code: 'PL', name: 'Poland', flag: '🇵🇱', dial: '48' },
  { code: 'TR', name: 'Türkiye', flag: '🇹🇷', dial: '90' },
  { code: 'IN', name: 'India', flag: '🇮🇳', dial: '91' },
  { code: 'BD', name: 'Bangladesh', flag: '🇧🇩', dial: '880' },
  { code: 'LK', name: 'Sri Lanka', flag: '🇱🇰', dial: '94' },
  { code: 'NP', name: 'Nepal', flag: '🇳🇵', dial: '977' },
  { code: 'AF', name: 'Afghanistan', flag: '🇦🇫', dial: '93' },
  { code: 'IR', name: 'Iran', flag: '🇮🇷', dial: '98' },
  { code: 'IQ', name: 'Iraq', flag: '🇮🇶', dial: '964' },
  { code: 'JO', name: 'Jordan', flag: '🇯🇴', dial: '962' },
  { code: 'LB', name: 'Lebanon', flag: '🇱🇧', dial: '961' },
  { code: 'EG', name: 'Egypt', flag: '🇪🇬', dial: '20' },
  { code: 'MA', name: 'Morocco', flag: '🇲🇦', dial: '212' },
  { code: 'TN', name: 'Tunisia', flag: '🇹🇳', dial: '216' },
  { code: 'DZ', name: 'Algeria', flag: '🇩🇿', dial: '213' },
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬', dial: '234' },
  { code: 'KE', name: 'Kenya', flag: '🇰🇪', dial: '254' },
  { code: 'ZA', name: 'South Africa', flag: '🇿🇦', dial: '27' },
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾', dial: '60' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬', dial: '65' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩', dial: '62' },
  { code: 'TH', name: 'Thailand', flag: '🇹🇭', dial: '66' },
  { code: 'PH', name: 'Philippines', flag: '🇵🇭', dial: '63' },
  { code: 'VN', name: 'Vietnam', flag: '🇻🇳', dial: '84' },
  { code: 'CN', name: 'China', flag: '🇨🇳', dial: '86' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵', dial: '81' },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷', dial: '82' },
  { code: 'NZ', name: 'New Zealand', flag: '🇳🇿', dial: '64' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷', dial: '55' },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽', dial: '52' },
];

const FALLBACK: Country = { code: 'PK', name: 'Pakistan', flag: '🇵🇰', dial: '92' };

/** Lookup a country by ISO code. Returns Pakistan as fallback. */
export function findCountry(code: string): Country {
  return COUNTRIES.find((c) => c.code === code) ?? FALLBACK;
}
