/**
 * Seed pricing engine v2 from the authoritative xlsx source.
 *
 * Source: apps/api/data/pricing-sheet.xlsx
 * Run with: cd apps/api && npx tsx scripts/seed-pricing.ts
 *
 * The sheet has four worksheets; this script consumes the first two
 * ("Wusuq Service Rates & Clerk Rat" and "Attested Non Attested Both Rate")
 * and rebuilds the PricingRule table from scratch each run (idempotent).
 *
 * The pure parse (xlsx → PricingRule row drafts) is factored into
 * `buildJudicialRuleRows()` so it can be exercised WITHOUT a database — see
 * `scripts/verify-pricing-parse.ts`, which asserts every parse block
 * contributes rows and spot-checks known cells against the current
 * pricing-sheet.xlsx layout (2026-07 realignment, B13 root-cause fix).
 */
import { PrismaClient } from '@prisma/client';
import { buildNonJudicialPricingRows } from '@wusuq/shared';
import * as XLSX from 'xlsx';
import * as fs from 'node:fs';
import {
  buildUsdPricingRuleRows,
  USD_PRICING_ROW_COUNT,
} from '../data/usd-pricing';
import * as path from 'node:path';

const prisma = new PrismaClient();

// ── Constants ────────────────────────────────────────────────────────────────

type Region = 'Punjab' | 'other';
type YearBand =
  | 'pending'
  | 'current'
  | 'y2025'
  | 'y2024_2023'
  | 'y2022_2020'
  | 'y2019_2017'
  | 'y2016_back';
type SetType = 'attested' | 'non_attested' | 'both';

const COURT_LEVELS = [
  'Lower Court',
  'Special Court',
  'High Court',
  'Federal Shariat Court',
  'Supreme Court',
  'Federal Constitutional Court',
] as const;

// Maps the court header label found in the xlsx to our canonical courtLevel string.
function normalizeCourtHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  const h = header.toString().trim().toUpperCase();
  if (h.startsWith('LOWER')) return 'Lower Court';
  if (h.startsWith('SPECIAL') || h.startsWith('TRIBUNAL')) return 'Special Court';
  if (h.startsWith('HIGH')) return 'High Court';
  if (h.startsWith('FEDERAL SHARIAT')) return 'Federal Shariat Court';
  if (h.startsWith('FEDERAL CONSTITUTIONAL')) return 'Federal Constitutional Court';
  if (h.startsWith('SUPREME')) return 'Supreme Court';
  return null;
}

// Service row → flow key
function normalizeServiceRow(label: string | null | undefined): string | null {
  if (!label) return null;
  const l = label.toString().trim().toUpperCase();
  if (l.startsWith('CASE FILES')) return 'judicial_case_files';
  if (l.startsWith('CASE INFORMATION') || l.startsWith('CASE INFO')) return 'judicial_case_information';
  if (l.startsWith('CASE RECORD')) return 'judicial_case_record';
  if (l.startsWith('CASE SEARCH')) return 'judicial_case_search';
  if (l.startsWith('CASE FILING')) return 'judicial_case_filing';
  if (l.startsWith('POWER OF ATTORNEY')) return 'judicial_power_of_attorney';
  return null;
}

// Year-band cell text → canonical key.
function normalizeYearBand(label: string | null | undefined): YearBand | null {
  if (!label) return null;
  const l = label.toString().trim().toUpperCase();
  if (l === 'PENDING' || l.startsWith('PENDING') || l.includes('PENDING')) return 'pending';
  // The Punjab block labels its pending row "CASE FILES (Pending Cases)" but the
  // Other-than-Punjab block uses bare "CASE FILES". In the set-type matrix
  // context this row is always the pending case — without this branch the 6
  // tiers × 3 set-types of Other/pending rules silently fall off the seed and
  // outside-Punjab pending falls through to the current band (overcharging by
  // Rs 1,000-3,000).
  if (l === 'CASE FILES') return 'pending';
  if (l.startsWith('CASE RECORD (CURRENT YEAR)') || l.startsWith('CURRENT YEAR') || l === 'CURRENT')
    return 'current';
  if (l.startsWith('2025')) return 'y2025';
  if (l.startsWith('2024')) return 'y2024_2023';
  if (l.startsWith('2022')) return 'y2022_2020';
  if (l.startsWith('2019')) return 'y2019_2017';
  if (l.startsWith('2016')) return 'y2016_back';
  return null;
}

