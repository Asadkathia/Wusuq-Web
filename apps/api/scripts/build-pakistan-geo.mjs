// Rebuilds apps/api/src/geo/pakistan-geo.json from
// apps/api/data/pakistan-tehsils.csv (mirror of the canonical
// "Pakistan structure" Google Sheet).
//
//   cd apps/api && node scripts/build-pakistan-geo.mjs
//
// The script strips trailing parenthetical annotations (e.g. "Khangarh
// (Khanpur)" → "Khangarh"), normalises sheet province labels to the
// codebase canonical names, and preserves ICT (which the sheet does
// not cover).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoApi = path.resolve(here, '..');
const csvPath = path.join(repoApi, 'data', 'pakistan-tehsils.csv');
const outPath = path.join(repoApi, 'src', 'geo', 'pakistan-geo.json');

const csv = fs.readFileSync(csvPath, 'utf8');
const lines = csv.split('\n').filter(Boolean).slice(1);
const stripParens = s => { let r = s; while(/\s*\([^)]*\)\s*$/.test(r)) r = r.replace(/\s*\([^)]*\)\s*$/,''); return r.trim(); };

const PROV_MAP = {
  'Punjab':'Punjab','Sindh':'Sindh','Kpk':'Khyber Pakhtunkhwa',
  'Balochistan':'Balochistan','Azad Kashmir':'Azad Jammu & Kashmir',
  'Gilgit':'Gilgit-Baltistan',
};

const result = {};
let curProv = '', curDist = '';
for (const line of lines) {
  const cells = (line.match(/"([^"]*)"/g) || []).map(s => s.slice(1,-1));
  const [, prov, dist, teh] = cells;
  if (prov && prov.trim()) {
    const mapped = PROV_MAP[stripParens(prov)] || stripParens(prov);
    curProv = mapped;
    result[curProv] ||= {};
  }
  if (dist && dist.trim()) {
    curDist = stripParens(dist);
    result[curProv][curDist] ||= [];
  }
  if (teh && teh.trim()) {
    const t = stripParens(teh);
    if (!result[curProv][curDist].includes(t)) result[curProv][curDist].push(t);
  }
}

// Preserve ICT (sheet does not cover it).
result['Islamabad Capital Territory'] = { Islamabad: ['Islamabad'] };

// Order: keep sheet order then ICT last.
const ordered = {};
for (const p of ['Punjab','Khyber Pakhtunkhwa','Sindh','Balochistan','Azad Jammu & Kashmir','Gilgit-Baltistan','Islamabad Capital Territory']) {
  if (result[p]) ordered[p] = result[p];
}

fs.writeFileSync(outPath, JSON.stringify(ordered, null, 2) + '\n');
console.log('Wrote pakistan-geo.json');
for (const [p, d] of Object.entries(ordered)) {
  const dCount = Object.keys(d).length;
  const cCount = Object.values(d).flat().length;
  console.log(`  ${p}: ${dCount} districts, ${cCount} tehsils`);
}
