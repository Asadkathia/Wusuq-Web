import type { HTMLAttributes } from 'react';

export function Skeleton({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={[
        'animate-pulse rounded-md bg-surface-muted',
        className,
      ].join(' ')}
      {...rest}
    />
  );
}

export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={['space-y-2', className].join(' ')}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={['h-3', i === lines - 1 ? 'w-2/3' : 'w-full'].join(' ')} />
      ))}
    </div>
  );
}

export function SkeletonRow({ height = 'h-14' }: { height?: string }) {
  return <Skeleton className={['w-full rounded-xl', height].join(' ')} />;
}