const YEAR_BAND_RANGES: Record<YearBand, { yearFrom: number | null; yearTo: number | null }> = {
  pending: { yearFrom: null, yearTo: null },
  current: { yearFrom: new Date().getFullYear(), yearTo: null },
  y2025: { yearFrom: 2025, yearTo: 2025 },
  y2024_2023: { yearFrom: 2023, yearTo: 2024 },
  y2022_2020: { yearFrom: 2020, yearTo: 2022 },
  y2019_2017: { yearFrom: 2017, yearTo: 2019 },
  y2016_back: { yearFrom: null, yearTo: 2016 },
};

// Parse a raw cell into either a number, a sentinel availability flag, or null.
// Audit 6.2: blank cells and the deliberate "Can't Get" sentinel are fine, but
// any other non-numeric garbage (#REF!, a shifted label) used to silently
// become amount:null → availability:false — indistinguishable from a real
// sentinel. Unparseable content now aborts the seed instead of corrupting it.
function parseCell(v: unknown): { amount: number | null; available: boolean } {
  if (v == null) return { amount: null, available: true };
  const s = v.toString().trim();
  if (!s) return { amount: null, available: true };
  if (/can'?t\s*get/i.test(s)) return { amount: null, available: false };
  // Strip trailing asterisks (e.g. "2000*").
  const cleaned = s.replace(/\*/g, '').replace(/,/g, '').trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n)) {
    throw new Error(
      `Unparseable pricing cell ${JSON.stringify(s)} — the sheet layout has ` +
        'probably shifted. Refusing to seed (a wrong parse here silently ' +
        "flips availability or prices to 0). Fix the xlsx or the parser's " +
        'coordinates.',
    );
  }
  return { amount: n, available: true };
}

// ── Sheet loading ────────────────────────────────────────────────────────────

const XLSX_PATH = path.join(__dirname, '..', 'data', 'pricing-sheet.xlsx');

function loadWorkbook(): XLSX.WorkBook {
  const buf = fs.readFileSync(XLSX_PATH);
  return XLSX.read(buf, { type: 'buffer' });
}

type Grid = (string | null)[][];

function sheetGrid(wb: XLSX.WorkBook, name: string): Grid {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`Sheet not found: ${name}`);
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false }) as Grid;
}

// ── Sheet 1 parser: headline service rates ──────────────────────────────────

type RuleDraft = {
  flow: string;
  courtLevel: string;
  region: Region;
  yearBand: YearBand;
  setType: SetType | null;
  basePrice: number | null;
  availability: boolean;
  clerkBaseCost: number | null;
  pdfSurchargeAmount: number;
  deliveryGuyFee: number;
};

export type PricingRuleRow = {
  name: string;
  flow: string;
  courtLevel: string;
  region: Region;
  yearBand: YearBand;
  yearFrom: number | null;
  yearTo: number | null;
  setType: SetType | null;
  basePrice: number;
  availability: boolean;
  clerkBaseCost: number | null;
  pdfSurchargeAmount: number;
  deliveryGuyFee: number;
  isLegacy: boolean;
  isActive: boolean;
  priority: number;
};

function pushHeadline(
  drafts: RuleDraft[],
  flow: string,
  courtLevel: string,
  region: Region,
  yearBand: YearBand,
  base: ReturnType<typeof parseCell>,
  clerk: ReturnType<typeof parseCell>,
) {
  // 5-19-26 CI#3: Case Information has no physical file to dispatch, so the
  // delivery guy line item (Rs 100) shouldn't fire. Same applies to Case
  // Search — the "result" is a digital info packet. PDF surcharge stays.
  const flowHasPhysicalDispatch =
    flow !== 'judicial_case_information' && flow !== 'judicial_case_search';
  drafts.push({
    flow,
    courtLevel,
    region,
    yearBand,
    setType: null,
    basePrice: base.amount,
    availability: base.available && base.amount != null,
    clerkBaseCost: clerk.amount,
    pdfSurchargeAmount: 300,
    deliveryGuyFee: flowHasPhysicalDispatch ? 100 : 0,
  });
}

