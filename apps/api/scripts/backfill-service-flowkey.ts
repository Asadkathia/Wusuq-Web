/**
 * Backfills Service.flowKey for existing rows using the legacy inferFlow
 * heuristic. After this script runs successfully and you have spot-checked
 * the output, set Service.flowKey to NOT NULL and delete the inferFlow
 * helper from cases.service.ts.
 *
 * Dry-run (default): prints the proposed flowKey for each service.
 *   cd apps/api && npx tsx scripts/backfill-service-flowkey.ts
 *
 * Apply:
 *   cd apps/api && npx tsx scripts/backfill-service-flowkey.ts --apply
 *
 * Skips services that already have a flowKey set.
 */
import { PrismaClient } from '@prisma/client';
import { isFlowKey, type FlowKey } from '@wusuq/shared';

const prisma = new PrismaClient();

/**
 * Returns a flowKey only when the service has an unambiguous 1:1 mapping
 * to a flow. Judicial services are usually generic (one service serves
 * many flows — the user picks the flow at the wizard), so we leave them
 * null and let the wizard / DTO carry the flow instead.
 */
function inferFlow(service: {
  name: string;
  type: string;
  category: string | null;
}): FlowKey | null {
  const blob = `${service.name} ${service.category ?? ''}`.toLowerCase();
  if (service.type === 'NON_JUDICIAL') {
    if (blob.includes('fir')) return 'non_judicial_copy_of_fir';
    if (blob.includes('registry') || blob.includes('deed')) {
      return 'non_judicial_registry_deed';
    }
    return null;
  }
  // Judicial: only assign if the service name itself is flow-specific.
  if (blob.includes('filing')) return 'judicial_case_filing';
  if (blob.includes('search')) return 'judicial_case_search';
  if (blob.includes('attorney')) return 'judicial_power_of_attorney';
  if (blob.includes('case files') || blob.includes('case-files')) {
    return 'judicial_case_files';
  }
  if (blob.includes('case information') || blob.includes('case-information')) {
    return 'judicial_case_information';
  }
  return null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const services = await prisma.service.findMany({
    select: { id: true, name: true, type: true, category: true, flowKey: true },
  });

  const rows: Array<{ id: string; name: string; current: string | null; proposed: FlowKey | null; }>
    = [];
  for (const s of services) {
    const proposed = inferFlow({ name: s.name, type: s.type, category: s.category });
    if (proposed !== null && !isFlowKey(proposed)) {
      throw new Error(`inferFlow produced an invalid flow key '${proposed}' for service ${s.id}`);
    }
    rows.push({ id: s.id, name: s.name, current: s.flowKey, proposed });
  }

  console.log('id'.padEnd(36), 'current'.padEnd(28), 'proposed'.padEnd(28), 'name');
  for (const r of rows) {
    console.log(
      r.id.padEnd(36),
      String(r.current ?? '∅').padEnd(28),
      String(r.proposed ?? '∅ (no 1:1 mapping)').padEnd(28),
      r.name,
    );
  }

  const toUpdate = rows.filter((r) => !r.current && r.proposed !== null);
  console.log(`\n${rows.length} services scanned · ${toUpdate.length} need backfill`);

  if (!apply) {
    console.log('Dry run. Re-run with --apply to write changes.');
    return;
  }

  let written = 0;
  for (const r of toUpdate) {
    await prisma.service.update({
      where: { id: r.id },
      data: { flowKey: r.proposed! },
    });
    written++;
  }
  console.log(`Wrote flowKey on ${written} services.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
