import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateUserDto } from './dto/update-user.dto';

const errs = async (phone: unknown) => {
  const dto = plainToInstance(UpdateUserDto, { phone } as Record<
    string,
    unknown
  >);
  const e = await validate(dto);
  return e.flatMap((x) => Object.keys(x.constraints ?? {}));
};

describe('UpdateUserDto.phone (batch-7 review finding 3)', () => {
  it('accepts a blank phone — both admin forms PATCH "" for a user with none', async () => {
    expect(await errs('')).toEqual([]);
  });
  it('accepts undefined', async () => {
    expect(await errs(undefined)).toEqual([]);
  });
  it('accepts a valid E.164 number', async () => {
    expect(await errs('+923001234567')).toEqual([]);
  });
  it('rejects the short PK number from the report ("it works in 9 digits too")', async () => {
    // +9230012345 is a LEGAL E.164 string — plain E.164 does not catch it.
    // The +92 branch has to pin the real Pakistani rule.
    expect(await errs('+9230012345')).not.toEqual([]);
  });
  it('rejects a PK number not starting with 3', async () => {
    expect(await errs('+924001234567')).not.toEqual([]);
  });
  it('still accepts a valid non-PK number', async () => {
    expect(await errs('+971501234567')).toEqual([]);
  });
  it('still rejects an over-long number', async () => {
    expect(await errs('+923001234567889998')).not.toEqual([]);
  });
});