// Parse a "headline rates" block: rows of services × tiers (WUSUQ/CLERK pairs).
// `headerRow` defines the tier columns; service rows live in `serviceRows`.
function parseHeadlineBlock(
  drafts: RuleDraft[],
  grid: Grid,
  region: Region,
  headerRow: number,
  serviceRows: number[],
  leftCol: number,
  rightCol: number,
) {
  // Build tier column map from headerRow between leftCol..rightCol.
  const tiers: { courtLevel: string; wusuqCol: number; clerkCol: number }[] = [];
  const headers = grid[headerRow] ?? [];
  for (let c = leftCol; c <= rightCol; c++) {
    const courtLevel = normalizeCourtHeader(headers[c]);
    if (courtLevel) tiers.push({ courtLevel, wusuqCol: c, clerkCol: c + 1 });
  }
  for (const r of serviceRows) {
    const row = grid[r];
    if (!row) continue;
    // The service label lives in col 0 (or the first non-null cell before
    // leftCol); the data tier columns start at leftCol.
    const flow = normalizeServiceRow(row[0]);
    if (!flow) continue;
    const label = (row[0] ?? '').toString().toUpperCase();
    // For Case Search the headline table uses asterisked "current year" rate.
    // For Case Record this is the "Current Year" rate; year bands live in the
    // right-hand sub-table.
    const yearBand: YearBand =
      flow === 'judicial_case_files'
        ? 'pending'
        : flow === 'judicial_case_record'
        ? 'current'
        : flow === 'judicial_case_search'
        ? 'current'
        : 'current';
    // Per 5-14-26 addendum: case record is an extension of case files when
    // case_status=Decided. Fold the headline "current year" rate onto
    // svc_judicial_case_files (yearBand=current) so a single service covers
    // the full pending → current → backward-band pricing arc.
    const targetFlow = flow === 'judicial_case_record' ? 'judicial_case_files' : flow;
    void label;
    for (const t of tiers) {
      const base = parseCell(row[t.wusuqCol]);
      const clerk = parseCell(row[t.clerkCol]);
      pushHeadline(drafts, targetFlow, t.courtLevel, region, yearBand, base, clerk);
    }
  }
}

// Right-hand Case Record band block.
function parseCaseRecordBands(
  drafts: RuleDraft[],
  grid: Grid,
  region: Region,
  tierHeaderRow: number,
  bandRows: number[],
  leftCol: number,
  rightCol: number,
  yearsCol: number,
) {
  const tiers: { courtLevel: string; wusuqCol: number; clerkCol: number }[] = [];
  const headers = grid[tierHeaderRow] ?? [];
  for (let c = leftCol; c <= rightCol; c++) {
    const courtLevel = normalizeCourtHeader(headers[c]);
    if (courtLevel) tiers.push({ courtLevel, wusuqCol: c, clerkCol: c + 1 });
  }
  for (const r of bandRows) {
    const row = grid[r];
    if (!row) continue;
    const yearBand = normalizeYearBand(row[yearsCol]);
    if (!yearBand) continue;
    for (const t of tiers) {
      const base = parseCell(row[t.wusuqCol]);
      const clerk = parseCell(row[t.clerkCol]);
      // Per 5-14-26 addendum: "The case record is an extension of the case
      // files when the case status is decided." Year-band rates flow onto
      // svc_judicial_case_files (yearBand ∈ y2025…y2016_back) so consumers
      // pick Case Files and set case_status=Decided to land on these rules.
      pushHeadline(drafts, 'judicial_case_files', t.courtLevel, region, yearBand, base, clerk);
    }
  }
}

