import { regenerateHref } from './regenerate-route';

describe('regenerateHref', () => {
  it('builds the consumer judicial route', () => {
    expect(regenerateHref({ id: 't1', intakeFlow: 'judicial_case_files' }, 'consumer'))
      .toBe('/consumer/paralegal-services/judicial/case-files?regenerateFromTicketId=t1');
  });
  it('builds the consumer non-judicial route', () => {
    expect(regenerateHref({ id: 't2', intakeFlow: 'non_judicial_copy_of_fir' }, 'consumer'))
      .toBe('/consumer/paralegal-services/non-judicial/copy-of-fir?regenerateFromTicketId=t2');
  });
  it('builds the portal route', () => {
    expect(regenerateHref({ id: 't3', intakeFlow: 'judicial_case_files' }, 'portal'))
      .toBe('/paralegal-services/judicial/case-files?regenerateFromTicketId=t3');
  });
  it('returns null without an intakeFlow', () => {
    expect(regenerateHref({ id: 't4', intakeFlow: null }, 'consumer')).toBeNull();
  });
});
