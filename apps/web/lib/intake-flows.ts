export type IntakeFieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox_single'   // single-select checkbox group (required_documentations)
  | 'year_select'       // year dropdown current→1970
  | 'file';

export type IntakeField = {
  key: string;
  label: string;
  type: IntakeFieldType;
  required?: boolean;
  options?: string[];
  /** Show this field only when another field equals a specific value */
  showWhen?: { field: string; value: string };
  /** Shown below the label in consumer variant only */
  hint?: string;
};

export type IntakeStep = {
  title: string;
  fields: IntakeField[];
};

import type { LucideIcon } from 'lucide-react';
import {
  FolderOpen,
  FileText,
  Search,
  Gavel,
  ScrollText,
  FileSearch,
  Stamp,
} from 'lucide-react';

export type IntakeFlow = {
  key: string;
  label: string;
  endpoint: string;
  steps: IntakeStep[];
  description?: string;
  icon?: LucideIcon;
};

// ─────────────────────────────────────────────
// Shared field definitions
// ─────────────────────────────────────────────

const REQUIRED_DOCS_CASE_FILES: IntakeField = {
  key: 'required_documentations',
  label: 'Required Documents',
  type: 'checkbox_single',
  required: true,
  options: [
    'Complete File',
    'Petition + Complete Order Sheet',
    'Petition + Final Order',
    'Only Petition',
    'Only Last Order',
    'Only Complete Order Sheet',
  ],
};

// Set type picker plus conditional quantity fields. Reused across flows that
// need the attested/non-attested/both set selector.
const SET_TYPE_WITH_QUANTITIES: IntakeField[] = [
  {
    key: 'set_type',
    label: 'Set Type',
    type: 'radio',
    required: true,
    options: ['attested', 'non_attested', 'both'],
  },
  {
    key: 'attested_qty',
    label: 'How many attested copies?',
    type: 'number',
    required: true,
    showWhen: { field: 'set_type', value: 'attested' },
  },
  {
    key: 'non_attested_qty',
    label: 'How many non-attested copies?',
    type: 'number',
    required: true,
    showWhen: { field: 'set_type', value: 'non_attested' },
  },
  {
    key: 'both_attested_qty',
    label: 'How many attested copies?',
    type: 'number',
    required: true,
    showWhen: { field: 'set_type', value: 'both' },
  },
  {
    key: 'both_non_attested_qty',
    label: 'How many non-attested copies?',
    type: 'number',
    required: true,
    showWhen: { field: 'set_type', value: 'both' },
  },
];

const REQUIRED_DOCS_CASE_INFO: IntakeField = {
  key: 'required_documentations',
  label: 'Required Documents',
  type: 'checkbox_single',
  required: true,
  options: [
    'Paperbook + Last Order',
    'Paperbook + Complete Order',
    'Only Paperbook',
    'Petition + Complete Order',
    'Petition + Last Order',
    'Only Petition',
    'Only Last Order',
    'Only Complete Order Sheet',
  ],
};