// Case Search band sub-tables.
function parseCaseSearchBands(
  drafts: RuleDraft[],
  grid: Grid,
  region: Region,
  tierHeaderRow: number,
  bandRows: number[],
  leftCol: number,
  rightCol: number,
  yearsCol: number,
) {
  const tiers: { courtLevel: string; wusuqCol: number; clerkCol: number }[] = [];
  const headers = grid[tierHeaderRow] ?? [];
  for (let c = leftCol; c <= rightCol; c++) {
    const courtLevel = normalizeCourtHeader(headers[c]);
    if (courtLevel) tiers.push({ courtLevel, wusuqCol: c, clerkCol: c + 1 });
  }
  for (const r of bandRows) {
    const row = grid[r];
    if (!row) continue;
    const yearsCell = row[yearsCol];
    if (!yearsCell) continue;
    // The Case Search bands in the source sheet use bespoke ranges
    // (2023-2022, 2021-2019, 2018-2016, 2015-2014, 2013-onward; the
    // Other-than-Punjab table is even per-year 2022/2021/2020/2019).
    // Map them onto our canonical bands by overlap with the band ranges.
    const text = yearsCell.toString().trim();
    const yb = mapSearchRangeToBand(text);
    if (!yb) continue;
    for (const t of tiers) {
      const base = parseCell(row[t.wusuqCol]);
      const clerk = parseCell(row[t.clerkCol]);
      pushHeadline(drafts, 'judicial_case_search', t.courtLevel, region, yb, base, clerk);
    }
  }
}

function mapSearchRangeToBand(text: string): YearBand | null {
  const t = text.trim();
  if (/^2023-?\s*2022/.test(t)) return 'y2024_2023'; // overlap → use closest band
  if (/^2022(\b|$)/.test(t)) return 'y2022_2020';
  if (/^2021-?\s*2019/.test(t)) return 'y2022_2020';
  if (/^2021(\b|$)/.test(t)) return 'y2022_2020';
  if (/^2020(\b|$)/.test(t)) return 'y2022_2020';
  if (/^2019(\b|$)/.test(t)) return 'y2019_2017';
  if (/^2018-?\s*2016/.test(t)) return 'y2019_2017';
  if (/^2015/.test(t)) return 'y2016_back';
  if (/^2013/.test(t)) return 'y2016_back';
  return null;
}

// ── Sheet 2 parser: per-set-type, per-year-band, per-tier matrix ────────────

const SET_TYPE_COLUMNS: { offset: number; setType: SetType }[] = [
  { offset: 0, setType: 'attested' },
  { offset: 1, setType: 'non_attested' },
  { offset: 2, setType: 'both' },
];
const PDF_OFFSET = 3;
const DELIVERY_OFFSET = 4;

function parseSetTypeBlock(
  drafts: RuleDraft[],
  grid: Grid,
  region: Region,
  tierHeaderRow: number,
  bandRows: number[],
  // service-row offset col (col 0) holds the year-band label.
) {
  const tiers: { courtLevel: string; col: number }[] = [];
  const headers = grid[tierHeaderRow] ?? [];
  for (let c = 0; c < headers.length; c++) {
    const ch = normalizeCourtHeader(headers[c]);
    if (ch) tiers.push({ courtLevel: ch, col: c });
  }
  for (const r of bandRows) {
    const row = grid[r];
    if (!row) continue;
    const yearBand = normalizeYearBand(row[0]);
    if (!yearBand) continue;
    for (const t of tiers) {
      const pdfCell = parseCell(row[t.col + PDF_OFFSET]);
      const delCell = parseCell(row[t.col + DELIVERY_OFFSET]);
      const pdfAmount = pdfCell.amount ?? 300;
      const delAmount = delCell.amount ?? 100;
      for (const st of SET_TYPE_COLUMNS) {
        const cell = parseCell(row[t.col + st.offset]);
        drafts.push({
          flow: 'judicial_case_files',
          courtLevel: t.courtLevel,
          region,
          yearBand,
          setType: st.setType,
          basePrice: cell.amount,
          availability: cell.available && cell.amount != null,
          clerkBaseCost: null,
          pdfSurchargeAmount: pdfAmount,
          deliveryGuyFee: delAmount,
        });
      }
    }
  }
}

