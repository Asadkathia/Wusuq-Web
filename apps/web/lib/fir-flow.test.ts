import { judicialFlows, nonJudicialFlows } from './intake-flows';

/**
 * Batch-6 D: the FIR / criminal-record intake must not demand a police station
 * from the one customer it exists for — someone who has no case details at all.
 * Client: "he doesn't know anything about the FIR, or the police station, or
 * the court; he just wants to check his criminal record from Punjab."
 */
const ALL_FLOWS = [...judicialFlows, ...nonJudicialFlows];
const flowByKey = (key: string) => ALL_FLOWS.find((f) => f.key === key)!;
const fieldsOf = (key: string) => flowByKey(key).steps.flatMap((s) => s.fields);

describe('Copy of FIR flow (batch-6 D)', () => {
  const fields = () => fieldsOf('non_judicial_copy_of_fir');

  it('gates the police station on the FIR branch only', () => {
    const station = fields().find((f) => f.key === 'station_id')!;
    expect(station.showWhen).toEqual({
      field: 'fir_mode',
      value: 'have_fir_number',
    });
  });

  it('no longer asks for city_type', () => {
    // The police station already resolves City vs Sadar.
    expect(fields().some((f) => f.key === 'city_type')).toBe(false);
  });

  it('still declares the branching question', () => {
    const mode = fields().find((f) => f.key === 'fir_mode')!;
    expect(mode.required).toBe(true);
    expect(mode.options).toEqual(['have_fir_number', 'search_by_cnic']);
  });
});

describe('Criminal record search flow (batch-6 D)', () => {
  const fields = () => fieldsOf('non_judicial_criminal_record_search');

  it('does not require a police station', () => {
    const station = fields().find((f) => f.key === 'station_id')!;
    expect(station.required).toBe(false);
  });

  it('no longer asks for city_type', () => {
    expect(fields().some((f) => f.key === 'city_type')).toBe(false);
  });

  it('still requires province and district — enough to route the search', () => {
    for (const key of ['province', 'district_id']) {
      expect(fields().find((f) => f.key === key)!.required).toBe(true);
    }
  });
});

describe('Registry / Deed flow keeps what FIR dropped', () => {
  it('still has office_name and city_type', () => {
    const fields = fieldsOf('non_judicial_registry_deed');
    // office_name is what now gates the Registry block, so the FIR step can't
    // accidentally render it (batch-6 D3).
    expect(fields.some((f) => f.key === 'office_name')).toBe(true);
    expect(fields.some((f) => f.key === 'city_type')).toBe(true);
  });
});
