export const USER_ROLES = [
  'super-admin',
  'manager-admin',
  'staff-admin',
  'lead-admin',
  'lawyer',
  'consumer',
  'representative',
  'investor',
  'company',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const TICKET_STATUSES = [
  'PENDING',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_APPROVAL',
  'COMPLETED',
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const PAYMENT_MODES = ['JAZZ_CASH', 'EASY_PAISA', 'BANK_TRANSFER'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const PERMISSIONS = [
  'users.read',
  'users.write',
  'tickets.read',
  'tickets.write',
  'finance.read',
  'finance.write',
  'wallet.read',
  'wallet.write',
  'wallet.topup',
  'costs.read',
  'costs.write',
  'elections.read',
  'elections.write',
  'elections.vote',
  'reports.read',
  'documents.read',
  'audit.read',
  'cases.read',
  'cases.write',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  'super-admin': PERMISSIONS,
  'manager-admin': [
    'users.read',
    'tickets.read',
    'tickets.write',
    'finance.read',
    'wallet.read',
    'wallet.topup',
    'costs.read',
    'costs.write',
    'elections.read',
    'elections.vote',
    'reports.read',
    'documents.read',
    'audit.read',
    'cases.read',
    'cases.write',
  ],
  'staff-admin': [
    'users.read',
    'users.write',
    'tickets.read',
    'tickets.write',
    'wallet.read',
    'wallet.write',
    'wallet.topup',
    'costs.read',
    'elections.read',
    'reports.read',
    'documents.read',
    'audit.read',
    'cases.read',
    'cases.write',
  ],
  'lead-admin': [
    'tickets.read',
    'tickets.write',
    'elections.read',
    'elections.vote',
    'reports.read',
    'documents.read',
    'audit.read',
    'cases.read',
    'cases.write',
  ],
  lawyer: ['tickets.read', 'tickets.write', 'wallet.read', 'wallet.topup', 'documents.read', 'cases.read', 'cases.write', 'elections.read', 'elections.vote'],
  consumer: ['tickets.read', 'tickets.write', 'wallet.read', 'wallet.topup', 'documents.read', 'cases.read', 'elections.read', 'elections.vote'],
  representative: ['tickets.read', 'tickets.write', 'documents.read', 'cases.read', 'elections.read', 'elections.vote'],
  investor: ['reports.read'],
  company: ['tickets.read', 'tickets.write', 'wallet.read', 'wallet.topup', 'documents.read', 'cases.read'],
};
