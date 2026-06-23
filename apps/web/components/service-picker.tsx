import Link from 'next/link';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import { flowKeyToSlug, type IntakeFlow } from '@/lib/intake-flows';
import { UsdTileGate, UsdServicesEmptyState } from './usd-service-gate';

type Variant = 'admin' | 'consumer';

type ServicePickerProps = {
  flows: IntakeFlow[];
  variant: Variant;
  basePath: string;
  title: string;
  subtitle?: string;
};

export function ServicePicker({
  flows,
  variant,
  basePath,
  title,
  subtitle,
}: ServicePickerProps) {
  const isConsumer = variant === 'consumer';

  return (
    <section
      className={
        isConsumer
          ? 'mx-auto w-full max-w-5xl px-4 py-10 sm:py-14'
          : 'w-full px-2 py-6'
      }
    >
      <header className={isConsumer ? 'mb-8 text-center sm:mb-10' : 'mb-6'}>
        <h1
          className={
            isConsumer
              ? 'text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl'
              : 'text-2xl font-semibold tracking-tight text-slate-900'
          }
        >
          {title}
        </h1>
        <p
          className={
            isConsumer
              ? 'mx-auto mt-3 max-w-2xl text-base text-slate-600'
              : 'mt-1 text-sm text-slate-600'
          }
        >
          {subtitle ??
            'Choose the service you need to begin. You can always come back to pick a different one.'}
        </p>
      </header>

      {/* USD (international) consumers can only order the flows with USD
          pricing; this notice shows when none of the listed flows qualify
          (e.g. the non-judicial menu). Admin/portal users always see all. */}
      {isConsumer ? (
        <UsdServicesEmptyState flowKeys={flows.map((f) => f.key)} />
      ) : null}

      <ul
        className={
          isConsumer
            ? 'grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3'
            : 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'
        }
      >
        {flows.map((flow) => {
          const Icon = flow.icon ?? Sparkles;
          const href = `${basePath}/${flowKeyToSlug(flow.key)}`;
          const tile = (
            <li key={flow.key}>
              <Link
                href={href}
                className={
                  isConsumer
                    ? 'group flex h-full flex-col gap-4 rounded-3xl border border-border-soft bg-surface p-6 shadow-elev-1 transition-[transform,box-shadow,border-color] duration-200 ease-silk hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-elev-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40'
                    : 'group flex h-full flex-col gap-3 rounded-2xl border border-border-soft bg-surface p-5 shadow-elev-1 transition-[transform,box-shadow,border-color] duration-200 ease-silk hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-elev-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40'
                }
              >
                <div className="flex items-start justify-between">
                  <span
                    className={
                      isConsumer
                        ? 'inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100'
                        : 'inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100'
                    }
                  >
                    <Icon className={isConsumer ? 'h-6 w-6' : 'h-5 w-5'} />
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-slate-400 transition-colors group-hover:text-brand-500" />
                </div>

                <div className="flex flex-col gap-1.5">
                  <h2
                    className={
                      isConsumer
                        ? 'text-lg font-semibold text-slate-900'
                        : 'text-base font-semibold text-slate-900'
                    }
                  >
                    {flow.label}
                  </h2>
                  {flow.description ? (
                    <p
                      className={
                        isConsumer
                          ? 'text-sm leading-relaxed text-slate-600'
                          : 'text-sm leading-relaxed text-slate-600'
                      }
                    >
                      {flow.description}
                    </p>
                  ) : null}
                </div>
              </Link>
            </li>
          );
          // Consumer tiles are gated by billing currency (USD customers only
          // see flows with USD pricing); admin/portal sees everything.
          return isConsumer ? (
            <UsdTileGate key={flow.key} flowKey={flow.key}>
              {tile}
            </UsdTileGate>
          ) : (
            tile
          );
        })}
      </ul>
    </section>
  );
}
