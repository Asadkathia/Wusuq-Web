'use client';

import { ShellTopbar } from './ui/shell-topbar';
import { useStaffNavItems } from './nav';
import { STAFF_LOGIN_PATH } from '@/lib/staff-routes';

export function Topbar() {
  const mobileNavItems = useStaffNavItems();

  const signOut = () => {
    localStorage.removeItem('wusuq_access_token');
    localStorage.removeItem('wusuq_refresh_token');
    localStorage.removeItem('wusuq_user');
    localStorage.removeItem('wusuq_impersonator_access_token');
    localStorage.removeItem('wusuq_impersonator_refresh_token');
    localStorage.removeItem('wusuq_impersonator_user');
    window.location.href = STAFF_LOGIN_PATH;
  };

  return <ShellTopbar variant="staff" profileHref="/profile" onSignOut={signOut} mobileNavItems={mobileNavItems} />;
}
