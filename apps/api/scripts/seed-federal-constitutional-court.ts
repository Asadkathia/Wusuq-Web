/**
 * Idempotent delta seed: ensures the Federal Constitutional Court of
 * Pakistan exists as a Court row (type='Federal Constitutional Court')
 * and has a CourtSeat at Islamabad (principal seat).
 *
 * Mirrors the JSON entry now present in src/geo/pakistan-courts.json so
 * that running databases get the new court without a full reset/seed.
 *
 * Safe to re-run: only inserts missing rows, never deletes.
 *
 * Run with:
 *   cd apps/api && node_modules/.bin/ts-node --esm --transpile-only scripts/seed-federal-constitutional-court.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COURT_TYPE = 'Federal Constitutional Court';
const COURT_NAME = 'Federal Constitutional Court of Pakistan';

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

  const existingCourt = await prisma.court.findUnique({
    where: { type_name: { type: COURT_TYPE, name: COURT_NAME } },
    select: { id: true },
  });
  let courtId: string;
  let courtCreated = false;
  if (existingCourt) {
    courtId = existingCourt.id;
    console.log(`Court row already exists (id=${courtId}).`);
  } else {
    const created = await prisma.court.create({
      data: { type: COURT_TYPE, name: COURT_NAME },
      select: { id: true },
    });
    courtId = created.id;
    courtCreated = true;
    console.log(`Court row created (id=${courtId}).`);
  }

  const existingSeat = await prisma.courtSeat.findUnique({
    where: { courtId_cityId: { courtId, cityId: city.id } },
    select: { id: true, isPrincipalSeat: true },
  });
  let seatCreated = false;
  let seatUpdated = false;
  if (!existingSeat) {
    await prisma.courtSeat.create({
      data: { courtId, cityId: city.id, isPrincipalSeat: true },
    });
    seatCreated = true;
  } else if (!existingSeat.isPrincipalSeat) {
    await prisma.courtSeat.update({
      where: { id: existingSeat.id },
      data: { isPrincipalSeat: true },
    });
    seatUpdated = true;
  }

  console.log(`\n=== Summary ===`);
  console.log(`Court row:    ${courtCreated ? 'created' : 'already existed'}`);
  console.log(
    `CourtSeat:    ${
      seatCreated ? 'created' : seatUpdated ? 'updated to principal seat' : 'already existed'
    }`,
  );

  const verify = await prisma.courtSeat.findFirst({
    where: { courtId, cityId: city.id },
    include: { court: { select: { type: true, name: true } } },
  });
  console.log(`\n=== Verification ===`);
  console.log(verify);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
