import { InvoicesController } from './invoices.controller';

describe('InvoicesController permissions metadata', () => {
  const perms = (method: string): string[] =>
    Reflect.getMetadata(
      'permissions',
      InvoicesController.prototype[method as never],
    ) ?? [];

  it('generate is finance.write (super-admin only)', () => {
    expect(perms('generate')).toEqual(['finance.write']);
  });

  it('list is tickets.read — consumers must read their own', () => {
    expect(perms('list')).toEqual(['tickets.read']);
  });

  it('download is tickets.read (scoped in-service, never finance.read)', () => {
    expect(perms('download')).toEqual(['tickets.read']);
  });

  it('every route declares a permission (PermissionsGuard fail-opens without one)', () => {
    for (const m of ['generate', 'list', 'download']) {
      expect(perms(m).length).toBeGreaterThan(0);
    }
  });
});