// ── Sheet 5 parser: per-set-type clerk rates ────────────────────────────────
//
// Sheet5 mirrors Sheet 2's set-type matrix but interleaves a "Clerk Rates"
// block after each tier's Wusuq block: each court tier's clerk block starts 6
// columns after its wusuq block (5 wusuq cols + 1 "Clerk Rates" label col).
// E.g. Lower wusuq starts col 1 → Lower clerk attested = col 1 + 6 = col 7.
//
// Result: clerkRateMap keyed by `${region}|${courtLevel}|${yearBand}|${setType}`
// → number, then merged into DRAFTS before insert.

type ClerkKey = string;

function parseClerkSetTypeBlock(
  clerkRateMap: Map<ClerkKey, number>,
  grid: Grid,
  region: Region,
  tierHeaderRow: number,
  bandRows: number[],
) {
  const tiers: { courtLevel: string; wusuqCol: number }[] = [];
  const headers = grid[tierHeaderRow] ?? [];
  for (let c = 0; c < headers.length; c++) {
    const ch = normalizeCourtHeader(headers[c]);
    if (ch) tiers.push({ courtLevel: ch, wusuqCol: c });
  }
  for (const r of bandRows) {
    const row = grid[r];
    if (!row) continue;
    const yearBand = normalizeYearBand(row[0]);
    if (!yearBand) continue;
    for (const t of tiers) {
      const clerkBase = t.wusuqCol + 6; // 5 wusuq cols + 1 separator → clerk attested
      for (const st of SET_TYPE_COLUMNS) {
        const cell = parseCell(row[clerkBase + st.offset]);
        if (cell.amount == null) continue;
        const k = `${region}|${t.courtLevel}|${yearBand}|${st.setType}`;
        clerkRateMap.set(k, cell.amount);
      }
    }
  }
}

// ── Pure parse: xlsx → PricingRule row drafts (no DB) ───────────────────────

// Audit 6.2: every parse block uses absolute row/column coordinates — a
// shifted sheet silently `continue`s rows and yields 0 drafts. Each block
// must contribute at least one draft or the seed aborts before the wipe.
function expectContribution(label: string, drafts: RuleDraft[], fn: () => void) {
  const before = drafts.length;
  fn();
  const added = drafts.length - before;
  if (added <= 0) {
    console.error(
      `Parse block "${label}" contributed 0 drafts — the sheet layout has ` +
        'probably shifted. Refusing to seed.',
    );
    process.exit(1);
  }
  console.log(`  ${label}: +${added} drafts`);
}

function buildName(d: RuleDraft): string {
  const parts = [d.flow, d.courtLevel, d.region, d.yearBand];
  if (d.setType) parts.push(d.setType);
  return parts.join(' – ');
}

/**
 * Parses `pricing-sheet.xlsx` sheets 1 ("Wusuq Service Rates & Clerk Rat"),
 * 2 ("Attested Non Attested Both Rate") and 5 (clerk set-type rates) into
 * PricingRule row drafts. Pure/no-DB so it can run in a verify script
 * (`scripts/verify-pricing-parse.ts`) without touching Postgres.
 *
 * Row/column coordinates below were remapped 2026-07 against the CURRENT
 * pricing-sheet.xlsx layout (the previous coordinates assumed the Case
 * Record / Case Search year-band tables sat immediately right of the
 * headline rows; they now live in dedicated blocks starting at row 20 —
 * see the "CASE RECORD - PUNJAB" / "CASE SEARCH - Punjab" etc. section
 * titles in the sheet). B13 root cause.
 */
