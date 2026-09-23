/** Consumer case files tour — upload your own case documents, grouped by case. */
import type { TourDefinition } from '../types';

export const consumerCaseFilesTour: TourDefinition = {
  id: 'consumer.case-files',
  href: '/consumer/case-files',
  menuLabel: 'Case files',
  steps: [
    {
      target: 'case-files.upload',
      title: 'Upload a case file',
      body: "Add your own case documents with the case number and year so they're grouped together.",
    },
    {
      target: 'case-files.list',
      title: 'Grouped by case',
      body: 'Files are grouped by case. View or download any file here.',
    },
  ],
};
