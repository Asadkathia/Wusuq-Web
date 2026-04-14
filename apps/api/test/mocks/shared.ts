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

export const TICKET_STATUSES = [
  'PENDING',
  'ASSIGNED',
  'IN_PROGRESS',
  'COMPLETED',
] as const;

export const PAYMENT_MODES = [
  'JAZZ_CASH',
  'EASY_PAISA',
  'BANK_TRANSFER',
] as const;

export const PERMISSIONS = [
  'users.read',
  'users.write',
  'tickets.read',
  'tickets.write',
  'finance.read',
  'finance.write',
  'wallet.read',
  'wallet.write',
  'costs.read',
  'costs.write',
  'elections.read',
  'elections.write',
  'reports.read',
  'documents.read',
  'audit.read',
] as const;

export const ROLE_PERMISSIONS = {
  'super-admin': PERMISSIONS,
  'manager-admin': [
    'users.read',
    'tickets.read',
    'tickets.write',
    'finance.read',
    'wallet.read',
    'costs.read',
    'costs.write',
    'elections.read',
    'reports.read',
    'documents.read',
    'audit.read',
  ],
  'staff-admin': [
    'tickets.read',
    'tickets.write',
    'wallet.read',
    'wallet.write',
    'costs.read',
    'elections.read',
    'reports.read',
    'documents.read',
    'audit.read',
  ],
  'lead-admin': [
    'tickets.read',
    'tickets.write',
    'reports.read',
    'documents.read',
    'audit.read',
  ],
  lawyer: ['tickets.read', 'tickets.write', 'documents.read'],
  consumer: ['tickets.read', 'wallet.read', 'documents.read'],
  representative: ['tickets.read', 'tickets.write', 'documents.read'],
  investor: ['reports.read'],
  company: ['tickets.read', 'wallet.read', 'documents.read'],
} as const;