export function buildJudicialRuleRows(): {
  rows: PricingRuleRow[];
  totalDrafts: number;
  uniqueCount: number;
} {
  const wb = loadWorkbook();
  const s1 = sheetGrid(wb, 'Wusuq Service Rates & Clerk Rat');
  const s2 = sheetGrid(wb, 'Attested Non Attested Both Rate');

  const DRAFTS: RuleDraft[] = [];
  const clerkRateMap = new Map<ClerkKey, number>();

  // Sheet 1 — Punjab headline (rows 3-8). Tier columns run leftCol=1..rightCol=16
  // to cover all six tiers (Lower/Special/High/Federal Shariat/Supreme/Federal
  // Constitutional) — the tier header row (1) only has a label in the first
  // column of every WUSUQ/CLERK pair (1, 7, 9, 11, 13, 15).
  expectContribution('Punjab headline', DRAFTS, () =>
    parseHeadlineBlock(DRAFTS, s1, 'Punjab', /*headerRow*/ 1, /*serviceRows*/ [3, 4, 5, 6, 7, 8], /*leftCol*/ 1, /*rightCol*/ 16));
  // Right-hand "CASE RECORD - PUNJAB" band block (title row 20, tier header row
  // 21, data rows 23-27, years in col 0).
  expectContribution('Punjab case-record bands', DRAFTS, () =>
    parseCaseRecordBands(DRAFTS, s1, 'Punjab', /*tierHeaderRow*/ 21, /*bandRows*/ [23, 24, 25, 26, 27], /*leftCol*/ 1, /*rightCol*/ 16, /*yearsCol*/ 0));

  // Sheet 1 — Other than Punjab headline (rows 13-18).
  expectContribution('Other headline', DRAFTS, () =>
    parseHeadlineBlock(DRAFTS, s1, 'other', 11, [13, 14, 15, 16, 17, 18], 1, 16));
  // "CASE RECORD - OTHER THAN PUNJAB" band block (title row 30, tier header row
  // 31, data rows 33-37, years in col 0).
  expectContribution('Other case-record bands', DRAFTS, () =>
    parseCaseRecordBands(DRAFTS, s1, 'other', 31, [33, 34, 35, 36, 37], 1, 16, 0));

  // Sheet 1 — Case Search band sub-tables. These live to the RIGHT of the Case
  // Record blocks: "CASE SEARCH - Punjab" (title row 24, col 21) has its tier
  // header at row 25 (cols 22/24/26/28 — only Lower/Special/High/Supreme have
  // a Case Search sub-table) and bespoke year-range bands in col 21, rows
  // 27-31. "CASE SEARCH - Other than Punjab" (title row 32, col 21) mirrors
  // the shape one tier-header row later (row 33) with single-year bands in
  // col 21, rows 35-38.
  expectContribution('Punjab case-search bands', DRAFTS, () =>
    parseCaseSearchBands(DRAFTS, s1, 'Punjab', /*tierHeaderRow*/ 25, /*bandRows*/ [27, 28, 29, 30, 31], /*leftCol*/ 22, /*rightCol*/ 28, /*yearsCol*/ 21));
  expectContribution('Other case-search bands', DRAFTS, () =>
    parseCaseSearchBands(DRAFTS, s1, 'other', /*tierHeaderRow*/ 33, /*bandRows*/ [35, 36, 37, 38], /*leftCol*/ 22, /*rightCol*/ 28, /*yearsCol*/ 21));

  // Pending Case Files headline (row 3 Punjab / row 13 Other) is mapped to
  // yearBand=pending above. Add an explicit current-year mirror so callers
  // who don't specify a yearBand still resolve a price (default = current).
  // Implemented below in the resolver fallback.

  // Sheet 2 — Punjab set-type block (rows 2-10) + Other set-type block (rows 13-21).
  expectContribution('Punjab set-type matrix', DRAFTS, () =>
    parseSetTypeBlock(DRAFTS, s2, 'Punjab', /*tierHeaderRow*/ 2, /*bandRows*/ [4, 5, 6, 7, 8, 9, 10]));
  expectContribution('Other set-type matrix', DRAFTS, () =>
    parseSetTypeBlock(DRAFTS, s2, 'other', /*tierHeaderRow*/ 13, /*bandRows*/ [15, 16, 17, 18, 19, 20, 21]));

  // Sheet 5 — clerk rates for set-type rules. Punjab block layout: tier
  // header row 1, data rows 3-9 (pending, current, 2025, 2024-23, 2022-20,
  // 2019-17, 2016-back). Each tier's clerk block starts 6 columns after its
  // wusuq block. The canonical file's Sheet5 has no Other-than-Punjab block, so
  // clerk rates for `region='other'` fall back to null.
  // Audit 6.2: a renamed/missing Sheet5 used to be skipped silently, wiping
  // every set-type clerk rate on the next seed. Fail unless explicitly waived.
  if (wb.SheetNames.includes('Sheet5')) {
    const s5 = sheetGrid(wb, 'Sheet5');
    parseClerkSetTypeBlock(clerkRateMap, s5, 'Punjab', /*tierHeaderRow*/ 1, /*bandRows*/ [3, 4, 5, 6, 7, 8, 9]);
  } else if (process.argv.includes('--allow-missing-clerk-rates')) {
    console.warn('Sheet5 missing — proceeding WITHOUT set-type clerk rates (--allow-missing-clerk-rates).');
  } else {
    console.error(
      'Sheet5 (set-type clerk rates) not found in the workbook. Re-run with ' +
        '--allow-missing-clerk-rates to seed without them.',
    );
    process.exit(1);
  }

  // De-dupe on the unique key (region, courtLevel, flow, yearBand, setType).
  // Audit 6.3: warn when two source rows collapse onto the same key with
  // DIFFERENT amounts (the bespoke Case Search bands are known to collide;
  // last-write-wins must at least be visible).
  const byKey = new Map<string, RuleDraft>();
  for (const d of DRAFTS) {
    const k = `${d.region}|${d.courtLevel}|${d.flow}|${d.yearBand}|${d.setType ?? ''}`;
    const prev = byKey.get(k);
    if (prev && (prev.basePrice !== d.basePrice || prev.availability !== d.availability)) {
      console.warn(
        `Collision on ${k}: ${prev.basePrice} (avail=${prev.availability}) → ` +
          `${d.basePrice} (avail=${d.availability}) — keeping the later row.`,
      );
    }
    // Last-write wins; the order above is deterministic.
    byKey.set(k, d);
  }

  // Apply Sheet 5 clerk rates onto set-type drafts (judicial_case_files only —
  // Sheet 5's matrix only covers that flow). Headline-table drafts already
  // carry their own clerkBaseCost from Sheet 1, so leave them alone.
  for (const d of byKey.values()) {
    if (d.setType == null) continue;
    if (d.flow !== 'judicial_case_files') continue;
    const k = `${d.region}|${d.courtLevel}|${d.yearBand}|${d.setType}`;
    const clerk = clerkRateMap.get(k);
    if (clerk != null) d.clerkBaseCost = clerk;
  }

  const drafts = [...byKey.values()];
  console.log(`Parsed ${DRAFTS.length} rule drafts → ${drafts.length} unique combinations.`);

  // Audit 6.2: row-count floor — the scrapers refuse to overwrite on a count
  // drop; the pricing seed (which wipes ~390 PROD rules) had no such guard. A
  // shifted sheet that silently parses to a handful of rows must abort BEFORE
  // the wipe.
  const MIN_TOTAL_DRAFTS = 350;
  if (drafts.length < MIN_TOTAL_DRAFTS) {
    console.error(
      `Only ${drafts.length} unique rule drafts parsed (< floor of ${MIN_TOTAL_DRAFTS}). ` +
        'The sheet layout has probably shifted — refusing to wipe PricingRule.',
    );
    process.exit(1);
  }

  const rows: PricingRuleRow[] = drafts.map((d) => {
    const range = YEAR_BAND_RANGES[d.yearBand];
    return {
      name: buildName(d),
      flow: d.flow,
      courtLevel: d.courtLevel,
      region: d.region,
      yearBand: d.yearBand,
      yearFrom: range.yearFrom,
      yearTo: range.yearTo,
      setType: d.setType,
      basePrice: d.availability && d.basePrice != null ? d.basePrice : 0,
      availability: d.availability,
      clerkBaseCost: d.clerkBaseCost ?? null,
      pdfSurchargeAmount: d.pdfSurchargeAmount,
      deliveryGuyFee: d.deliveryGuyFee,
      isLegacy: true,
      isActive: true,
      priority: d.setType ? 10 : d.yearBand === 'current' || d.yearBand === 'pending' ? 0 : 5,
    };
  });

  return { rows, totalDrafts: DRAFTS.length, uniqueCount: drafts.length };
}

