import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

// Mock @wusuq/shared (the package ships ESM which Jest CJS can't load).
// The DTO only uses CONSUMER_KINDS at runtime — duplicate the literal here.
jest.mock('@wusuq/shared', () => ({
  CONSUMER_KINDS: ['LAWYER', 'NON_LAWYER', 'CORPORATE'],
}));

import { ProfileCompleteDto } from './profile-complete.dto';

describe('ProfileCompleteDto', () => {
  it('accepts a payload without consumerKind (backwards compatible)', async () => {
    const dto = plainToInstance(ProfileCompleteDto, {
      name: 'Ali Raza',
      cityName: 'Lahore',
    });
    const errors = await validate(dto, { whitelist: true });
    expect(errors).toEqual([]);
  });

  it('accepts each valid consumerKind', async () => {
    for (const kind of ['LAWYER', 'NON_LAWYER', 'CORPORATE']) {
      const dto = plainToInstance(ProfileCompleteDto, {
        name: 'Ali',
        consumerKind: kind,
      });
      const errors = await validate(dto, { whitelist: true });
      expect(errors).toEqual([]);
    }
  });

  it('rejects an unknown consumerKind value', async () => {
    const dto = plainToInstance(ProfileCompleteDto, {
      name: 'Ali',
      consumerKind: 'STUDENT',
    });
    const errors = await validate(dto, { whitelist: true });
    expect(errors.some((e) => e.property === 'consumerKind')).toBe(true);
  });

  it('requires name', async () => {
    const dto = plainToInstance(ProfileCompleteDto, { consumerKind: 'LAWYER' });
    const errors = await validate(dto, { whitelist: true });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });
});
