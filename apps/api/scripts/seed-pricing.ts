/**
 * Seed pricing engine v2 from the authoritative xlsx source.
 *
 * Source: apps/api/data/pricing-sheet.xlsx
 * Run with: cd apps/api && npx tsx scripts/seed-pricing.ts
 *
 * The sheet has four worksheets; this script consumes the first two
 * ("Wusuq Service Rates & Clerk Rat" and "Attested Non Attested Both Rate")
 * and rebuilds the PricingRule table from scratch each run (idempotent).
 */
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as fs from 'node:fs';
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
function parseCell(v: unknown): { amount: number | null; available: boolean } {
  if (v == null) return { amount: null, available: true };
  const s = v.toString().trim();
  if (!s) return { amount: null, available: true };
  if (/can'?t\s*get/i.test(s)) return { amount: null, available: false };
  // Strip trailing asterisks (e.g. "2000*").
  const cleaned = s.replace(/\*/g, '').replace(/,/g, '').trim();
  const n = Number(cleaned);
  return { amount: Number.isFinite(n) ? n : null, available: true };
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

const DRAFTS: RuleDraft[] = [];

function pushHeadline(
  flow: string,
  courtLevel: string,
  region: Region,
  yearBand: YearBand,
  base: ReturnType<typeof parseCell>,
  clerk: ReturnType<typeof parseCell>,
) {
  DRAFTS.push({
    flow,
    courtLevel,
    region,
    yearBand,
    setType: null,
    basePrice: base.amount,
    availability: base.available && base.amount != null,
    clerkBaseCost: clerk.amount,
    pdfSurchargeAmount: 300,
    deliveryGuyFee: 100,
  });
}

// Parse a "headline rates" block: rows of services × tiers (WUSUQ/CLERK pairs).
// `headerRow` defines the tier columns; service rows live in `serviceRows`.
function parseHeadlineBlock(
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
    void label;
    for (const t of tiers) {
      const base = parseCell(row[t.wusuqCol]);
      const clerk = parseCell(row[t.clerkCol]);
      pushHeadline(flow, t.courtLevel, region, yearBand, base, clerk);
    }
  }
}

// Right-hand Case Record band block.
function parseCaseRecordBands(
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
      pushHeadline('judicial_case_record', t.courtLevel, region, yearBand, base, clerk);
    }
  }
}

// Case Search band sub-tables.
function parseCaseSearchBands(
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
      pushHeadline('judicial_case_search', t.courtLevel, region, yb, base, clerk);
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
        DRAFTS.push({
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

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Loading ${XLSX_PATH}…`);
  const wb = loadWorkbook();
  const s1 = sheetGrid(wb, 'Wusuq Service Rates & Clerk Rat');
  const s2 = sheetGrid(wb, 'Attested Non Attested Both Rate');

  // Sheet 1 — Punjab headline (rows 1-8) + right-hand Case Record band table.
  parseHeadlineBlock(s1, 'Punjab', /*headerRow*/ 1, /*serviceRows*/ [3, 4, 5, 6, 7, 8], /*leftCol*/ 1, /*rightCol*/ 12);
  parseCaseRecordBands(s1, 'Punjab', /*tierHeaderRow*/ 1, /*bandRows*/ [3, 4, 5, 6, 7], /*leftCol*/ 15, /*rightCol*/ 26, /*yearsCol*/ 14);

  // Sheet 1 — Other than Punjab headline (rows 11-18) + right-hand bands.
  parseHeadlineBlock(s1, 'other', 11, [13, 14, 15, 16, 17, 18], 1, 12);
  parseCaseRecordBands(s1, 'other', 11, [13, 14, 15, 16, 17], 15, 26, 14);

  // Sheet 1 — Case Search band sub-tables.
  parseCaseSearchBands(s1, 'Punjab', /*tierHeaderRow*/ 26, /*bandRows*/ [28, 29, 30, 31, 32], 1, 8, 0);
  parseCaseSearchBands(s1, 'other', /*tierHeaderRow*/ 34, /*bandRows*/ [36, 37, 38, 39], 1, 8, 0);

  // Pending Case Files headline (row 3 Punjab / row 13 Other) is mapped to
  // yearBand=pending above. Add an explicit current-year mirror so callers
  // who don't specify a yearBand still resolve a price (default = current).
  // Implemented below in the resolver fallback.

  // Sheet 2 — Punjab set-type block (rows 2-10) + Other set-type block (rows 13-21).
  parseSetTypeBlock(s2, 'Punjab', /*tierHeaderRow*/ 2, /*bandRows*/ [4, 5, 6, 7, 8, 9, 10]);
  parseSetTypeBlock(s2, 'other', /*tierHeaderRow*/ 13, /*bandRows*/ [15, 16, 17, 18, 19, 20, 21]);

  // De-dupe on the unique key (region, courtLevel, flow, yearBand, setType).
  const byKey = new Map<string, RuleDraft>();
  for (const d of DRAFTS) {
    const k = `${d.region}|${d.courtLevel}|${d.flow}|${d.yearBand}|${d.setType ?? ''}`;
    // Last-write wins; the order above is deterministic.
    byKey.set(k, d);
  }

  const drafts = [...byKey.values()];
  console.log(`Parsed ${DRAFTS.length} rule drafts → ${drafts.length} unique combinations.`);

  await prisma.$transaction([
    prisma.pricingRule.deleteMany({}),
  ]);
  console.log('Wiped existing PricingRule rows.');

  let inserted = 0;
  for (const d of drafts) {
    const range = YEAR_BAND_RANGES[d.yearBand];
    const name = buildName(d);
    await prisma.pricingRule.create({
      data: {
        name,
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
      },
    });
    inserted++;
  }
  console.log(`Seeded ${inserted} pricing rules.`);
}

function buildName(d: RuleDraft): string {
  const parts = [d.flow, d.courtLevel, d.region, d.yearBand];
  if (d.setType) parts.push(d.setType);
  return parts.join(' – ');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
