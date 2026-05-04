'use client';

function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function PersonalFilesQuota({ bytesUsed, quotaBytes }: { bytesUsed: number; quotaBytes: number }) {
  const pct = quotaBytes > 0 ? Math.min(100, (bytesUsed / quotaBytes) * 100) : 0;
  const tone = pct > 90 ? 'bg-rose-500' : pct > 70 ? 'bg-amber-500' : 'bg-brand-500';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>Storage</span>
        <span>{fmt(bytesUsed)} of {fmt(quotaBytes)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
