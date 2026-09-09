import { regenerateHref } from './regenerate-route';

describe('regenerateHref', () => {
  // BATCH-7 1.5: the target changed from the source flow to the SERVICE
  // PICKER. Regenerate exists so a consumer can reuse a case for a DIFFERENT
  // service — "he changes his service and the rest stays the same… it should
  // not land straight on Case File, it should ask which service you want."
  // The picker forwards regenerateFromTicketId to the tile that is chosen.
  it('opens the consumer judicial picker, carrying the ticket id', () => {
    expect(regenerateHref({ id: 't1', intakeFlow: 'judicial_case_files' }, 'consumer'))
      .toBe('/consumer/paralegal-services/judicial?regenerateFromTicketId=t1');
  });

  it('opens the consumer non-judicial picker for a non-judicial flow', () => {
    expect(regenerateHref({ id: 't2', intakeFlow: 'non_judicial_copy_of_fir' }, 'consumer'))
      .toBe('/consumer/paralegal-services/non-judicial?regenerateFromTicketId=t2');
  });

  it('opens the portal picker for staff', () => {
    expect(regenerateHref({ id: 't3', intakeFlow: 'judicial_case_files' }, 'portal'))
      .toBe('/paralegal-services/judicial?regenerateFromTicketId=t3');
  });

  it('does NOT pin the source flow in the path any more', () => {
    // Guard on the actual regression: pointing back at /case-files is what
    // made Regenerate re-order the same service every time.
    const href = regenerateHref({ id: 't5', intakeFlow: 'judicial_case_files' }, 'consumer');
    expect(href).not.toContain('/case-files');
  });

  it('returns null without an intakeFlow', () => {
    expect(regenerateHref({ id: 't4', intakeFlow: null }, 'consumer')).toBeNull();
  });

  it('returns null for a flow key with no known slug — nothing sensible to open', () => {
    expect(regenerateHref({ id: 't6', intakeFlow: 'not_a_real_flow' }, 'consumer')).toBeNull();
  });
});
