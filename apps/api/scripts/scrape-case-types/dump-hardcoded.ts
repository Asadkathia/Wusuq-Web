/**
 * One-shot script: read the existing SERVICE_CASE_TYPES + SUBCOURT_CASE_TYPES
 * constants from apps/web/components/intake-wizard.tsx and write them to
 * apps/api/data/case-types/hardcoded-snapshot.json. Run once; commit the
 * output; then delete the constants from the wizard in Task 11.
 *
 * Run: pnpm tsx scripts/scrape-case-types/dump-hardcoded.ts
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Inline copy of the wizard constants. These are intentionally duplicated
// here so the script can run without importing TSX files. After running
// once and committing the JSON output, this script is a historical artifact.
const SERVICE_CASE_TYPES: Record<string, string[]> = {
  svc_judicial_lower_court: [
    'Bail Application (S)', 'Criminal Appeal', 'Criminal Misc.', 'Criminal Revision',
    'Hadood Cases (Under Hadood Ordinance)', 'Harrassment', 'Illegal Dispossession Act',
    'Inquiry (S)', 'Money Laundering Act', 'Narcotics Cases (S)', 'Other Cases (S)',
    'Petitions u/s 22-A/22-B Cr.P.C', 'Sessions Cases (Murder)', 'Sessions Cases (Others)',
    'STA Cases', 'Superdari', 'Habeas Corpus', 'Execution Petition (S)',
    'Application for Succession', 'Civil Appeal', 'Civil Case of Summary Nature Involving Evidence',
    'Civil Misc.', 'Civil Revision', 'Civil Suit', 'Commercial Cases', 'Election Petition',
    'Execution Petition (C)', 'Family Cases', 'Guardianship Cases', 'Inquiry (C)',
    'Insolvency Cases', 'Insurance Cases', 'Labour Cases', 'Land Acquisition Cases',
    'Obejcton Petiton', 'Original Suit', 'Other Cases (C)', 'Pauper Cases', 'Rent Cases',
    'Small Clam & Minor Offence', 'Bail Application (M)', 'Ist Class Cases', 'Minor Offences',
    'Narcotics Cases (M)', 'Other Cases (M)', 'Section 30 Case',
  ],
  svc_judicial_special_court: [
    'Pre-Arrest Bail Petition', 'Post-Arrest Bail Petition', 'Trial File', 'Miscellaneous',
  ],
  svc_judicial_high_court: [
    'Writ Petition', 'Criminal Miscellaneous', 'Civil Revision', 'Regular First Appeal',
    'First Appeal Against Order', 'Criminal Appeal', 'Criminal Revision', 'Murder Reference',
    'Petition For Special Leave To Appeal', 'Diary Number', 'Intra Court Appeal',
    'Review Application', 'Civil Suit', 'Labour Appeal', 'Arbitration Petition',
    'Companies Original', 'Execution Petition', 'Human Rights Petition', 'Election Petition',
    'Suo Moto', 'Tax Reference', 'Regular Second Appeal', 'Second Appeal Against Order',
    'Transfer Application', 'Civil Original Suit', 'Execution First Appeal',
    'Petition For Leave To Appear And Defend', 'Execution Second Appeal', 'Tax Appeal',
    'Custom Reference', 'Civil Reference', 'Cm Independent', 'Wealth Tax Appeal',
    'Commercial Appeal', 'Jail Appeal', 'Capital Sentence Reference',
    'Federal Excise & Reference Application', 'Sales Tax Reference', 'Income Tax Reference',
    'Sales Tax Appeal', 'Income Tax Appeal', 'Custom Appeal', 'C.T.R', 'Objection Case',
    'Office Objection', 'Criminal Original', 'Succession Appeal', 'Objection Petition',
    'Cross Objection', 'Secp Appeal', 'Judicial Reference', 'Ogra Application',
    'Consumer Appeal', 'Judicial Service Appeal', 'Auqaf Appeal', 'Election Appeal',
    'Criminal Original Case', 'Civil Miscellaneous Appeals', 'Miscellaneous Petitions',
    'Enforcement Petition', 'Complaint', 'Pre-Arrest Bail Petition', 'Post-Arrest Bail Petition',
  ],
  svc_judicial_federal_shariat: [
    'C.Sh.A.', 'C.Sh.P.', 'C.Sh.R.P.', 'Crl.Sh.A.', 'Crl.Sh.P.', 'Crl.Sh.R.P.',
    'Crl.S.M.Sh.R.P.', 'J.Sh.P.', 'Sh.M.A.', 'Reference.',
  ],
  svc_judicial_supreme_court: [
    'C.A.', 'C.M.A.', 'C.M.Appeal.', 'C.P.', 'C.R.P.', 'C.Sh.A.', 'C.Sh.P.',
    'C.Sh.R.P.', 'Const.P.', 'Crl.A.', 'Crl.M.A.', 'Crl.M.Appeal.', 'Crl.O.P.',
    'Crl.P.', 'Crl.R.P.', 'Crl.S.M.R.P.', 'Crl.S.M.Sh.R.P.', 'Crl.Sh.A.', 'Crl.Sh.P.',
    'Crl.Sh.R.P.', 'D.S.A.', 'H.R.C.', 'H.R.M.A.', 'I.C.A.', 'J.P.', 'J.Sh.P.',
    'Reference.', 'S.M.C.', 'S.M.R.P.',
  ],
};

const SUBCOURT_CASE_TYPES: Record<string, Record<string, string[]>> = {
  svc_judicial_lower_court: {
    'Sessions Court': [
      'Bail Application (S)', 'Criminal Appeal', 'Criminal Misc.', 'Criminal Revision',
      'Hadood Cases (Under Hadood Ordinance)', 'Harrassment', 'Illegal Dispossession Act',
      'Inquiry (S)', 'Money Laundering Act', 'Narcotics Cases (S)', 'Other Cases (S)',
      'Petitions u/s 22-A/22-B Cr.P.C', 'Sessions Cases (Murder)', 'Sessions Cases (Others)',
      'STA Cases', 'Superdari', 'Habeas Corpus', 'Execution Petition (S)',
    ],
    'Civil Court': [
      'Civil Appeal', 'Civil Case of Summary Nature Involving Evidence',
      'Civil Misc.', 'Civil Revision', 'Civil Suit', 'Commercial Cases',
      'Election Petition', 'Execution Petition (C)', 'Inquiry (C)', 'Insolvency Cases',
      'Insurance Cases', 'Labour Cases', 'Land Acquisition Cases', 'Obejcton Petiton',
      'Original Suit', 'Other Cases (C)', 'Pauper Cases', 'Rent Cases',
      'Small Clam & Minor Offence',
    ],
    'Magisterial Court': [
      'Bail Application (M)', 'Ist Class Cases', 'Minor Offences',
      'Narcotics Cases (M)', 'Other Cases (M)', 'Section 30 Case',
    ],
    'Family Court': [
      'Family Cases', 'Guardianship Cases', 'Application for Succession',
    ],
  },
};

const COURT_LEVEL_BY_SERVICE: Record<string, string> = {
  svc_judicial_lower_court: 'Lower Court',
  svc_judicial_special_court: 'Special Court',
  svc_judicial_high_court: 'High Court',
  svc_judicial_federal_shariat: 'Federal Shariat Court',
  svc_judicial_supreme_court: 'Supreme Court',
};

type FallbackRow = {
  courtLevel: string;
  subCourt: string | null;
  code: string;
  label: string;
};

const rows: FallbackRow[] = [];

for (const [serviceId, caseTypes] of Object.entries(SERVICE_CASE_TYPES)) {
  const courtLevel = COURT_LEVEL_BY_SERVICE[serviceId];
  if (!courtLevel) continue;
  const subCourtMap = SUBCOURT_CASE_TYPES[serviceId];
  if (subCourtMap) {
    for (const [subCourt, list] of Object.entries(subCourtMap)) {
      for (const label of list) {
        rows.push({ courtLevel, subCourt, code: label, label });
      }
    }
  } else {
    for (const label of caseTypes) {
      rows.push({ courtLevel, subCourt: null, code: label, label });
    }
  }
}

const outPath = join(__dirname, '..', '..', 'data', 'case-types', 'hardcoded-snapshot.json');
writeFileSync(outPath, JSON.stringify(rows, null, 2));
console.log(`Wrote ${rows.length} fallback rows → ${outPath}`);
