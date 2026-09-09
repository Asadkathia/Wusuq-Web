/**
 * One place for phone entry rules (batch-7 5.9 + 10.1).
 *
 * The rules were duplicated in the consumer signup page and the consumer
 * profile board, and were simply ABSENT from the Add-Representative form —
 * which is why the client could save `3001234567889998` there, and why the
 * only complaint that surfaced was a submit-time
 * "phone must be shorter than or equal to 16 characters" rendered under the
 * JazzCash box. He also demonstrated the opposite end: "it works in 9 digits
 * too" (the saved list shows `+9230012345`).
 *
 * Every form composes `+<dial><local digits>`, so the LOCAL field must never
 * carry the trunk `0` — with a `+92` prefix already on screen, the old
 * `03001234567` placeholder taught people to type a number that composes to
 * the invalid `+9203001234567`.
 */

/** E.164: `+` plus at most 15 digits. Mirrors the API's @MaxLength(16). */
export const MAX_E164_LENGTH = 16;

/** Pakistan mobile: 10 local digits starting `3` (e.g. 3001234567). */
export const PK_LOCAL_PHONE_REGEX = /^3\d{9}$/;

/** Everything else: 7–15 local digits. */
export const GENERIC_LOCAL_PHONE_REGEX = /^\d{7,15}$/;

/** Placeholder for the LOCAL part — never with the trunk zero. */
export function phonePlaceholder(countryCode: string): string {
  return countryCode === 'PK' ? '3001234567' : 'Phone number';
}

/** Max characters the local input should accept for this country. */
export function phoneMaxLength(countryCode: string): number {
  return countryCode === 'PK' ? 10 : 15;
}

/**
 * Strip anything that is not a digit, then drop leading zeros — a PK user
 * typing `03001234567` out of habit still yields `3001234567`.
 */
export function normalizeLocalPhone(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^0+/, '');
}

/** `+<dial><local>`, with the local part normalised first. */
export function composeE164(local: string, dialCode: string): string {
  const digits = normalizeLocalPhone(local);
  const dial = String(dialCode).replace(/\D/g, '');
  return `+${dial}${digits}`;
}

/**
 * Validate the LOCAL part for a country.
 * @returns an error message, or null when valid.
 */
export function validateLocalPhone(
  local: string,
  countryCode: string,
  dialCode: string,
): string | null {
  const digits = normalizeLocalPhone(local);
  if (!digits) return 'Mobile number is required.';
  if (countryCode === 'PK') {
    if (!PK_LOCAL_PHONE_REGEX.test(digits)) {
      return 'Enter a 10-digit Pakistani mobile number starting with 3 (e.g. 3001234567).';
    }
  } else if (!GENERIC_LOCAL_PHONE_REGEX.test(digits)) {
    return 'Enter a valid mobile number (7–15 digits).';
  }
  // The composed-length check is the one the local cap alone cannot
  // guarantee: a multi-digit dial code can push a locally-valid number past
  // the server's 16-character limit.
  if (composeE164(digits, dialCode).length > MAX_E164_LENGTH) {
    return `Number is too long — at most ${MAX_E164_LENGTH - 1} digits including the country code.`;
  }
  return null;
}
