import { coerceErrorMessage } from './api-client';

describe('coerceErrorMessage', () => {
  it('passes a plain string through', () => {
    expect(coerceErrorMessage('Ticket not found')).toBe('Ticket not found');
  });

  it('joins a class-validator string[] instead of white-screening', () => {
    // This is the shape a NestJS validation 400 returns. Before the fix, the
    // array reached `message.toLowerCase()` in the UI and crashed the page.
    expect(
      coerceErrorMessage(['fromCurrency must be a string', 'rate must not be less than 0']),
    ).toBe('fromCurrency must be a string; rate must not be less than 0');
  });

  it('the joined result is a string with .toLowerCase (the crash guard)', () => {
    const out = coerceErrorMessage(['fromCurrency must be a string']);
    expect(typeof out).toBe('string');
    expect(() => out.toLowerCase()).not.toThrow();
  });

  it('falls back for null/undefined/empty/non-string', () => {
    expect(coerceErrorMessage(undefined)).toBe('An error occurred');
    expect(coerceErrorMessage(null)).toBe('An error occurred');
    expect(coerceErrorMessage('')).toBe('An error occurred');
    expect(coerceErrorMessage({ nested: 'obj' })).toBe('An error occurred');
    expect(coerceErrorMessage([])).toBe('An error occurred');
  });
});
