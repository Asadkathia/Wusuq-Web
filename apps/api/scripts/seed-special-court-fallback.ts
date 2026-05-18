/**
 * Idempotent delta seed: ensures every "Special Court" city in
 * pakistan-courts.json that is NOT enumerated in SPECIAL_COURT_SUBCOURTS
 * has at least one CourtSeat — attached to a generic
 * Court{ type: "Special Court", name: "Special Court" } row.
 *
 * Safe to re-run: only inserts missing rows, never deletes.
 *
 * Run with:
 *   cd apps/api && npx ts-node --esm scripts/seed-special-court-fallback.ts
 *   (or `pnpm exec tsx scripts/seed-special-court-fallback.ts` if tsx is installed)
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SPECIAL_COURT_SUBCOURTS } from '../src/geo/court-expansion.ts';
import { CITY_ALIAS, PROVINCE_ALIAS } from '../src/geo/court-alias.ts';

// Run this script from apps/api/ — see header comment.
const courtsJson = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/geo/pakistan-courts.json'), 'utf8'),
);

const prisma = new PrismaClient();

type CourtCityEntry = { city: string; is_principal_seat: boolean };
type CourtsByProvince = Record<string, CourtCityEntry[]>;
type CourtsNested = Record<string, Record<string, CourtsByProvince>>;
const COURTS_NESTED = (courtsJson as { nested: CourtsNested }).nested;

// Alias maps come from src/geo/court-alias.ts (single source of truth).

async function main() {
  console.log('Building city index from DB...');
  const provinces = await prisma.geoProvince.findMany({
    include: { districts: { include: { cities: { select: { id: true, name: true } } } } },
  });
  const cityByProvince = new Map<string, Map<string, string>>();
  const globalCityByName = new Map<string, string>();
  for (const prov of provinces) {
    const map = new Map<string, string>();
    for (const dist of prov.districts) {
      for (const city of dist.cities) {
        map.set(city.name.toLowerCase(), city.id);
        if (!globalCityByName.has(city.name.toLowerCase())) {
          globalCityByName.set(city.name.toLowerCase(), city.id);
        }
      }
    }
    cityByProvince.set(prov.name, map);
  }

  // Cities already covered by a granular sub-tribunal in SPECIAL_COURT_SUBCOURTS.
  const granularCities = new Set<string>();
  for (const arr of Object.values(SPECIAL_COURT_SUBCOURTS)) {
    for (const c of arr) granularCities.add(c.toLowerCase());
  }

  const specialCourtNode = COURTS_NESTED['Special Court'] ?? {};

  // Get-or-create the generic fallback Court row.
  const fallback = await prisma.court.upsert({
    where: { type_name: { type: 'Special Court', name: 'Special Court' } },
    update: {},
    create: { type: 'Special Court', name: 'Special Court' },
  });
  console.log(`Fallback Court row id=${fallback.id}`);

  let candidates = 0;
  let alreadyCovered = 0;
  let resolved = 0;
  let unresolved: { city: string; province: string }[] = [];
  const seatsToInsert: { courtId: string; cityId: string; isPrincipalSeat: boolean }[] = [];
  const seenSeatKey = new Set<string>();

  for (const [, provinceMap] of Object.entries(specialCourtNode)) {
    for (const [jsonProvince, cityEntries] of Object.entries(provinceMap)) {
      const canonicalProv = PROVINCE_ALIAS[jsonProvince] ?? jsonProvince;
      const provCities = cityByProvince.get(canonicalProv);
      for (const entry of cityEntries) {
        candidates++;
        if (granularCities.has(entry.city.toLowerCase())) {
          alreadyCovered++;
          continue;
        }
        const literalKey = entry.city.toLowerCase();
        const aliased = CITY_ALIAS[entry.city] ?? entry.city;
        const aliasedKey = aliased.toLowerCase();
        const cityId =
          provCities?.get(literalKey) ??
          provCities?.get(aliasedKey) ??
          globalCityByName.get(aliasedKey);
        if (!cityId) {
          unresolved.push({ city: entry.city, province: canonicalProv });
          continue;
        }
        const k = `${fallback.id}:${cityId}`;
        if (seenSeatKey.has(k)) continue;
        seenSeatKey.add(k);
        seatsToInsert.push({ courtId: fallback.id, cityId, isPrincipalSeat: false });
        resolved++;
      }
    }
  }

  console.log(`\nSpecial Court entries in JSON: ${candidates}`);
  console.log(`  - already covered by SPECIAL_COURT_SUBCOURTS: ${alreadyCovered}`);
  console.log(`  - resolved to a city in the geo tree: ${resolved}`);
  console.log(`  - unresolved (city not found): ${unresolved.length}`);
  if (unresolved.length) {
    for (const u of unresolved) console.log(`     • ${u.city} (${u.province})`);
  }

  if (seatsToInsert.length === 0) {
    console.log('\nNothing to insert.');
    return;
  }

  // Use createMany with skipDuplicates so re-runs are idempotent against the
  // (courtId, cityId) unique constraint.
  const result = await prisma.courtSeat.createMany({
    data: seatsToInsert,
    skipDuplicates: true,
  });
  console.log(`\nInserted ${result.count} new CourtSeat rows (skipped ${seatsToInsert.length - result.count} duplicates).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
