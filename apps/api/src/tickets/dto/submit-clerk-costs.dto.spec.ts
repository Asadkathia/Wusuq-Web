import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SubmitClerkCostsDto } from './submit-clerk-costs.dto';

describe('SubmitClerkCostsDto', () => {
  it('accepts the legacy charge fields (backward compatible)', async () => {
    const dto = plainToInstance(SubmitClerkCostsDto, {
      deliveryCharges: 100,
      printingCharges: 50,
      attestedCharges: 25,
      nonAttestedCharges: 10,
      additionalCharges: 0,
      noOfPages: 12,
      costPerPage: 5,
      rejectionReason: 'court archive closed',
    });
    const errors = await validate(dto, { whitelist: true });
    expect(errors).toEqual([]);
  });

  it('accepts the new clerk-report fields (files-availability, per-page rates, partial completion)', async () => {
    const dto = plainToInstance(SubmitClerkCostsDto, {
      deliveryCharges: 100,
      filesAvailable: { attested: true, nonAttested: false, both: false },
      perPageRateAttested: 25,
      perPageRateNonAttested: 10,
      unavailableReason: 'attested set offline this week',
      partialCompletion: true,
    });
    const errors = await validate(dto, { whitelist: true });
    expect(errors).toEqual([]);
    expect(dto.filesAvailable?.attested).toBe(true);
    expect(dto.filesAvailable?.nonAttested).toBe(false);
    expect(dto.perPageRateAttested).toBe(25);
    expect(dto.perPageRateNonAttested).toBe(10);
    expect(dto.partialCompletion).toBe(true);
    expect(dto.unavailableReason).toBe('attested set offline this week');
  });

  it('rejects a malformed filesAvailable shape (non-boolean fields)', async () => {
    const dto = plainToInstance(SubmitClerkCostsDto, {
      filesAvailable: { attested: 'yes', nonAttested: 123 },
    });
    const errors = await validate(dto, { whitelist: true });
    expect(errors.length).toBeGreaterThan(0);
    const filesErr = errors.find((e) => e.property === 'filesAvailable');
    expect(filesErr).toBeDefined();
    expect(filesErr?.children?.length).toBeGreaterThan(0);
  });

  it('rejects negative per-page rates', async () => {
    const dto = plainToInstance(SubmitClerkCostsDto, {
      perPageRateAttested: -5,
    });
    const errors = await validate(dto, { whitelist: true });
    expect(errors.some((e) => e.property === 'perPageRateAttested')).toBe(true);
  });

  it('rejects a non-boolean partialCompletion', async () => {
    const dto = plainToInstance(SubmitClerkCostsDto, {
      partialCompletion: 'maybe',
    });
    const errors = await validate(dto, { whitelist: true });
    expect(errors.some((e) => e.property === 'partialCompletion')).toBe(true);
  });

  it('accepts an empty payload (all fields optional)', async () => {
    const dto = plainToInstance(SubmitClerkCostsDto, {});
    const errors = await validate(dto, { whitelist: true });
    expect(errors).toEqual([]);
  });
});