// ─────────────────────────────────────────────
// 1) Case Files
// ─────────────────────────────────────────────
const caseFilesSteps: IntakeStep[] = [
  {
    title: 'Service Selection',
    fields: [{ key: 'select_service', label: 'Select Service', type: 'text', required: true }],
  },
  {
    title: 'Case Details',
    fields: [
      {
        key: 'case_status',
        label: 'Case Status',
        type: 'radio',
        required: true,
        options: ['Pending Case', 'Decided Case', 'Unknown Case'],
        hint: 'Choose the option that best matches the latest status shown on the court file.',
      },
      { key: 'case_type', label: 'Case Type', type: 'select', required: true, options: [] },
      {
        key: 'case_no',
        label: 'Case No',
        type: 'text',
        required: true,
        hint: 'Enter the exact number as it appears on the petition or order sheet.',
      },
      { key: 'year', label: 'Year', type: 'year_select', required: true },
      {
        key: 'case_title',
        label: 'Case Title',
        type: 'text',
        required: true,
        hint: 'Use the party names exactly as written in the court record.',
      },
      { key: 'judge_name', label: 'Judge Name', type: 'text' },
      { key: 'judge_designation', label: 'Judge Designation', type: 'select', options: [] },
      {
        key: 'case_date_status',
        label: 'Case Date Status',
        type: 'radio',
        options: ['Known', 'Unknown'],
      },
      { key: 'case_date', label: 'Previous Case Date', type: 'date' },
      { key: 'future_date', label: 'Future Date', type: 'date' },
      {
        key: 'decided_date',
        label: 'Decided Date',
        type: 'date',
        showWhen: { field: 'case_status', value: 'Decided Case' },
      },
    ],
  },
  {
    title: 'Documents Required',
    fields: [
      ...SET_TYPE_WITH_QUANTITIES,
      REQUIRED_DOCS_CASE_FILES,
      {
        key: 'want_pdf_before_dispatch',
        label: 'Want PDF before dispatch?',
        type: 'radio',
        required: true,
        options: ['Yes', 'No'],
      },
      {
        key: 'delivery_mode',
        label: 'Delivery Method',
        type: 'radio',
        required: true,
        options: ['TCS', 'Uber', 'Self Collection'],
      },
      {
        key: 'delivery_address',
        label: 'Delivery Address',
        type: 'textarea',
        required: true,
        showWhen: { field: 'delivery_mode', value: 'TCS' },
      },
      {
        key: 'coordinates',
        label: 'Uber Coordinates (lat, lng)',
        type: 'text',
        required: true,
        showWhen: { field: 'delivery_mode', value: 'Uber' },
      },
      {
        key: 'pickup_location',
        label: 'Pickup Location',
        type: 'text',
        required: true,
        showWhen: { field: 'delivery_mode', value: 'Self Collection' },
      },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    title: 'Documents & Delivery',
    fields: [{ key: 'documents_upload_note', label: 'Upload files below', type: 'text' }],
  },
];

// ─────────────────────────────────────────────
// 2) Case Information
// ─────────────────────────────────────────────
const caseInformationSteps: IntakeStep[] = [
  {
    title: 'Service Selection',
    fields: [{ key: 'select_service', label: 'Select Service', type: 'text', required: true }],
  },
  {
    title: 'Case Details',
    fields: [
      { key: 'case_type', label: 'Case Type', type: 'select', required: true, options: [] },
      { key: 'case_no', label: 'Case No', type: 'text', required: true },
      { key: 'year', label: 'Year', type: 'year_select', required: true },
      { key: 'case_title', label: 'Case Title', type: 'text', required: true },
      { key: 'judge_name', label: 'Judge Name', type: 'text' },
      { key: 'judge_designation', label: 'Judge Designation', type: 'select', options: [] },
      { key: 'case_date', label: 'Case Date', type: 'date' },
    ],
  },
  {
    title: 'Required Documents & Notes',
    fields: [
      REQUIRED_DOCS_CASE_INFO,
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    title: 'Documents & Delivery',
    fields: [
      { key: 'documents_upload_note', label: 'Upload files below', type: 'text' },
      {
        key: 'delivery_mode',
        label: 'Delivery Mode',
        type: 'radio',
        required: true,
        options: ['portal', 'whatsapp', 'other_no'],
      },
      {
        key: 'other_no',
        label: 'Other Number',
        type: 'text',
        showWhen: { field: 'delivery_mode', value: 'other_no' },
      },
    ],
  },
];

// ─────────────────────────────────────────────
// 3) Case Search
// ─────────────────────────────────────────────
const caseSearchSteps: IntakeStep[] = [
  {
    title: 'Service Selection',
    fields: [{ key: 'select_service', label: 'Select Service', type: 'text', required: true }],
  },
  {
    title: 'Case Details',
    fields: [
      {
        key: 'case_status',
        label: 'Case Status',
        type: 'radio',
        required: true,
        options: ['Pending Case', 'Decided Case', 'Unknown Case'],
      },
      { key: 'case_type', label: 'Case Type', type: 'select', required: true, options: [] },
      { key: 'case_no', label: 'Case No', type: 'text', required: true },
      { key: 'year', label: 'Year', type: 'year_select', required: true },
      { key: 'case_title', label: 'Case Title', type: 'text', required: true },
      { key: 'judge_name', label: 'Judge Name', type: 'text' },
      { key: 'judge_designation', label: 'Judge Designation', type: 'select', options: [] },
      {
        key: 'case_date_status',
        label: 'Case Date Status',
        type: 'radio',
        options: ['Known', 'Unknown'],
      },
      { key: 'case_date', label: 'Previous Case Date', type: 'date' },
      { key: 'future_date', label: 'Future Date', type: 'date' },
      {
        key: 'decided_date',
        label: 'Decided Date',
        type: 'date',
        showWhen: { field: 'case_status', value: 'Decided Case' },
      },
    ],
  },
  {
    title: 'Required Documents',
    fields: [
      REQUIRED_DOCS_CASE_FILES,
      {
        key: 'delivery_mode',
        label: 'Delivery Mode',
        type: 'radio',
        required: true,
        options: ['courier', 'self_collection'],
      },
      {
        key: 'address',
        label: 'Delivery Address',
        type: 'textarea',
        showWhen: { field: 'delivery_mode', value: 'courier' },
      },
      ...SET_TYPE_WITH_QUANTITIES,
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    title: 'Others & Delivery',
    fields: [{ key: 'documents_upload_note', label: 'Upload files below', type: 'text' }],
  },
];

// ─────────────────────────────────────────────
// 4) Case Filing
// ─────────────────────────────────────────────
const caseFilingSteps: IntakeStep[] = [
  {
    title: 'Service Selection',
    fields: [{ key: 'select_service', label: 'Select Service', type: 'text', required: true }],
  },
  {
    title: 'Case Details',
    fields: [
      {
        key: 'case_status',
        label: 'Case Status',
        type: 'radio',
        required: true,
        options: ['New Case', 'Pending Case'],
      },
      {
        key: 'party_type',
        label: 'Party Type',
        type: 'select',
        required: true,
        options: ['Plaintiff/Petitioner', 'Defendant/Respondent'],
      },
      { key: 'case_type', label: 'Case Type', type: 'select', required: true, options: [] },
      {
        key: 'case_no',
        label: 'Case No',
        type: 'text',
        showWhen: { field: 'case_status', value: 'Pending Case' },
      },
      { key: 'year', label: 'Year', type: 'year_select', required: true },
      { key: 'case_title', label: 'Case Title', type: 'text', required: true },
      {
        key: 'judge_name',
        label: 'Judge Name',
        type: 'text',
        showWhen: { field: 'case_status', value: 'Pending Case' },
      },
      { key: 'judge_designation', label: 'Judge Designation', type: 'select', options: [] },
      {
        key: 'case_date_status',
        label: 'Case Date Status',
        type: 'radio',
        options: ['Known', 'Unknown'],
        showWhen: { field: 'case_status', value: 'Pending Case' },
      },
      {
        key: 'case_date',
        label: 'Case Date',
        type: 'date',
        showWhen: { field: 'case_status', value: 'Pending Case' },
      },
      {
        key: 'future_date',
        label: 'Future Date',
        type: 'date',
        showWhen: { field: 'case_status', value: 'Pending Case' },
      },
    ],
  },
  {
    title: 'Others Details',
    fields: [{ key: 'notes', label: 'Notes', type: 'textarea' }],
  },
  {
    title: 'Documents & Delivery',
    fields: [{ key: 'documents_upload_note', label: 'Upload files below', type: 'text' }],
  },
];

// ─────────────────────────────────────────────
// 5) Power of Attorney
// ─────────────────────────────────────────────
const powerOfAttorneySteps: IntakeStep[] = [
  {
    title: 'Service Selection',
    fields: [{ key: 'select_service', label: 'Select Service', type: 'text', required: true }],
  },
  {
    title: 'Case Details',
    fields: [
      {
        key: 'case_status',
        label: 'Case Status',
        type: 'radio',
        required: true,
        options: ['Pending Case'],
      },
      {
        key: 'party_type',
        label: 'Party Type',
        type: 'select',
        required: true,
        options: ['Plaintiff/Petitioner', 'Defendant/Respondent'],
      },
      { key: 'case_type', label: 'Case Type', type: 'select', required: true, options: [] },
      { key: 'case_no', label: 'Case No', type: 'text', required: true },
      { key: 'year', label: 'Year', type: 'year_select', required: true },
      { key: 'case_title', label: 'Case Title', type: 'text', required: true },
      { key: 'judge_name', label: 'Judge Name', type: 'text' },
      { key: 'judge_designation', label: 'Judge Designation', type: 'select', options: [] },
      {
        key: 'case_date_status',
        label: 'Case Date Status',
        type: 'radio',
        options: ['Known', 'Unknown'],
      },
      { key: 'case_date', label: 'Case Date', type: 'date' },
      { key: 'future_date', label: 'Future Date', type: 'date' },
    ],
  },
  {
    title: 'Others',
    fields: [{ key: 'notes', label: 'Notes', type: 'textarea' }],
  },
  {
    title: 'Documents & Delivery',
    fields: [{ key: 'documents_upload_note', label: 'Upload files below', type: 'text' }],
  },
];

// ─────────────────────────────────────────────
// 6) Copy of FIR
// ─────────────────────────────────────────────
const copyOfFirSteps: IntakeStep[] = [
  {
    title: 'Service Selection',
    fields: [
      // province/district/police station handled by dedicated wizard geo block
      { key: 'province', label: 'Province', type: 'text', required: true },
      { key: 'district_id', label: 'District', type: 'text', required: true },
      { key: 'station_id', label: 'Police Station', type: 'select', required: true, options: [] },
      {
        key: 'city_type',
        label: 'City Type',
        type: 'radio',
        required: true,
        options: ['City', 'Sadar', 'Unknown'],
      },
    ],
  },
  {
    title: 'Case Particulars',
    fields: [
      { key: 'fir_no', label: 'FIR No', type: 'text', required: true },
      { key: 'year', label: 'Year', type: 'year_select', required: true },
      { key: 'offence', label: 'Offence', type: 'text', required: true },
      { key: 'case_title', label: 'Case Title', type: 'text', required: true },
      { key: 'case_date', label: 'Case Date', type: 'date' },
      {
        key: 'date_unknow',
        label: 'Date Unknown',
        type: 'radio',
        options: ['No', 'Yes'],
      },
    ],
  },
  {
    title: 'Required Documents & Others',
    fields: [
      {
        key: 'delivery_mode',
        label: 'Delivery Mode',
        type: 'radio',
        required: true,
        options: ['courier', 'self_collection'],
      },
      {
        key: 'address',
        label: 'Delivery Address',
        type: 'textarea',
        showWhen: { field: 'delivery_mode', value: 'courier' },
      },
      ...SET_TYPE_WITH_QUANTITIES,
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    title: 'Images & Delivery',
    fields: [{ key: 'documents_upload_note', label: 'Upload files below', type: 'text' }],
  },
];

// ─────────────────────────────────────────────
// 7) Copy of Registry/Deed
// ─────────────────────────────────────────────
const registryDeedSteps: IntakeStep[] = [
  {
    title: 'Service Selection',
    fields: [
      { key: 'office_name', label: 'Office Name', type: 'text', required: true },
      {
        key: 'city_type',
        label: 'City Type',
        type: 'radio',
        required: true,
        options: ['City', 'Sadar', 'Unknown'],
      },
    ],
  },
  {
    title: 'Case Particulars',
    fields: [
      { key: 'doc_no', label: 'Doc No.', type: 'text', required: true },
      { key: 'year', label: 'Year', type: 'year_select', required: true },
      { key: 'case_title', label: 'Case Title', type: 'text', required: true },
      { key: 'case_date', label: 'Case Date', type: 'date' },
      {
        key: 'date_unknow',
        label: 'Date Unknown',
        type: 'radio',
        options: ['No', 'Yes'],
      },
    ],
  },
  {
    title: 'Required Documents & Others',
    fields: [
      {
        key: 'delivery_mode',
        label: 'Delivery Mode',
        type: 'radio',
        required: true,
        options: ['courier', 'self_collection'],
      },
      {
        key: 'address',
        label: 'Delivery Address',
        type: 'textarea',
        showWhen: { field: 'delivery_mode', value: 'courier' },
      },
      ...SET_TYPE_WITH_QUANTITIES,
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    title: 'Images & Delivery',
    fields: [{ key: 'documents_upload_note', label: 'Upload files below', type: 'text' }],
  },
];

// ─────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────

export const judicialFlows: IntakeFlow[] = [
  {
    key: 'judicial_case_files',
    label: 'Case Files',
    endpoint: '/tickets/intake/judicial/case-files',
    steps: caseFilesSteps,
    description: 'Order certified or non-attested copies of complete case files and order sheets.',
    icon: FolderOpen,
  },
  {
    key: 'judicial_case_information',
    label: 'Case Information',
    endpoint: '/tickets/intake/judicial/case-information',
    steps: caseInformationSteps,
    description: 'Retrieve paperbook, petition, and order details for an existing case.',
    icon: FileText,
  },
  {
    key: 'judicial_case_search',
    label: 'Case Search',
    endpoint: '/tickets/intake/judicial/case-search',
    steps: caseSearchSteps,
    description: 'Locate a case by party name or particulars when the case number is unknown.',
    icon: Search,
  },
  {
    key: 'judicial_case_filing',
    label: 'Case Filling',
    endpoint: '/tickets/intake/judicial/case-filing',
    steps: caseFilingSteps,
    description: 'File a new petition or matter at the selected court seat.',
    icon: Gavel,
  },
  {
    key: 'judicial_power_of_attorney',
    label: 'Power of Attorney',
    endpoint: '/tickets/intake/judicial/power-of-attorney',
    steps: powerOfAttorneySteps,
    description: 'Prepare and file a power of attorney for representation in court.',
    icon: ScrollText,
  },
];

export const nonJudicialFlows: IntakeFlow[] = [
  {
    key: 'non_judicial_copy_of_fir',
    label: 'Copy of FIR',
    endpoint: '/tickets/intake/non-judicial/copy-of-fir',
    steps: copyOfFirSteps,
    description: 'Obtain a certified copy of a First Information Report from the relevant police station.',
    icon: FileSearch,
  },
  {
    key: 'non_judicial_registry_deed',
    label: 'Registry/Deed',
    endpoint: '/tickets/intake/non-judicial/registry-deed',
    steps: registryDeedSteps,
    description: 'Request registry, mutation, or deed copies from the land/registrar office.',
    icon: Stamp,
  },
];

const FLOW_KEY_TO_SLUG: Record<string, string> = {
  judicial_case_files: 'case-files',
  judicial_case_information: 'case-information',
  judicial_case_search: 'case-search',
  judicial_case_filing: 'case-filing',
  judicial_power_of_attorney: 'power-of-attorney',
  non_judicial_copy_of_fir: 'copy-of-fir',
  non_judicial_registry_deed: 'registry-deed',
};

const SLUG_TO_FLOW_KEY: Record<'judicial' | 'non_judicial', Record<string, string>> = {
  judicial: {
    'case-files': 'judicial_case_files',
    'case-information': 'judicial_case_information',
    'case-search': 'judicial_case_search',
    'case-filing': 'judicial_case_filing',
    'power-of-attorney': 'judicial_power_of_attorney',
  },
  non_judicial: {
    'copy-of-fir': 'non_judicial_copy_of_fir',
    'registry-deed': 'non_judicial_registry_deed',
  },
};

export function flowKeyToSlug(key: string): string {
  return FLOW_KEY_TO_SLUG[key] ?? key;
}

export function slugToFlowKey(
  slug: string,
  category: 'judicial' | 'non_judicial',
): string | null {
  return SLUG_TO_FLOW_KEY[category][slug] ?? null;
}
