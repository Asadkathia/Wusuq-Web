/**
 * DSJ Lahore case-type → Lower Court subcourt mapping.
 *
 * The DSJ Lahore search-form dropdown lists ~83 case categories as a flat
 * vocabulary shared across all 36 Punjab districts. The owner's wizard
 * separates Lower Court services into 4 sub-courts (Sessions / Civil /
 * Magisterial / Family), so each case category needs to be tagged with the
 * sub-court(s) it belongs under for the case-type picker to populate.
 *
 * The DSJ form itself doesn't expose this categorization — we derive it from
 * the label using:
 *   1. Explicit suffix tags the form already uses: `(C)` = Civil,
 *      `(S)` = Sessions, `(M)` = Magisterial.
 *   2. Domain keywords (e.g. "Murder Cases" → Sessions; "Family Cases" →
 *      Family).
 *
 * A category that yields ZERO subcourt matches is left unmapped — the seeder
 * keeps the original row with `subCourt=null`, so it still appears in the
 * "no subcourt selected" view. We deliberately don't fan ambiguous rows out
 * to all four subcourts because that pollutes every list.
 */

/**
 * Return the set of Lower Court subcourts this case-type label belongs to.
 * Order is not significant; the seeder emits one row per entry.
 */
export function inferDsjSubCourts(label: string): string[] {
  const s = label.toLowerCase();
  const out = new Set<string>();

  // ── Explicit DSJ suffix tags (most reliable) ─────────────────────────────
  if (/\(c\)\s*$/i.test(label)) out.add('Civil Court');
  if (/\(s\)\s*$/i.test(label)) out.add('Sessions Court');
  if (/\(m\)\s*$/i.test(label)) out.add('Magisterial Court');

  // ── Family ───────────────────────────────────────────────────────────────
  if (/\bfamily\b/.test(s) || /\bguardian\b/.test(s)) {
    out.add('Family Court');
  }

  // ── Civil keywords (without explicit suffix) ────────────────────────────
  if (/\bcivil\b/.test(s)) out.add('Civil Court');
  if (/\brent\b/.test(s)) out.add('Civil Court');
  if (/\binsolvency\b/.test(s)) out.add('Civil Court');
  if (/\binsurance\b/.test(s)) out.add('Civil Court');
  if (/\boriginal suit\b/.test(s)) out.add('Civil Court');
  if (/\bregular civil suit\b/.test(s)) out.add('Civil Court');
  if (/\bsmall claim\b/.test(s)) out.add('Civil Court');
  if (/\bcommercial\b/.test(s)) out.add('Civil Court');
  if (/\bland acquisition\b/.test(s)) out.add('Civil Court');
  if (/\bsuccession certificate\b/.test(s)) out.add('Civil Court');
  if (/\bpauper\b/.test(s)) out.add('Civil Court');
  if (/\beducational institutions\b/.test(s)) out.add('Civil Court');
  if (/\bsui gas civil\b/.test(s)) out.add('Civil Court');

  // ── Sessions Court (serious criminal / appellate) ───────────────────────
  if (/\bmurder\b/.test(s)) out.add('Sessions Court');
  if (/\bhudood\b/.test(s)) out.add('Sessions Court');
  if (/\banti.?rape\b/.test(s)) out.add('Sessions Court');
  if (/\bsessions\b/.test(s)) out.add('Sessions Court');
  if (/\bcriminal appeals?\b/.test(s)) out.add('Sessions Court');
  if (/\bcriminal revisions?\b/.test(s)) out.add('Sessions Court');
  if (/\bcontempt of court\b/.test(s)) out.add('Sessions Court');
  if (/restoration of (appeals?|suits?|revisions?|applications?)/.test(s)) {
    // Restoration motions exist across all civil & criminal subcourts —
    // expose under both so consumers see them regardless of where they're
    // filing from.
    out.add('Civil Court');
    out.add('Sessions Court');
  }
  if (/\bsta cases\b/.test(s)) out.add('Sessions Court');
  if (/\bsections?\s*30\s+cases?\s+under\s+ppc\b/.test(s))
    out.add('Sessions Court');
  if (/\bist class cases?\s+under\s+ppc\b/.test(s)) out.add('Sessions Court');
  if (/\bmoney laundering\b/.test(s)) out.add('Sessions Court');
  if (/\bmedical board\b/.test(s)) out.add('Sessions Court');
  if (/\bapplication u\/s\s*491\b/.test(s)) out.add('Sessions Court');
  if (/\bapplication u\/s\s*476\b/.test(s)) out.add('Sessions Court');
  if (/\belectricity criminal\b/.test(s)) out.add('Sessions Court');
  if (/\bsui gas criminal\b/.test(s)) out.add('Sessions Court');
  if (/\bharrassment\b/.test(s) || /\bharassment\b/.test(s))
    out.add('Sessions Court');
  if (/\bwildlife\b/.test(s)) out.add('Sessions Court');
  // "Case Under PECA" without suffix → Sessions (PECA carries 5+ yr penalties)
  if (/\bpeca\b/.test(s) && !/\(m\)/i.test(label)) out.add('Sessions Court');
  // "Case Under Special & Local Law" without (M) → Sessions
  if (/special\s*&\s*local law/.test(s) && !/\(m\)/i.test(label))
    out.add('Sessions Court');

  // ── Magisterial Court (police-level / summary) ──────────────────────────
  if (/\bqalandra/.test(s)) out.add('Magisterial Court');
  if (/\btraffic challan\b/.test(s)) out.add('Magisterial Court');
  if (/\bminor offences\b/.test(s)) out.add('Magisterial Court');
  if (/\bcancellation of reports\b/.test(s)) out.add('Magisterial Court');
  if (/\bdischarge reports\b/.test(s)) out.add('Magisterial Court');
  if (/\bobjection petitions\b/.test(s)) out.add('Magisterial Court');
  if (/\bcomplaint under illegal dispossession\b/.test(s))
    out.add('Magisterial Court');
  if (/\bsuperdari\b/.test(s) && !/\(s\)/i.test(label))
    out.add('Magisterial Court');
  if (/\bapplication u\/s\s*22-?a\b/.test(s)) out.add('Magisterial Court');

  return Array.from(out);
}
