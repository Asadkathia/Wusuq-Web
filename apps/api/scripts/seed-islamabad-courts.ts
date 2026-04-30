/**
 * Idempotent delta seed: ensures Islamabad has full court coverage —
 * Lower Court (4 sub-courts), Federal Shariat Court, and every Special
 * Court / tribunal listed in SPECIAL_COURT_SUBCOURTS that includes
 * 'Islamabad'. Supreme Court + Islamabad High Court already covered by
 * the main seed.
 *
 * Safe to re-run: only inserts missing rows, never deletes.
 *
 * Run with:
 *   cd apps/api && node_modules/.bin/ts-node --esm --transpile-only scripts/seed-islamabad-courts.ts
 */
import { PrismaClient } from '@prisma/client';
import {
  LOWER_COURT_SUBCOURTS,
  SPECIAL_COURT_SUBCOURTS,
} from '../src/geo/court-expansion.ts';

const prisma = new PrismaClient();

async function main() {
  console.log('Resolving Islamabad GeoCity...');
  const city = await prisma.geoCity.findFirst({
    where: {
      name: 'Islamabad',
      district: {
        name: 'Islamabad',
        province: { name: 'Islamabad Capital Territory' },
      },
    },
    select: { id: true, name: true },
  });
  if (!city) {
    throw new Error(
      'Islamabad GeoCity not found (district=Islamabad, province=Islamabad Capital Territory). Run main geo seed first.',
    );
  }
  console.log(`Islamabad cityId=${city.id}`);

  // Build (type,name) list of every Court row we want to ensure exists,
  // and track which of those should have an Islamabad seat.
  type CourtSpec = { type: string; name: string; isPrincipalSeat: boolean };
  const specs: CourtSpec[] = [];

  // 1. Lower Court sub-courts
  for (const sub of LOWER_COURT_SUBCOURTS) {
    specs.push({ type: 'Lower Court', name: sub.name, isPrincipalSeat: false });
  }

  // 2. Federal Shariat Court (principal seat)
  specs.push({
    type: 'Federal Shariat Court',
    name: 'Federal Shariat Court',
    isPrincipalSeat: true,
  });

  // 3. Every Special Court / tribunal that lists 'Islamabad'
  for (const [name, cities] of Object.entries(SPECIAL_COURT_SUBCOURTS)) {
    if (cities.includes('Islamabad')) {
      specs.push({ type: 'Special Court', name, isPrincipalSeat: false });
    }
  }

  console.log(`\nEnsuring ${specs.length} Court rows + seats for Islamabad...`);

  let courtsCreated = 0;
  let courtsExisting = 0;
  const seatsToInsert: { courtId: string; cityId: string; isPrincipalSeat: boolean }[] = [];

  for (const spec of specs) {
    const existing = await prisma.court.findUnique({
      where: { type_name: { type: spec.type, name: spec.name } },
      select: { id: true },
    });
    let courtId: string;
    if (existing) {
      courtId = existing.id;
      courtsExisting++;
    } else {
      const created = await prisma.court.create({
        data: { type: spec.type, name: spec.name },
        select: { id: true },
      });
      courtId = created.id;
      courtsCreated++;
    }
    seatsToInsert.push({ courtId, cityId: city.id, isPrincipalSeat: spec.isPrincipalSeat });
  }

  const seatResult = await prisma.courtSeat.createMany({
    data: seatsToInsert,
    skipDuplicates: true,
  });

  console.log(`\n=== Summary ===`);
  console.log(`Court rows created:  ${courtsCreated}`);
  console.log(`Court rows existing: ${courtsExisting}`);
  console.log(`CourtSeats inserted: ${seatResult.count}`);
  console.log(`CourtSeats skipped (already present): ${seatsToInsert.length - seatResult.count}`);

  // Verification: count seats per court type for Islamabad
  const seats = await prisma.courtSeat.findMany({
    where: { cityId: city.id },
    include: { court: { select: { type: true, name: true } } },
  });
  const byType = new Map<string, number>();
  for (const s of seats) byType.set(s.court.type, (byType.get(s.court.type) ?? 0) + 1);
  console.log(`\n=== CourtSeats per type at Islamabad ===`);
  for (const [t, n] of byType) console.log(`  ${t}: ${n}`);
  console.log(`  TOTAL: ${seats.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
