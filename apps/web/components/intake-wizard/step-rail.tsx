'use client';

import { useState, useRef, useEffect } from 'react';
import { CheckCircle2, ChevronDown } from 'lucide-react';
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

  // Close sheet on backdrop click
  const sheetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sheetOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
        setSheetOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [sheetOpen]);

  const progressPct = Math.round(((currentStep - 1) / Math.max(totalSteps - 1, 1)) * 100);

  return (
    <nav aria-label="Progress">
      {/* Mobile compact header (below md) */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2"
          aria-expanded={sheetOpen}
        >
          <span className="font-semibold text-slate-700">
            Step {currentStep} of {totalSteps} · {activeTitle}
          </span>
          <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
        </button>
        <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200">
          <div
            className="h-1.5 rounded-full bg-primary-600 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Bottom sheet */}
        {sheetOpen && (
          <div className="fixed inset-0 z-50 flex items-end bg-black/40" aria-modal="true" role="dialog" aria-label="Steps">
            <div ref={sheetRef} className="w-full rounded-t-2xl bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">Steps</span>
                <button type="button" onClick={() => setSheetOpen(false)} className="text-slate-500 text-xs underline focus-visible:ring-2 focus-visible:ring-primary-600">
                  Close
                </button>
              </div>
              <ol className="space-y-3">
                {selectedFlow.steps.map((step, index) => {
                  const stepNumber = index + 1;
                  const isCompleted = currentStep > stepNumber;
                  const isCurrent = currentStep === stepNumber;
                  const canJump = isCompleted;
                  return (
                    <li key={step.title}>
                      <button
                        type="button"
                        disabled={!canJump}
                        aria-current={isCurrent ? 'step' : undefined}
                        onClick={() => { if (canJump) { onStepClick?.(stepNumber); setSheetOpen(false); } }}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                          isCurrent ? 'bg-primary-50 text-primary-700 font-semibold' :
                          isCompleted ? 'text-slate-700 hover:bg-slate-50 cursor-pointer' :
                          'text-slate-400 cursor-default'
                        } focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2`}
                      >
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                          isCompleted ? 'bg-primary-600 text-white' :
                          isCurrent ? 'border-2 border-primary-600 text-primary-600' :
                          'border-2 border-slate-300 text-slate-400'
                        }`}>
                          {isCompleted ? <CheckCircle2 className="h-3.5 w-3.5" /> : stepNumber}
                        </span>
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

      {/* Desktop horizontal rail (md and above) */}
      <ol role="list" className="hidden md:flex items-center gap-2">
        {selectedFlow.steps.map((step, index) => {
          const stepNumber = index + 1;
          const isCompleted = currentStep > stepNumber;
          const isCurrent = currentStep === stepNumber;
          const canJump = isCompleted;
          return (
            <li
              key={step.title}
              className={`relative flex flex-col min-w-0 ${index !== selectedFlow.steps.length - 1 ? 'flex-1' : ''}`}
            >
              <div className="flex items-center">
                <button
                  type="button"
                  disabled={!canJump}
                  aria-current={isCurrent ? 'step' : undefined}
                  onClick={() => canJump && onStepClick?.(stepNumber)}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 ${
                    isCompleted
                      ? 'bg-primary-600 text-white cursor-pointer hover:bg-primary-500'
                      : isCurrent
                      ? 'border-2 border-primary-600 bg-white text-primary-600 cursor-default'
                      : 'border-2 border-slate-300 bg-white text-slate-500 cursor-default'
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <span className="text-sm font-medium">{stepNumber}</span>
                  )}
                </button>
                {index !== selectedFlow.steps.length - 1 && (
                  <div
                    className={`h-1 mx-2 w-full rounded ${isCompleted ? 'bg-primary-600' : 'bg-slate-200'}`}
                  />
                )}
              </div>
              <div className="mt-2 text-xs font-semibold text-slate-600 truncate max-w-[120px]">
                {step.title}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
