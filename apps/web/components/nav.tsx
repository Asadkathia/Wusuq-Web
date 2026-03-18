import Link from 'next/link';

const links = [
  ['/dashboard', 'Dashboard'],
  ['/paralegal-services/judicial', 'Paralegal Services'],
  ['/tickets/pending', 'Paralegal Tickets'],
  ['/finance', 'Finance'],
  ['/wallet', 'Wallet'],
  ['/manage-users/users', 'Manage Users'],
  ['/manage-cost/service-cost', 'Manage Cost'],
  ['/elections-cabinet/elections', 'Elections & Cabinet'],
  ['/reports', 'Reports'],
  ['/documents', 'Documents'],
  ['/profile', 'Profile']
] as const;

export function SidebarNav() {
  return (
    <aside className="w-64 border-r border-slate-200 p-4">
      <h1 className="mb-4 text-lg font-semibold">Wusuq Rebuild</h1>
      <nav className="space-y-1">
        {links.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="block rounded px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
