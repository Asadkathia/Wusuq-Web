import type { IntakeFlow } from '@/lib/intake-flows';

export type TicketDraft = {
  draftId?: string;
  flow: string;
  consumerId: string;
  serviceId: string;
  step: number;
  payload: Record<string, string>;
};

export type ServiceHit = {
  id: string;
  name: string;
  category: string;
  courts?: string[];
  courtCities?: Record<string, string[]>;
  caseTypes?: string[];
};

export type LocalUser = { id: string; name?: string; email?: string; role?: string };

export type IntakeWizardProps = {
  title: string;
  flows: IntakeFlow[];
  variant?: 'admin' | 'consumer';
};
