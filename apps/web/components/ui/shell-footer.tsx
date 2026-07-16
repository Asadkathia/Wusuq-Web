/** Attribution for the team that built this portal. Exact string — do not reword. */
export const ATTRIBUTION = 'Developed by @2026-Klarus AI';

export function copyrightLine(year: number = new Date().getFullYear()): string {
  return `© ${year} Wusuq`;
}

/**
 * The app's only page footer. Rendered by both the portal and consumer shells.
 * Also the single home of the copyright string, which was previously
 * copy-pasted across three auth pages.
 */
export function ShellFooter({ className }: { className?: string }) {
  return (
    <footer
      className={`border-t border-border-soft px-4 py-4 text-center text-xs text-slate-400 sm:px-6 ${className ?? ''}`}
    >
      {copyrightLine()} · {ATTRIBUTION}
    </footer>
  );
}
