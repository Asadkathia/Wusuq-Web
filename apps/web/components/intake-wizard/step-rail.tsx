'use client';

import { CheckCircle2 } from 'lucide-react';
import type { IntakeFlow } from '@/lib/intake-flows';

type StepRailProps = {
  selectedFlow: IntakeFlow;
  currentStep: number;
};

export function StepRail({ selectedFlow, currentStep }: StepRailProps) {
  return (
    <nav aria-label="Progress">
      <ol role="list" className="flex items-center gap-2">
        {selectedFlow.steps.map((step, index) => {
          const stepNumber = index + 1;
          const isCompleted = currentStep > stepNumber;
          const isCurrent = currentStep === stepNumber;
          return (
            <li
              key={step.title}
              className={`relative flex flex-col min-w-0 ${index !== selectedFlow.steps.length - 1 ? 'flex-1' : ''}`}
            >
              <div className="flex items-center">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full ${
                    isCompleted
                      ? 'bg-primary-600 text-white'
                      : isCurrent
                      ? 'border-2 border-primary-600 bg-white text-primary-600'
                      : 'border-2 border-slate-300 bg-white text-slate-500'
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <span className="text-sm font-medium">{stepNumber}</span>
                  )}
                </span>
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
