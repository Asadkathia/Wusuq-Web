import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SignupDto } from './signup.dto';

const base = {
  name: 'Asad',
  email: 'a@x.com',
  password: 'password1',
  phone: '+923001234567',
  consumerKind: 'NON_LAWYER',
  country: 'PK',
};

async function errorsFor(payload: Record<string, unknown>) {
  return validate(plainToInstance(SignupDto, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('SignupDto', () => {
  it('accepts a valid payload with a phone', async () => {
    expect(await errorsFor(base)).toHaveLength(0);
  });

  it('rejects a missing phone (phone is the region signal, now required)', async () => {
    const { phone: _omit, ...noPhone } = base;
    const errors = await errorsFor(noPhone);
    expect(errors.some((e) => e.property === 'phone')).toBe(true);
  });

  it('rejects a too-short phone', async () => {
    const errors = await errorsFor({ ...base, phone: '12' });
    expect(errors.some((e) => e.property === 'phone')).toBe(true);
  });

  it('rejects a missing or invalid user type', async () => {
    const { consumerKind: _omit, ...noKind } = base;
    expect(
      (await errorsFor(noKind)).some((e) => e.property === 'consumerKind'),
    ).toBe(true);
    const bad = await errorsFor({ ...base, consumerKind: 'CIVILIAN' });
    expect(bad.some((e) => e.property === 'consumerKind')).toBe(true);
  });

  it('still allows country to be omitted', async () => {
    const { country: _omit, ...noCountry } = base;
    expect(await errorsFor(noCountry)).toHaveLength(0);
  });
});
