/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @next/next/no-img-element */
interface AvatarItem {
  id: string;
  name: string;
  imageUrl?: string;
  fallback?: string;
}

interface AvatarStackProps {
  users: AvatarItem[];
  limit?: number;
  className?: string;
}

export function AvatarStack({ users, limit = 4, className = '' }: AvatarStackProps) {
  const displayUsers = users.slice(0, limit);
  const remainingCount = Math.max(0, users.length - limit);

  return (
    <div className={`flex -space-x-2 overflow-hidden ${className}`}>
      {displayUsers.map((user) => (
        <div
          key={user.id}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-medium text-slate-600 ring-2 ring-surface"
          title={user.name}
        >
          {user.imageUrl ? (
            <img src={user.imageUrl} alt={user.name} className="h-full w-full rounded-full object-cover" />
          ) : (
            user.fallback || user.name.charAt(0).toUpperCase()
          )}
        </div>
      ))}
      {remainingCount > 0 && (
        <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-50 text-xs font-medium text-slate-600 ring-2 ring-surface">
          +{remainingCount}
        </div>
      )}
    </div>
  );
}
