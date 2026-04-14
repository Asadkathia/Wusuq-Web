'use client';

import { ShellTopbar } from './ui/shell-topbar';

export function Topbar() {
  const signOut = () => {
    localStorage.removeItem('wusuq_access_token');
    localStorage.removeItem('wusuq_refresh_token');
    localStorage.removeItem('wusuq_user');
    localStorage.removeItem('wusuq_impersonator_access_token');
    localStorage.removeItem('wusuq_impersonator_refresh_token');
    localStorage.removeItem('wusuq_impersonator_user');
    window.location.href = '/login';
  };

  return <ShellTopbar variant="staff" profileHref="/profile" onSignOut={signOut} />;
}
