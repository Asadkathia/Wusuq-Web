/** Consumer documents tour — deliverables Wusuq produces for completed tickets. */
import type { TourDefinition } from '../types';

export const consumerDocumentsTour: TourDefinition = {
  id: 'consumer.documents',
  href: '/consumer/documents',
  menuLabel: 'Documents',
  steps: [
    {
      target: 'documents.list',
      title: 'Documents from Wusuq',
      body: 'Documents our paralegals deliver appear here once your ticket is completed.',
    },
    {
      target: 'documents.preview',
      optional: true,
      title: 'View before downloading',
      body: 'Preview a document right here, or download it.',
    },
  ],
};
