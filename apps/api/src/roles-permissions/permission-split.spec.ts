import { ROLE_PERMISSIONS, isConsumerRole, isStaffRole } from '@wusuq/shared';

describe('tickets permission split (report 3.2)', () => {
  const consumerClass = ['consumer', 'lawyer', 'company'] as const;
  const staffRoles = [
    'super-admin',
    'manager-admin',
    'staff-admin',
    'lead-admin',
  ] as const;

  it.each(consumerClass)(
    '%s holds tickets.create but not tickets.write',
    (role) => {
      expect(ROLE_PERMISSIONS[role]).toContain('tickets.create');
      expect(ROLE_PERMISSIONS[role]).not.toContain('tickets.write');
    },
  );

  it('representative holds tickets.clerk but not tickets.write', () => {
    expect(ROLE_PERMISSIONS.representative).toContain('tickets.clerk');
    expect(ROLE_PERMISSIONS.representative).not.toContain('tickets.write');
  });

  it.each(staffRoles)('%s keeps tickets.write', (role) => {
    expect(ROLE_PERMISSIONS[role]).toContain('tickets.write');
  });

  it.each(staffRoles)(
    '%s can also create intake tickets and drive the clerk lifecycle',
    (role) => {
      expect(ROLE_PERMISSIONS[role]).toContain('tickets.create');
      expect(ROLE_PERMISSIONS[role]).toContain('tickets.clerk');
    },
  );
});

describe('isConsumerRole / isStaffRole (report 3.1 casing trap)', () => {
  it('covers the consumer-class roles in their canonical lowercase form', () => {
    expect(isConsumerRole('consumer')).toBe(true);
    expect(isConsumerRole('lawyer')).toBe(true);
    expect(isConsumerRole('company')).toBe(true);
  });

  it('excludes representative (assignment-scoped, not consumer-class) and staff', () => {
    expect(isConsumerRole('representative')).toBe(false);
    expect(isConsumerRole('super-admin')).toBe(false);
    expect(isConsumerRole('staff-admin')).toBe(false);
  });

  it('never matches the legacy uppercase spelling', () => {
    // 'CONSUMER' is the Prisma enum spelling; JwtUser.role is always the
    // lowercase shared UserRole. The helper exists so this can't regress.
    expect(isConsumerRole('CONSUMER')).toBe(false);
    expect(isConsumerRole(undefined)).toBe(false);
    expect(isConsumerRole(null)).toBe(false);
  });

  it('isStaffRole covers exactly the four admin roles', () => {
    expect(isStaffRole('super-admin')).toBe(true);
    expect(isStaffRole('manager-admin')).toBe(true);
    expect(isStaffRole('staff-admin')).toBe(true);
    expect(isStaffRole('lead-admin')).toBe(true);
    expect(isStaffRole('representative')).toBe(false);
    expect(isStaffRole('consumer')).toBe(false);
    expect(isStaffRole(undefined)).toBe(false);
  });
});
