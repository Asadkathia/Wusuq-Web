/**
 * Normalise a Pakistani phone number to E.164 format (+92XXXXXXXXXX).
 *
 * Accepts:
 *   03XXXXXXXXX  → +9203XXXXXXXXX  (local mobile)
 *   923XXXXXXXXX → +923XXXXXXXXX   (country code without +)
 *   +923XXXXXXXXX → unchanged
 *
 * Returns `null` if the number cannot be normalised.
 */
export function formatPakistaniPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const digits = raw.replace(/[\s\-().+]/g, '');

  // Already E.164 with country code
  if (/^92\d{10}$/.test(digits)) return `+${digits}`;

  // Local format: starts with 0
  if (/^0\d{10}$/.test(digits)) return `+92${digits.slice(1)}`;

  // Has leading +92 stripped
  if (/^\+92\d{10}$/.test(raw.trim())) return raw.trim();

  return null;
}

export function formatPhoneForDisplay(raw: string | null | undefined): string {
  const e164 = formatPakistaniPhone(raw);
  if (!e164) return raw ?? '';

  // +92 3XX XXXXXXX
  const local = e164.slice(3); // remove +92
  return `+92 ${local.slice(0, 3)} ${local.slice(3)}`;
}