// ── Clerk-rate sanity guard ──────────────────────────────────────────────────
// Some source cells in pricing-sheet.xlsx carry a literal "1" as a placeholder
// (e.g. the Punjab Case-Record clerk column). A clerkBaseCost of Rs 1 is never a
// real rate — real clerk rates start in the hundreds — and it flows straight to
// Ticket.defaultClerkCost → assignBulk auto-fills clerkCost with no admin review,
// silently paying a clerk Rs 1. The parser faithfully reads what's in the sheet,
// so this must be caught here (fail-loud, like the MIN_TOTAL_DRAFTS floor) BEFORE
// the wipe. Fix the source cells, or pass --allow-low-clerk-rates to override.
export const MIN_PLAUSIBLE_CLERK_COST = 50;
export function findImplausibleClerkRows(rows: PricingRuleRow[]): PricingRuleRow[] {
  return rows.filter(
    (r) =>
      r.clerkBaseCost != null &&
      r.clerkBaseCost > 0 &&
      r.clerkBaseCost < MIN_PLAUSIBLE_CLERK_COST,
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Loading ${XLSX_PATH}…`);
  const { rows } = buildJudicialRuleRows();

  // Refuse to seed implausibly-low clerk rates (placeholder cells) — see above.
  const badClerk = findImplausibleClerkRows(rows);
  if (badClerk.length > 0 && !process.argv.includes('--allow-low-clerk-rates')) {
    console.error(
      `${badClerk.length} rule(s) have an implausible clerk rate (< Rs ${MIN_PLAUSIBLE_CLERK_COST}) — ` +
        'these are almost certainly placeholder cells in pricing-sheet.xlsx. Fix the source ' +
        'cells (or pass --allow-low-clerk-rates to override). Offending rules:',
    );
    for (const r of badClerk) {
      console.error(`  • ${r.name} (${r.region}/${r.courtLevel}/${r.yearBand}) → clerkBaseCost=${r.clerkBaseCost}`);
    }
    process.exit(1);
  }

  // Non-judicial physical-document copies (owner rates 2026-06-12). The xlsx
  // grid is judicial court-tier shaped and carries no rows for these, so the
  // flat per-flow base fees are injected from the shared row-builder (single
  // source, shared with seed-non-judicial-pricing.ts) as null-dimension rules
  // that match any derived region / FIR-year band. SPLIT flows: this base
  // bills at intake; printing/delivery are the clerk-entered phase-2 remainder.
  const nonJudicialRows = buildNonJudicialPricingRows();

  // USD all-inclusive flat rules (owner list 2026-06-14). Same dimensions as
  // PKR rows but currency='USD'; the resolver short-circuits these to a flat
  // total (no surcharges). Shared builder with seed-usd-pricing.ts (the
  // USD-only seed) so the two never drift. Included here so a full rebuild
  // also re-creates USD rows after the wipe.
  const usdRows = buildUsdPricingRuleRows();
  if (usdRows.length !== USD_PRICING_ROW_COUNT) {
    console.error(
      `USD rows = ${usdRows.length}, expected ${USD_PRICING_ROW_COUNT}. Aborting.`,
    );
    process.exit(1);
  }

  const allRows = [...rows, ...nonJudicialRows, ...usdRows];

  // Audit 6.1: wipe + insert in ONE transaction — a dropped connection
  // mid-run used to leave PricingRule empty/partial in prod (every intake
  // then fails "No pricing rule matched").
  await prisma.$transaction(
    async (tx) => {
      await tx.pricingRule.deleteMany({});
      await tx.pricingRule.createMany({ data: allRows });
    },
    { timeout: 120_000 },
  );
  console.log(
    `Seeded ${allRows.length} pricing rules (${rows.length} judicial + ` +
      `${nonJudicialRows.length} non-judicial + ${usdRows.length} USD; ` +
      `atomic wipe + insert).`,
  );
}

// Only run against the DB when invoked directly (not when imported by the
// no-DB verify script or a test). The package is CommonJS (no
// "type":"module"), so `require.main === module` holds when launched via tsx.
const isMain = (() => {
  try {
    return typeof require !== 'undefined' && require.main === module;
  } catch {
    return false;
  }
})();

if (isMain) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
