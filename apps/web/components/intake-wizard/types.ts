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
  courtLevel?: string | null;
  courts?: string[];
  courtCities?: Record<string, string[]>;
  caseTypes?: string[];
};

export type CityCourt = {
  id: string;
  name: string;
  isPrincipalSeat: boolean;
};

export type CityCourtGroup = {
  type: string;
  courts: CityCourt[];
};

export type LocalUser = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  currency?: 'PKR' | 'USD';
};

export type IntakeWizardProps = {
  title: string;
  flows: IntakeFlow[];
  variant?: 'admin' | 'consumer';
  /**
   * If set, the ticket created by this wizard is attached to the given case.
   * The wizard sends `caseId` in the create-ticket payload; consumer is
   * locked to the case's consumer (no consumer picker shown).
   */
  caseId?: string;
  /**
   * Optional consumer to lock the wizard to (used together with `caseId`).
   * When provided, the consumer picker is hidden.
   */
  lockedConsumerId?: string;
  /**
   * Pre-fills the wizard's payload draft. Keys may be canonical Case
   * column names (e.g. `caseNo`) or wizard field names (e.g.
   * `case_petition_no`); the wizard normalizes via PAYLOAD_FIELD_ALIASES.
   */
  initialPayload?: Record<string, string>;
};
