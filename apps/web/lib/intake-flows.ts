export type IntakeFieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'textarea'
  | 'select';

export type IntakeField = {
  key: string;
  label: string;
  type: IntakeFieldType;
  required?: boolean;
  options?: string[];
};

export type IntakeStep = {
  title: string;
  fields: IntakeField[];
};

export type IntakeFlow = {
  key: string;
  label: string;
  endpoint: string;
  steps: IntakeStep[];
};

const judicialCommonSteps: IntakeStep[] = [
  {
    title: 'Service Selection',
    fields: [
      { key: 'select_service', label: 'Select Service', type: 'text', required: true },
      {
        key: 'select_court',
        label: 'Select Court',
        type: 'select',
        required: true,
        options: [
          'Lower Court',
          'Special Court',
          'High Court',
          'Federal Shariat Court',
          'Supreme Court',
        ],
      },
      {
        key: 'select_court_city',
        label: 'Select Court City',
        type: 'text',
        required: true,
      },
    ],
  },
  {
    title: 'Case Details',
    fields: [
      {
        key: 'case_petition_no',
        label: 'Case/Petition No',
        type: 'text',
        required: true,
      },
      { key: 'case_year', label: 'Case Year', type: 'number', required: true },
      { key: 'case_type', label: 'Case Type', type: 'text', required: true },
      { key: 'case_status', label: 'Case Status', type: 'text', required: true },
      { key: 'case_title', label: 'Case Title', type: 'text', required: true },
      { key: 'judge_name', label: 'Judge Name', type: 'text' },
      { key: 'judge_designation', label: 'Judge Designation', type: 'text' },
      { key: 'previous_case_date', label: 'Previous Case Date', type: 'date' },
      { key: 'decided_case_date', label: 'Decided Case Date', type: 'date' },
      { key: 'future_case_date', label: 'Future Date', type: 'date' },
    ],
  },
  {
    title: 'Required Documents & Notes',
    fields: [
      {
        key: 'required_documents_notes',
        label: 'Required Documents / Notes',
        type: 'textarea',
      },
      { key: 'note', label: 'Note', type: 'textarea' },
    ],
  },
  {
    title: 'Others Info',
    fields: [
      { key: 'no_of_sets', label: 'No. of Sets', type: 'number', required: true },
      { key: 'set_type', label: 'Set Type', type: 'text', required: true },
      {
        key: 'mode_of_delivery',
        label: 'Mode of Delivery',
        type: 'select',
        required: true,
        options: ['By Hand', 'Courier', 'TCS'],
      },
      { key: 'address', label: 'Address', type: 'textarea' },
    ],
  },
  {
    title: 'Documents & Delivery',
    fields: [
      {
        key: 'documents_upload_note',
        label: 'Upload Files in final step using picker below',
        type: 'text',
      },
    ],
  },
];

export const judicialFlows: IntakeFlow[] = [
  {
    key: 'judicial_case_files',
    label: 'Case Files',
    endpoint: '/tickets/intake/judicial/case-files',
    steps: judicialCommonSteps,
  },
  {
    key: 'judicial_case_information',
    label: 'Case Information',
    endpoint: '/tickets/intake/judicial/case-information',
    steps: judicialCommonSteps,
  },
  {
    key: 'judicial_case_search',
    label: 'Case Search',
    endpoint: '/tickets/intake/judicial/case-search',
    steps: judicialCommonSteps,
  },
  {
    key: 'judicial_case_filing',
    label: 'Case Filling',
    endpoint: '/tickets/intake/judicial/case-filing',
    steps: judicialCommonSteps,
  },
  {
    key: 'judicial_power_of_attorney',
    label: 'Power of Attorney',
    endpoint: '/tickets/intake/judicial/power-of-attorney',
    steps: judicialCommonSteps,
  },
];

export const nonJudicialFlows: IntakeFlow[] = [
  {
    key: 'non_judicial_copy_of_fir',
    label: 'Copy of FIR',
    endpoint: '/tickets/intake/non-judicial/copy-of-fir',
    steps: [
      {
        title: 'Service Selection',
        fields: [
          {
            key: 'province_capital',
            label: 'Select Province / Capital',
            type: 'text',
            required: true,
          },
          {
            key: 'select_district',
            label: 'Select District',
            type: 'text',
            required: true,
          },
          {
            key: 'police_station',
            label: 'Police Station',
            type: 'text',
            required: true,
          },
        ],
      },
      {
        title: 'Case Details',
        fields: [
          { key: 'fir_no', label: 'FIR No', type: 'text', required: true },
          { key: 'year', label: 'Year', type: 'number', required: true },
          { key: 'fir_date', label: 'FIR Date', type: 'date', required: true },
          { key: 'offence', label: 'Offence', type: 'text', required: true },
          { key: 'title', label: 'Title', type: 'text', required: true },
        ],
      },
      {
        title: 'Others Info',
        fields: [
          { key: 'city_type', label: 'City Type', type: 'text', required: true },
          {
            key: 'mode_of_delivery',
            label: 'Mode of Delivery',
            type: 'select',
            required: true,
            options: ['By Hand', 'Courier', 'TCS'],
          },
          { key: 'no_of_sets', label: 'No. of Sets', type: 'number', required: true },
          { key: 'set_type', label: 'Set Type', type: 'text', required: true },
          { key: 'address', label: 'Address', type: 'textarea' },
          { key: 'note', label: 'Note', type: 'textarea' },
        ],
      },
      {
        title: 'Documents & Delivery',
        fields: [
          {
            key: 'documents_upload_note',
            label: 'Upload Files in final step using picker below',
            type: 'text',
          },
        ],
      },
    ],
  },
  {
    key: 'non_judicial_registry_deed',
    label: 'Registry/Deed',
    endpoint: '/tickets/intake/non-judicial/registry-deed',
    steps: [
      {
        title: 'Service Selection',
        fields: [
          { key: 'office_name', label: 'Office Name', type: 'text', required: true },
          { key: 'select_city', label: 'Select City', type: 'text', required: true },
          { key: 'city_type', label: 'City Type', type: 'text', required: true },
        ],
      },
      {
        title: 'Case Details',
        fields: [
          { key: 'doc_no', label: 'Doc No.', type: 'text', required: true },
          { key: 'year', label: 'Year', type: 'number', required: true },
          { key: 'date', label: 'Date', type: 'date', required: true },
          { key: 'title_party_a', label: 'Title (A)', type: 'text', required: true },
          { key: 'title_party_b', label: 'Title (B)', type: 'text', required: true },
        ],
      },
      {
        title: 'Others Info',
        fields: [
          {
            key: 'mode_of_delivery',
            label: 'Mode of Delivery',
            type: 'select',
            required: true,
            options: ['By Hand', 'Courier', 'TCS'],
          },
          { key: 'no_of_sets', label: 'No. of Sets', type: 'number', required: true },
          { key: 'set_type', label: 'Set Type', type: 'text', required: true },
          { key: 'address', label: 'Address', type: 'textarea' },
          { key: 'note', label: 'Note', type: 'textarea' },
        ],
      },
      {
        title: 'Documents & Delivery',
        fields: [
          {
            key: 'documents_upload_note',
            label: 'Upload Files in final step using picker below',
            type: 'text',
          },
        ],
      },
    ],
  },
];
