'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { IntakeFlow } from '@/lib/intake-flows';

type StepRailProps = {
  selectedFlow: IntakeFlow;
  currentStep: number;
  onStepClick?: (step: number) => void;
};

export function StepRail({ selectedFlow, currentStep, onStepClick }: StepRailProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const totalSteps = selectedFlow.steps.length;
  const activeTitle = selectedFlow.steps[currentStep - 1]?.title ?? '';

  const sheetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sheetOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) setSheetOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [sheetOpen]);

  const progressPct = Math.round(((currentStep - 1) / Math.max(totalSteps - 1, 1)) * 100);

  return (
    <nav aria-label="Progress">
      {/* Mobile compact header */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex w-full items-center justify-between rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm shadow-elev-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          aria-expanded={sheetOpen}
        >
          <span className="font-semibold text-slate-800">
            Step {currentStep} of {totalSteps} · {activeTitle}
          </span>
          <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
        </button>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-brand-500 transition-[width] duration-300 ease-silk"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {sheetOpen && (
          <div className="fixed inset-0 z-50 flex items-end bg-slate-900/40 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Steps">
            <div ref={sheetRef} className="w-full rounded-t-2xl bg-surface p-6 shadow-elev-3">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-800">Steps</span>
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
                >
                  Close
                </button>
              </div>
              <ol className="space-y-1.5">
                {selectedFlow.steps.map((step, index) => {
                  const stepNumber = index + 1;
                  const isCompleted = currentStep > stepNumber;
                  const isCurrent = currentStep === stepNumber;
                  const canJump = isCompleted;
                  return (
                    <li key={`${step.title}-${stepNumber}`}>
                      <button
                        type="button"
                        disabled={!canJump}
                        aria-current={isCurrent ? 'step' : undefined}
                        onClick={() => { if (canJump) { onStepClick?.(stepNumber); setSheetOpen(false); } }}
                        className={[
                          'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                          isCurrent
                            ? 'bg-brand-50 text-brand-700 font-semibold'
                            : isCompleted
                            ? 'text-slate-700 hover:bg-surface-muted cursor-pointer'
                            : 'text-slate-400 cursor-default',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
                        ].join(' ')}
                      >
                        <StepDot isCompleted={isCompleted} isCurrent={isCurrent} number={stepNumber} />
                        {step.title}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        )}
      </div>

      {/* Desktop horizontal rail */}
      <div className="hidden md:block">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
            Step {currentStep} of {totalSteps}
          </span>
          <span className="text-xs tabular-nums text-slate-400">{progressPct}% complete</span>
        </div>
        <div className="mb-5 h-1 w-full overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-brand-500 transition-[width] duration-300 ease-silk"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <ol role="list" className="grid gap-2" style={{ gridTemplateColumns: `repeat(${totalSteps}, minmax(0, 1fr))` }}>
          {selectedFlow.steps.map((step, index) => {
            const stepNumber = index + 1;
            const isCompleted = currentStep > stepNumber;
            const isCurrent = currentStep === stepNumber;
            const canJump = isCompleted;
            return (
              <li key={`${step.title}-${stepNumber}`} className="min-w-0">
                <button
                  type="button"
                  disabled={!canJump}
                  aria-current={isCurrent ? 'step' : undefined}
                  onClick={() => canJump && onStepClick?.(stepNumber)}
                  className={[
                    'group flex w-full items-start gap-3 rounded-xl border p-3 text-left',
                    'transition-[background-color,border-color,transform,box-shadow] duration-200 ease-silk',
                    isCurrent
                      ? 'border-brand-500 bg-brand-50/60 shadow-elev-1'
                      : isCompleted
                      ? 'border-border-soft bg-surface hover:border-brand-200 hover:bg-surface-hover cursor-pointer'
                      : 'border-border-soft bg-surface/60 cursor-default',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
                  ].join(' ')}
                >
                  <StepDot isCompleted={isCompleted} isCurrent={isCurrent} number={stepNumber} />
                  <span className="min-w-0 flex-1">
                    <span className={['block text-[10px] font-medium uppercase tracking-[0.12em]', isCurrent ? 'text-brand-600' : 'text-slate-400'].join(' ')}>
                      {isCompleted ? 'Done' : isCurrent ? 'Current' : 'Upcoming'}
                    </span>
                    <span
                      className={[
                        'mt-0.5 block truncate text-xs font-semibold',
                        isCurrent ? 'text-slate-900' : isCompleted ? 'text-slate-700' : 'text-slate-500',
                      ].join(' ')}
                      title={step.title}
                    >
                      {step.title}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}

function StepDot({ isCompleted, isCurrent, number }: { isCompleted: boolean; isCurrent: boolean; number: number }) {
  return (
    <span
      className={[
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold',
        'transition-[background-color,color] duration-200',
        isCompleted
          ? 'bg-brand-500 text-white'
          : isCurrent
          ? 'bg-brand-100 text-brand-700 ring-1 ring-brand-500/30'
          : 'bg-surface-muted text-slate-400',
      ].join(' ')}
    >
      {isCompleted ? <Check className="h-3.5 w-3.5" /> : number}
    </span>
  );
}
