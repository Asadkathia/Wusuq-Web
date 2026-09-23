/**
 * Guided-tour data types. Tour content is plain data (no JSX) so copy can be
 * edited without touching components; targets are `data-tour` attribute ids.
 */
import type { TourId, TourStatusValue } from '@wusuq/shared';

export interface TourStep {
  /** `data-tour` id to highlight; absent = centred card. */
  target?: string;
  /** Alternative target below the lg breakpoint (e.g. the mobile menu button). */
  mobileTarget?: string;
  /** Skip silently when the target is absent/hidden (e.g. "your first ticket"). */
  optional?: boolean;
  title: string;
  body: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

/** Final-step link that continues the workflow on another page. */
export interface TourChain {
  label: string;
  href: string;
  tourId: TourId;
}

export interface TourDefinition {
  id: TourId;
  /** Page the tour lives on — enables "open & tour" from the ? menu. Omit for dynamic pages. */
  href?: string;
  menuLabel: string;
  steps: TourStep[];
  next?: TourChain;
}

export interface TourProgressRow {
  tourId: string;
  version: number;
  status: TourStatusValue;
}
