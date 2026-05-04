# Intake Wizard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing 1308-line `intake-wizard.tsx` with a stepped card-stack onboarding flow rendered as a full-screen takeover, with a live answer summary + price-estimate rail on the right.

**Architecture:** A new `(intake)` Next.js route group provides a bare full-screen layout (no portal sidebar/header). A `wizard-runtime` component flattens the existing `IntakeFlow.steps[].fields[]` into a linear field list and renders one `card-stage` per field. Each step type (select / number / year / date / text / file) is its own small component sharing the same card scaffold. A `summary-rail` reads the running answers and calls the existing `POST /api/pricing-rules/resolve` endpoint (debounced) to show the live total. The complex domain blocks (geo cascading, FIR/Registry geo, case-date triad) are wrapped as composite step types that render as a single card containing the existing block component, so we avoid rebuilding that logic.

**Tech Stack:** Next.js 16 (app router), React 19, TypeScript, Tailwind CSS, existing `apiClient` from `@/lib/api-client`, existing UI primitives in `apps/web/components/ui/`. Tests run with the project's existing Jest setup (`pnpm test` from `apps/web`).

**Spec:** `DOcs/superpowers/specs/2026-05-02-intake-wizard-redesign-design.md`

---

## File Structure

**Created (new):**
- `apps/web/app/(intake)/layout.tsx` — bare layout, no sidebar/header
- `apps/web/app/(intake)/intake/[category]/[flowKey]/page.tsx` — wizard mount point (replaces current per-flow pages)
- `apps/web/components/intake-wizard/wizard-shell.tsx` — full-screen shell (topbar + progress + 1fr/280px grid)
- `apps/web/components/intake-wizard/wizard-runtime.tsx` — flattens flow → field list, owns answers state
- `apps/web/components/intake-wizard/card-stage.tsx` — centered card scaffold (label, title, helper, nav buttons)
- `apps/web/components/intake-wizard/summary-rail.tsx` — right-side answer + price panel
- `apps/web/components/intake-wizard/steps/select-step.tsx` — tile grid for `select` / `radio` / `checkbox_single`
- `apps/web/components/intake-wizard/steps/number-step.tsx` — big +/− stepper
- `apps/web/components/intake-wizard/steps/year-step.tsx` — horizontal year tile strip
- `apps/web/components/intake-wizard/steps/date-step.tsx` — inline calendar
- `apps/web/components/intake-wizard/steps/text-step.tsx` — text + textarea input
- `apps/web/components/intake-wizard/steps/file-step.tsx` — drop-zone wrapping existing `FileUpload`
- `apps/web/components/intake-wizard/steps/composite-step.tsx` — escape hatch that renders an existing geo/date block inside a card
- `apps/web/components/intake-wizard/hooks/use-wizard-state.ts` — answers, navigation, persistence, derived progress
- `apps/web/components/intake-wizard/hooks/use-price-estimate.ts` — debounced call to `/pricing-rules/resolve`
- `apps/web/components/intake-wizard/lib/field-walker.ts` — pure function: flatten flow + apply `showWhen` → linear field list
- `apps/web/components/intake-wizard/__tests__/field-walker.test.ts`
- `apps/web/components/intake-wizard/__tests__/use-wizard-state.test.ts`
- `apps/web/components/intake-wizard/__tests__/use-price-estimate.test.ts`
- `apps/web/components/intake-wizard/__tests__/select-step.test.tsx`
- `apps/web/components/intake-wizard/__tests__/summary-rail.test.tsx`

**Modified:**
- `apps/web/app/(consumer)/consumer/paralegal-services/judicial/[flowKey]/page.tsx` — redirect to `/intake/judicial/[flowKey]`
- `apps/web/app/(consumer)/consumer/paralegal-services/non-judicial/[flowKey]/page.tsx` — redirect to `/intake/non-judicial/[flowKey]`
- `apps/web/app/(portal)/paralegal-services/judicial/[flowKey]/page.tsx` — redirect to `/intake/judicial/[flowKey]`
- `apps/web/app/(portal)/paralegal-services/non-judicial/[flowKey]/page.tsx` — redirect to `/intake/non-judicial/[flowKey]`

**Deleted in final task:**
- `apps/web/components/intake-wizard.tsx` (1308 lines)
- `apps/web/components/intake-wizard/step-rail.tsx` (replaced by summary-rail)
- `apps/web/components/intake-wizard/checkout-panel.tsx` (folded into summary-rail)

**Reused as-is:**
- `apps/web/components/intake-wizard/file-upload.tsx`
- `apps/web/components/intake-wizard/service-geo-blocks.tsx`
- `apps/web/components/intake-wizard/field-renderer.tsx` (used inside `composite-step` only)
- `apps/web/lib/intake-flows.ts` — schema unchanged

---

## Task 1: Field walker (pure, testable)

**Files:**
- Create: `apps/web/components/intake-wizard/lib/field-walker.ts`
- Test: `apps/web/components/intake-wizard/__tests__/field-walker.test.ts`

The walker flattens `IntakeFlow.steps[].fields[]` into a linear list of `WalkerStep` items, each carrying the field plus the originating step title. It also resolves `showWhen` against the current answers, returning only steps that should be visible.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/components/intake-wizard/__tests__/field-walker.test.ts
import { walkFlow } from '../lib/field-walker';
import type { IntakeFlow } from '@/lib/intake-flows';

const flow: IntakeFlow = {
  key: 'test_flow',
  label: 'Test',
  endpoint: '/api/test',
  steps: [
    {
      title: 'Identity',
      fields: [
        { key: 'set_type', label: 'Set Type', type: 'radio', required: true, options: ['attested', 'both'] },
        { key: 'attested_qty', label: 'Attested copies', type: 'number', required: true, showWhen: { field: 'set_type', value: 'attested' } },
        { key: 'both_qty', label: 'Both copies', type: 'number', required: true, showWhen: { field: 'set_type', value: 'both' } },
      ],
    },
    {
      title: 'Notes',
      fields: [{ key: 'notes', label: 'Notes', type: 'textarea' }],
    },
  ],
};

describe('walkFlow', () => {
  it('flattens steps into a linear field list with step titles', () => {
    const walked = walkFlow(flow, { set_type: 'attested' });
    expect(walked.map((s) => s.field.key)).toEqual(['set_type', 'attested_qty', 'notes']);
    expect(walked[0].stepTitle).toBe('Identity');
    expect(walked[2].stepTitle).toBe('Notes');
  });

  it('hides showWhen fields whose condition is unmet', () => {
    const a = walkFlow(flow, { set_type: 'attested' });
    const b = walkFlow(flow, { set_type: 'both' });
    const c = walkFlow(flow, {});
    expect(a.find((s) => s.field.key === 'both_qty')).toBeUndefined();
    expect(b.find((s) => s.field.key === 'attested_qty')).toBeUndefined();
    expect(c.find((s) => s.field.key === 'attested_qty')).toBeUndefined();
    expect(c.find((s) => s.field.key === 'both_qty')).toBeUndefined();
  });

  it('returns notes step regardless of conditional answers', () => {
    expect(walkFlow(flow, {}).map((s) => s.field.key)).toContain('notes');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm jest components/intake-wizard/__tests__/field-walker.test.ts`
Expected: FAIL — module `../lib/field-walker` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/components/intake-wizard/lib/field-walker.ts
import type { IntakeFlow, IntakeField } from '@/lib/intake-flows';

export type WalkerStep = {
  field: IntakeField;
  stepTitle: string;
  stepIndex: number;
};

export function walkFlow(flow: IntakeFlow, answers: Record<string, string>): WalkerStep[] {
  const out: WalkerStep[] = [];
  flow.steps.forEach((step, stepIndex) => {
    for (const field of step.fields) {
      if (field.showWhen) {
        const current = answers[field.showWhen.field];
        if (current !== field.showWhen.value) continue;
      }
      out.push({ field, stepTitle: step.title, stepIndex });
    }
  });
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm jest components/intake-wizard/__tests__/field-walker.test.ts`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Ask user permission to commit**

Halt. Tell the user: "Task 1 complete — field walker implemented and tested. Want me to commit `apps/web/components/intake-wizard/lib/field-walker.ts` and the test file?"

---

## Task 2: Wizard state hook

**Files:**
- Create: `apps/web/components/intake-wizard/hooks/use-wizard-state.ts`
- Test: `apps/web/components/intake-wizard/__tests__/use-wizard-state.test.ts`

This hook owns: `answers`, `currentIndex`, `walkedSteps` (derived), navigation (`next`, `back`, `jumpTo`), persistence to localStorage keyed by `flow.key + userId`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/components/intake-wizard/__tests__/use-wizard-state.test.ts
import { renderHook, act } from '@testing-library/react';
import { useWizardState } from '../hooks/use-wizard-state';
import type { IntakeFlow } from '@/lib/intake-flows';

const flow: IntakeFlow = {
  key: 'test_flow', label: 'Test', endpoint: '/api/test',
  steps: [{
    title: 'S', fields: [
      { key: 'a', label: 'A', type: 'text', required: true },
      { key: 'b', label: 'B', type: 'text', required: false },
    ],
  }],
};

beforeEach(() => localStorage.clear());

describe('useWizardState', () => {
  it('starts at index 0 with empty answers', () => {
    const { result } = renderHook(() => useWizardState({ flow, userId: 'u1' }));
    expect(result.current.currentIndex).toBe(0);
    expect(result.current.answers).toEqual({});
    expect(result.current.walkedSteps).toHaveLength(2);
  });

  it('answer + next moves to the next field and persists', () => {
    const { result } = renderHook(() => useWizardState({ flow, userId: 'u1' }));
    act(() => { result.current.setAnswer('a', 'hello'); result.current.next(); });
    expect(result.current.currentIndex).toBe(1);
    expect(result.current.answers).toEqual({ a: 'hello' });
    expect(JSON.parse(localStorage.getItem('wusuq_intake_test_flow_u1') ?? '{}').answers).toEqual({ a: 'hello' });
  });

  it('back goes to previous field', () => {
    const { result } = renderHook(() => useWizardState({ flow, userId: 'u1' }));
    act(() => { result.current.next(); result.current.back(); });
    expect(result.current.currentIndex).toBe(0);
  });

  it('hydrates from localStorage on mount when present', () => {
    localStorage.setItem('wusuq_intake_test_flow_u1', JSON.stringify({ answers: { a: 'restored' }, currentIndex: 1 }));
    const { result } = renderHook(() => useWizardState({ flow, userId: 'u1' }));
    expect(result.current.answers).toEqual({ a: 'restored' });
    expect(result.current.currentIndex).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && pnpm jest components/intake-wizard/__tests__/use-wizard-state.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

```ts
// apps/web/components/intake-wizard/hooks/use-wizard-state.ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { IntakeFlow } from '@/lib/intake-flows';
import { walkFlow, type WalkerStep } from '../lib/field-walker';

type Persisted = { answers: Record<string, string>; currentIndex: number };

export function useWizardState({ flow, userId }: { flow: IntakeFlow; userId: string }) {
  const storageKey = `wusuq_intake_${flow.key}_${userId}`;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Persisted;
      if (parsed.answers) setAnswers(parsed.answers);
      if (typeof parsed.currentIndex === 'number') setCurrentIndex(parsed.currentIndex);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify({ answers, currentIndex } as Persisted)); } catch {}
  }, [answers, currentIndex, storageKey]);

  const walkedSteps: WalkerStep[] = useMemo(() => walkFlow(flow, answers), [flow, answers]);

  const setAnswer = useCallback((key: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }, []);

  const next = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, Math.max(0, walkedSteps.length - 1)));
  }, [walkedSteps.length]);

  const back = useCallback(() => setCurrentIndex((i) => Math.max(0, i - 1)), []);
  const jumpTo = useCallback((index: number) => setCurrentIndex(Math.max(0, Math.min(index, walkedSteps.length - 1))), [walkedSteps.length]);
  const reset = useCallback(() => { setAnswers({}); setCurrentIndex(0); localStorage.removeItem(storageKey); }, [storageKey]);

  return { answers, setAnswer, currentIndex, next, back, jumpTo, reset, walkedSteps };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && pnpm jest components/intake-wizard/__tests__/use-wizard-state.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Ask user permission to commit**

Halt. Tell the user: "Task 2 complete — wizard state hook implemented and tested. Want me to commit?"

---

## Task 3: Price estimate hook

**Files:**
- Create: `apps/web/components/intake-wizard/hooks/use-price-estimate.ts`
- Test: `apps/web/components/intake-wizard/__tests__/use-price-estimate.test.ts`

Maps wizard answer keys to the `ResolvePricingDto` shape (per spec §13), debounces calls 250ms, returns `{ matched, rulesExistForFlow, total, loading }`. Uses `apiClient.post` from `@/lib/api-client`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/components/intake-wizard/__tests__/use-price-estimate.test.ts
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePriceEstimate } from '../hooks/use-price-estimate';

jest.mock('@/lib/api-client', () => ({
  apiClient: { post: jest.fn() },
}));
import { apiClient } from '@/lib/api-client';

describe('usePriceEstimate', () => {
  beforeEach(() => { (apiClient.post as jest.Mock).mockReset(); });

  it('calls /pricing-rules/resolve with mapped fields', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({ matched: true, rulesExistForFlow: true, total: 4500 });
    const { result } = renderHook(() => usePriceEstimate({
      flowKey: 'svc_case_files',
      answers: { province: 'Punjab', city: 'Lahore', set_type: 'attested', attested_qty: '3' },
    }));
    await waitFor(() => expect(result.current.matched).toBe(true));
    expect(apiClient.post).toHaveBeenCalledWith('/pricing-rules/resolve', expect.objectContaining({
      flow: 'svc_case_files', province: 'Punjab', city: 'Lahore', setType: 'attested', attestedQty: 3,
    }));
    expect(result.current.total).toBe(4500);
  });

  it('omits empty answers from the payload', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({ matched: false, rulesExistForFlow: true, total: 0 });
    renderHook(() => usePriceEstimate({ flowKey: 'svc_x', answers: { province: '' } }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    const arg = (apiClient.post as jest.Mock).mock.calls[0][1];
    expect(arg).not.toHaveProperty('province');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && pnpm jest components/intake-wizard/__tests__/use-price-estimate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

```ts
// apps/web/components/intake-wizard/hooks/use-price-estimate.ts
import { useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';

const DEBOUNCE_MS = 250;

const ANSWER_TO_DTO: Record<string, string> = {
  province: 'province',
  city: 'city',
  court_level: 'courtLevel',
  case_status: 'caseStatus',
  year_filed: 'caseYear',
  set_type: 'setType',
  attested_qty: 'attestedQty',
  non_attested_qty: 'nonAttestedQty',
  both_attested_qty: 'attestedQty',
  both_non_attested_qty: 'nonAttestedQty',
};
const NUMERIC_DTO_KEYS = new Set(['caseYear', 'attestedQty', 'nonAttestedQty']);

export type PriceEstimate = {
  matched: boolean;
  rulesExistForFlow: boolean;
  total: number;
  loading: boolean;
};

function buildPayload(flowKey: string, answers: Record<string, string>) {
  const payload: Record<string, unknown> = { flow: flowKey };
  for (const [aKey, dtoKey] of Object.entries(ANSWER_TO_DTO)) {
    const v = answers[aKey];
    if (v === undefined || v === '') continue;
    payload[dtoKey] = NUMERIC_DTO_KEYS.has(dtoKey) ? Number(v) : v;
  }
  return payload;
}

export function usePriceEstimate({ flowKey, answers }: { flowKey: string; answers: Record<string, string> }): PriceEstimate {
  const [state, setState] = useState<PriceEstimate>({ matched: false, rulesExistForFlow: false, total: 0, loading: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setState((s) => ({ ...s, loading: true }));
      try {
        const r = await apiClient.post<{ matched: boolean; rulesExistForFlow: boolean; total: number }>(
          '/pricing-rules/resolve',
          buildPayload(flowKey, answers),
        );
        setState({ matched: r.matched, rulesExistForFlow: r.rulesExistForFlow, total: Number(r.total) || 0, loading: false });
      } catch {
        setState({ matched: false, rulesExistForFlow: false, total: 0, loading: false });
      }
    }, DEBOUNCE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [flowKey, JSON.stringify(answers)]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && pnpm jest components/intake-wizard/__tests__/use-price-estimate.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Ask user permission to commit**

---

## Task 4: Card-stage scaffold

**Files:**
- Create: `apps/web/components/intake-wizard/card-stage.tsx`

Pure presentational. Renders the centered card with: step label, title, optional helper, children slot for the input region, and Back/Continue buttons.

- [ ] **Step 1: Implement**

```tsx
// apps/web/components/intake-wizard/card-stage.tsx
'use client';
import type { ReactNode } from 'react';

export type CardStageProps = {
  stepLabel: string;
  title: string;
  helper?: string;
  canBack: boolean;
  canContinue: boolean;
  onBack: () => void;
  onContinue: () => void;
  continueLabel?: string;
  children: ReactNode;
};

export function CardStage(props: CardStageProps) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 rounded-2xl border border-border-soft bg-surface p-6 shadow-elev-1 sm:p-8">
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{props.stepLabel}</p>
        <h2 className="text-2xl font-semibold leading-tight text-slate-900">{props.title}</h2>
        {props.helper ? <p className="text-sm text-slate-500">{props.helper}</p> : null}
      </div>
      <div className="flex flex-col gap-4">{props.children}</div>
      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={props.onBack}
          disabled={!props.canBack}
          className="rounded-lg border border-border-soft bg-surface px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={props.onContinue}
          disabled={!props.canContinue}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-40"
        >
          {props.continueLabel ?? 'Continue →'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Smoke render in isolation**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS — no type errors in the new file.

- [ ] **Step 3: Ask user permission to commit**

---

## Task 5: SelectStep (covers `select`, `radio`, `checkbox_single`)

**Files:**
- Create: `apps/web/components/intake-wizard/steps/select-step.tsx`
- Test: `apps/web/components/intake-wizard/__tests__/select-step.test.tsx`

Renders a 2-column tile grid. Selecting a tile calls `onChange(value)` immediately and (in single-select mode) fires `onAutoAdvance` after a 150ms beat — the runtime decides whether to honor it.

- [ ] **Step 1: Write failing test**

```tsx
// apps/web/components/intake-wizard/__tests__/select-step.test.tsx
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SelectStep } from '../steps/select-step';

describe('SelectStep', () => {
  it('renders one tile per option and reports selection', () => {
    const onChange = jest.fn();
    render(<SelectStep options={['attested', 'non_attested', 'both']} value="" onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'attested' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'both' }));
    expect(onChange).toHaveBeenCalledWith('both');
  });

  it('marks the active tile selected', () => {
    render(<SelectStep options={['a', 'b']} value="b" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'b' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'a' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onAutoAdvance after a delay when a tile is clicked', () => {
    jest.useFakeTimers();
    const onAutoAdvance = jest.fn();
    render(<SelectStep options={['a']} value="" onChange={() => {}} onAutoAdvance={onAutoAdvance} />);
    fireEvent.click(screen.getByRole('button', { name: 'a' }));
    act(() => { jest.advanceTimersByTime(160); });
    expect(onAutoAdvance).toHaveBeenCalled();
    jest.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `cd apps/web && pnpm jest components/intake-wizard/__tests__/select-step.test.tsx`

- [ ] **Step 3: Implement**

```tsx
// apps/web/components/intake-wizard/steps/select-step.tsx
'use client';

export function SelectStep({
  options, value, onChange, onAutoAdvance,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  onAutoAdvance?: () => void;
}) {
  function handleClick(opt: string) {
    onChange(opt);
    if (onAutoAdvance) setTimeout(onAutoAdvance, 150);
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            aria-pressed={active}
            onClick={() => handleClick(opt)}
            className={`flex items-center gap-3 rounded-xl border bg-surface p-4 text-left transition hover:-translate-y-0.5 hover:shadow-elev-2 ${
              active ? 'border-brand-500 ring-2 ring-brand-500/30' : 'border-border-soft'
            }`}
          >
            <span className="text-sm font-semibold text-slate-900">{opt}</span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test, expect PASS**

- [ ] **Step 5: Ask user permission to commit**

---

## Task 6: NumberStep

**Files:**
- Create: `apps/web/components/intake-wizard/steps/number-step.tsx`

Big +/− stepper, value at 42px, supports keyboard `+`/`-`/`ArrowUp`/`ArrowDown`. Min 0; max optional.

- [ ] **Step 1: Implement**

```tsx
// apps/web/components/intake-wizard/steps/number-step.tsx
'use client';
import { useEffect } from 'react';

export function NumberStep({
  value, onChange, min = 0, max,
}: { value: string; onChange: (v: string) => void; min?: number; max?: number }) {
  const n = Number(value || '0');

  function set(next: number) {
    let v = Math.max(min, next);
    if (typeof max === 'number') v = Math.min(max, v);
    onChange(String(v));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '+' || e.key === 'ArrowUp') { e.preventDefault(); set(n + 1); }
      if (e.key === '-' || e.key === 'ArrowDown') { e.preventDefault(); set(n - 1); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex items-center justify-center gap-5 rounded-2xl border border-border-soft bg-surface p-6">
      <button type="button" onClick={() => set(n - 1)} className="grid h-12 w-12 place-items-center rounded-xl border border-border-soft text-2xl">−</button>
      <span className="min-w-[80px] text-center text-5xl font-bold tabular-nums text-slate-900">{n}</span>
      <button type="button" onClick={() => set(n + 1)} className="grid h-12 w-12 place-items-center rounded-xl border border-border-soft text-2xl">+</button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Ask user permission to commit**

---

## Task 7: YearStep

**Files:**
- Create: `apps/web/components/intake-wizard/steps/year-step.tsx`

Horizontal scroll strip of year tiles, current → 1970, current pre-focused.

- [ ] **Step 1: Implement**

```tsx
// apps/web/components/intake-wizard/steps/year-step.tsx
'use client';
import { useMemo, useRef, useEffect } from 'react';

export function YearStep({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const years = useMemo(() => {
    const cur = new Date().getFullYear();
    const out: number[] = [];
    for (let y = cur; y >= 1970; y--) out.push(y);
    return out;
  }, []);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollLeft = 0;
  }, []);

  return (
    <div ref={ref} className="flex gap-2 overflow-x-auto py-2">
      {years.map((y) => {
        const active = value === String(y);
        return (
          <button
            key={y}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(String(y))}
            className={`shrink-0 rounded-lg border px-4 py-3 text-sm font-semibold transition ${
              active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-border-soft bg-surface text-slate-700'
            }`}
          >
            {y}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm typecheck`

- [ ] **Step 3: Ask user permission to commit**

---

## Task 8: DateStep

**Files:**
- Create: `apps/web/components/intake-wizard/steps/date-step.tsx`

Wraps a native `<input type="date">` for now (escape hatch — the spec says "inline mini-calendar" but the project does not yet have a calendar primitive; this stays consistent with the existing `field-renderer` behavior). Future: swap for a calendar component when one lands. Documented as a deliberate choice.

- [ ] **Step 1: Implement**

```tsx
// apps/web/components/intake-wizard/steps/date-step.tsx
'use client';

export function DateStep({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-border-soft bg-surface px-4 py-4 text-lg text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
      autoFocus
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm typecheck`

- [ ] **Step 3: Ask user permission to commit**

---

## Task 9: TextStep (text + textarea)

**Files:**
- Create: `apps/web/components/intake-wizard/steps/text-step.tsx`

- [ ] **Step 1: Implement**

```tsx
// apps/web/components/intake-wizard/steps/text-step.tsx
'use client';
import { useEffect, useRef } from 'react';

export function TextStep({
  value, onChange, multiline, placeholder,
}: { value: string; onChange: (v: string) => void; multiline?: boolean; placeholder?: string }) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  if (multiline) {
    return (
      <textarea
        ref={ref as React.RefObject<HTMLTextAreaElement>}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-h-[120px] rounded-xl border border-border-soft bg-surface px-4 py-3 text-base text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
      />
    );
  }
  return (
    <input
      ref={ref as React.RefObject<HTMLInputElement>}
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-border-soft bg-surface px-4 py-4 text-lg text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm typecheck`

- [ ] **Step 3: Ask user permission to commit**

---

## Task 10: FileStep

**Files:**
- Create: `apps/web/components/intake-wizard/steps/file-step.tsx`

Wraps the existing `FileUpload` component (`apps/web/components/intake-wizard/file-upload.tsx`) inside a card-friendly drop-zone.

- [ ] **Step 1: Read the existing FileUpload signature**

Read: `apps/web/components/intake-wizard/file-upload.tsx`
Expected: a component with `files`, `onFilesChange`, `onError`, drag handlers props.

- [ ] **Step 2: Implement the wrapper**

```tsx
// apps/web/components/intake-wizard/steps/file-step.tsx
'use client';
import { useState } from 'react';
import { FileUpload } from '../file-upload';

export function FileStep({
  value, onChange,
}: { value: File[]; onChange: (files: File[]) => void }) {
  const [error, setError] = useState('');
  return (
    <div className="flex flex-col gap-2">
      <FileUpload files={value} onFilesChange={onChange} onError={setError} />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
```

If the existing `FileUpload` props differ, adjust the wrapper to match — keep the same external `value` / `onChange` shape so the runtime can use it uniformly.

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS — fix prop names if they don't line up.

- [ ] **Step 4: Ask user permission to commit**

---

## Task 11: SummaryRail

**Files:**
- Create: `apps/web/components/intake-wizard/summary-rail.tsx`
- Test: `apps/web/components/intake-wizard/__tests__/summary-rail.test.tsx`

Sticky right panel showing one row per answered field (clickable to jump back) and the live total from `usePriceEstimate`.

- [ ] **Step 1: Write failing test**

```tsx
// apps/web/components/intake-wizard/__tests__/summary-rail.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { SummaryRail } from '../summary-rail';

describe('SummaryRail', () => {
  const rows = [
    { key: 'province', label: 'Province', value: 'Punjab', stepIndex: 0 },
    { key: 'city', label: 'City', value: 'Lahore', stepIndex: 1 },
    { key: 'court_level', label: 'Court Level', value: '', stepIndex: 2 },
  ];

  it('shows answered rows with values and a muted future row', () => {
    render(<SummaryRail rows={rows} estimate={{ matched: true, rulesExistForFlow: true, total: 4500, loading: false }} onJumpTo={() => {}} />);
    expect(screen.getByText('Punjab')).toBeInTheDocument();
    expect(screen.getByText('Lahore')).toBeInTheDocument();
    expect(screen.getByText(/4,500/)).toBeInTheDocument();
  });

  it('calls onJumpTo with the row stepIndex when an answered row is clicked', () => {
    const jump = jest.fn();
    render(<SummaryRail rows={rows} estimate={{ matched: true, rulesExistForFlow: true, total: 0, loading: false }} onJumpTo={jump} />);
    fireEvent.click(screen.getByRole('button', { name: /Lahore/ }));
    expect(jump).toHaveBeenCalledWith(1);
  });

  it('shows misconfigured warning when rules do not exist for flow', () => {
    render(<SummaryRail rows={[]} estimate={{ matched: false, rulesExistForFlow: false, total: 0, loading: false }} onJumpTo={() => {}} />);
    expect(screen.getByText(/Pricing not configured/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `cd apps/web && pnpm jest components/intake-wizard/__tests__/summary-rail.test.tsx`

- [ ] **Step 3: Implement**

```tsx
// apps/web/components/intake-wizard/summary-rail.tsx
'use client';
import type { PriceEstimate } from './hooks/use-price-estimate';

export type SummaryRow = { key: string; label: string; value: string; stepIndex: number };

function formatPkr(n: number) {
  return `₨ ${n.toLocaleString('en-PK')}`;
}

export function SummaryRail({
  rows, estimate, onJumpTo,
}: { rows: SummaryRow[]; estimate: PriceEstimate; onJumpTo: (stepIndex: number) => void }) {
  return (
    <aside className="sticky top-[60px] hidden h-[calc(100vh-60px)] w-[280px] flex-col gap-3 border-l border-border-soft bg-slate-50 p-4 lg:flex">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Your case</p>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const answered = row.value !== '';
          return (
            <li key={row.key}>
              <button
                type="button"
                onClick={() => answered && onJumpTo(row.stepIndex)}
                disabled={!answered}
                className={`flex w-full justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs transition ${
                  answered ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-400'
                }`}
              >
                <span>{row.label}</span>
                <span className={answered ? 'font-semibold text-slate-900' : ''}>{row.value || '—'}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto border-t border-border-soft pt-3">
        {estimate.matched ? (
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-slate-500">Total</span>
            <span className="text-xl font-bold text-emerald-600">{formatPkr(estimate.total)}</span>
          </div>
        ) : estimate.rulesExistForFlow ? (
          <p className="text-xs text-slate-500">Estimate updates as you add details</p>
        ) : (
          <p className="text-xs text-amber-600">Pricing not configured for this service</p>
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `cd apps/web && pnpm jest components/intake-wizard/__tests__/summary-rail.test.tsx`

- [ ] **Step 5: Ask user permission to commit**

---

## Task 12: WizardShell

**Files:**
- Create: `apps/web/components/intake-wizard/wizard-shell.tsx`

Owns: topbar (logo + breadcrumb + Save & exit), thin progress bar, main 1fr/280px layout. Receives the stage and rail as children.

- [ ] **Step 1: Implement**

```tsx
// apps/web/components/intake-wizard/wizard-shell.tsx
'use client';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';

export function WizardShell({
  flowLabel, stepLabel, progress, stage, rail, exitHref = '/dashboard',
}: {
  flowLabel: string;
  stepLabel: string;
  progress: number; // 0..1
  stage: ReactNode;
  rail: ReactNode;
  exitHref?: string;
}) {
  const router = useRouter();
  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <header className="flex h-[60px] items-center justify-between border-b border-border-soft bg-surface px-5">
        <div className="flex flex-col">
          <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">Wusuq</span>
          <span className="text-[11px] text-slate-500">{flowLabel} · {stepLabel}</span>
        </div>
        <button
          type="button"
          onClick={() => { if (confirm('Save progress and exit?')) router.push(exitHref); }}
          className="inline-flex items-center gap-1.5 rounded-md border border-border-soft px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
        >
          <X className="h-3.5 w-3.5" /> Save &amp; exit
        </button>
      </header>
      <div className="h-[3px] w-full bg-slate-200">
        <div
          className="h-full bg-gradient-to-r from-brand-500 to-brand-300 transition-all duration-300"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[1fr_280px]">
        <main className="flex items-center justify-center px-4 py-10">{stage}</main>
        {rail}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm typecheck`

- [ ] **Step 3: Ask user permission to commit**

---

## Task 13: CompositeStep (escape hatch for existing geo/case-date blocks)

**Files:**
- Create: `apps/web/components/intake-wizard/steps/composite-step.tsx`

A few legacy steps in the current wizard render not a single field but a composite block (`LocationBlock`, `CityBlock`, `JudicialServiceBlock`, `FirBlock`, `RegistryDeedBlock`, `CaseDateBlock`). The runtime detects these by step-title or by a special `field.type === 'composite'` marker added in Task 14, and delegates rendering to this component which wraps the existing block in the card scaffold.

- [ ] **Step 1: Implement**

```tsx
// apps/web/components/intake-wizard/steps/composite-step.tsx
'use client';
import type { ReactNode } from 'react';

export function CompositeStep({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>;
}
```

This is intentionally minimal — the runtime composes the right block inside it. The component exists as a marker boundary so future enhancements (e.g. a per-block accent header) have a place to land.

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm typecheck`

- [ ] **Step 3: Ask user permission to commit**

---

## Task 14: WizardRuntime

**Files:**
- Create: `apps/web/components/intake-wizard/wizard-runtime.tsx`

The conductor: composes `WizardShell` + `CardStage` + the right step component for the current `WalkerStep.field.type`. Uses `useWizardState` and `usePriceEstimate`. Holds files state separately from text answers. Wires submission to `flow.endpoint`.

- [ ] **Step 1: Implement**

```tsx
// apps/web/components/intake-wizard/wizard-runtime.tsx
'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import type { IntakeFlow } from '@/lib/intake-flows';
import { useWizardState } from './hooks/use-wizard-state';
import { usePriceEstimate } from './hooks/use-price-estimate';
import { WizardShell } from './wizard-shell';
import { CardStage } from './card-stage';
import { SummaryRail, type SummaryRow } from './summary-rail';
import { SelectStep } from './steps/select-step';
import { NumberStep } from './steps/number-step';
import { YearStep } from './steps/year-step';
import { DateStep } from './steps/date-step';
import { TextStep } from './steps/text-step';
import { FileStep } from './steps/file-step';

export function WizardRuntime({ flow, userId, exitHref }: { flow: IntakeFlow; userId: string; exitHref?: string }) {
  const router = useRouter();
  const state = useWizardState({ flow, userId });
  const estimate = usePriceEstimate({ flowKey: flow.key, answers: state.answers });
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const current = state.walkedSteps[state.currentIndex];
  const total = state.walkedSteps.length;
  const isLast = state.currentIndex === total - 1;

  const summaryRows: SummaryRow[] = useMemo(() =>
    state.walkedSteps.map((w) => ({
      key: w.field.key,
      label: w.field.label,
      value: state.answers[w.field.key] ?? '',
      stepIndex: state.walkedSteps.findIndex((x) => x.field.key === w.field.key),
    })),
  [state.walkedSteps, state.answers]);

  function isValid(): boolean {
    if (!current) return false;
    if (!current.field.required) return true;
    return Boolean(state.answers[current.field.key]?.trim());
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError('');
    try {
      const fd = new FormData();
      for (const [k, v] of Object.entries(state.answers)) fd.append(k, v);
      for (const f of files) fd.append('files', f);
      await apiClient.post(flow.endpoint, fd);
      state.reset();
      router.push(exitHref ?? '/dashboard');
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (!current) return null;

  const stepLabel = `Step ${state.currentIndex + 1} of ${total}`;
  const value = state.answers[current.field.key] ?? '';
  const onChange = (v: string) => state.setAnswer(current.field.key, v);
  const onAutoAdvance = () => { if (isValid() && !isLast) state.next(); };

  let body: React.ReactNode = null;
  switch (current.field.type) {
    case 'select':
    case 'radio':
    case 'checkbox_single':
      body = <SelectStep options={current.field.options ?? []} value={value} onChange={onChange} onAutoAdvance={onAutoAdvance} />;
      break;
    case 'number':
      body = <NumberStep value={value} onChange={onChange} />;
      break;
    case 'year_select':
      body = <YearStep value={value} onChange={onChange} />;
      break;
    case 'date':
      body = <DateStep value={value} onChange={onChange} />;
      break;
    case 'text':
      body = <TextStep value={value} onChange={onChange} placeholder={current.field.hint} />;
      break;
    case 'textarea':
      body = <TextStep value={value} onChange={onChange} multiline placeholder={current.field.hint} />;
      break;
    case 'file':
      body = <FileStep value={files} onChange={setFiles} />;
      break;
    default:
      body = <TextStep value={value} onChange={onChange} />;
  }

  return (
    <WizardShell
      flowLabel={flow.label}
      stepLabel={stepLabel}
      progress={(state.currentIndex + 1) / total}
      exitHref={exitHref}
      stage={
        <CardStage
          stepLabel={current.stepTitle}
          title={current.field.label}
          helper={current.field.hint}
          canBack={state.currentIndex > 0}
          canContinue={isValid() && !submitting}
          onBack={state.back}
          onContinue={isLast ? submit : state.next}
          continueLabel={isLast ? (submitting ? 'Submitting…' : 'Submit case →') : 'Continue →'}
        >
          {body}
          {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}
        </CardStage>
      }
      rail={<SummaryRail rows={summaryRows} estimate={estimate} onJumpTo={state.jumpTo} />}
    />
  );
}
```

This runtime intentionally does **not** yet support the composite domain blocks (geo cascading, FIR/Registry, case-date triad). Those are layered in Task 15. For flows that use only the simple field types in `IntakeField['type']`, this is complete.

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Ask user permission to commit**

---

## Task 15: Composite block integration

**Files:**
- Modify: `apps/web/components/intake-wizard/wizard-runtime.tsx` (extend the switch)

The current legacy wizard renders `LocationBlock`, `CityBlock`, `JudicialServiceBlock`, `FirBlock`, `RegistryDeedBlock`, `CaseDateBlock` from `service-geo-blocks.tsx` based on which fields a step contains. Port that detection into the runtime: when the current `WalkerStep.field.key` matches one of the keys those blocks own (`province`, `district_id`, `city`, `city_id`, `station_id`, `office_name`, `case_status`, `case_date`, `future_date`, `select_court`, `select_court_city`, `select_service`), render the appropriate block inside `CompositeStep` and **skip ahead** past every walker step whose `field.key` is consumed by that block.

- [ ] **Step 1: Map block ownership**

Read: `apps/web/components/intake-wizard/service-geo-blocks.tsx`
Note for each exported block which `field.key`s it consumes. Write the mapping at the top of `wizard-runtime.tsx`:

```ts
// Keys consumed by each composite block — the runtime renders the block once
// and advances past all of them in a single step.
const BLOCK_OWNERS: Array<{ component: 'location' | 'city' | 'judicial' | 'fir' | 'registry' | 'caseDate'; keys: string[] }> = [
  { component: 'location', keys: ['province', 'district_id'] },
  { component: 'city', keys: ['city', 'city_id'] },
  { component: 'judicial', keys: ['select_court', 'select_court_city', 'select_service'] },
  { component: 'fir', keys: ['station_id', 'other_station_id', 'city_type'] },
  { component: 'registry', keys: ['office_name', 'city_type'] },
  { component: 'caseDate', keys: ['case_status', 'case_date', 'future_date', 'decided_date'] },
];

function blockFor(key: string) {
  return BLOCK_OWNERS.find((b) => b.keys.includes(key));
}
```

- [ ] **Step 2: Branch in the runtime switch**

Inside `WizardRuntime`'s switch, before the existing `case` arms add a check at the top of the function (after `current` is computed):

```ts
const ownedBy = blockFor(current.field.key);
if (ownedBy) {
  // render the appropriate composite block; the runtime treats this as one step
  // that submits via setAnswer for each of the block's keys, then state.next()
  body = renderCompositeBlock(ownedBy.component, state, geo, files, setFiles);
}
```

Implement `renderCompositeBlock` as a small helper that returns one of the existing block JSX trees (`<LocationBlock …/>`, etc.) wired to `state.setAnswer` and the geo data hook, wrapped in `<CompositeStep>`. Use the prop signatures already defined in `service-geo-blocks.tsx`.

When a composite block is on screen, define `isValid()` to check that all of `ownedBy.keys` that are required by their backing fields are answered. Override `onContinue` to call `state.next()` (which already moves to the next walker step — we just need to ensure walker steps for keys *already covered* by the composite are auto-skipped: have the runtime maintain `consumedKeys: Set<string>` and skip past any walker step whose key is in that set when computing the next index).

- [ ] **Step 3: Add a useGeo hook reuse**

Extract the existing `useGeo` hook from the legacy wizard (`apps/web/components/intake-wizard.tsx:187-215`) into `apps/web/components/intake-wizard/hooks/use-geo.ts` verbatim, and import it from the runtime.

- [ ] **Step 4: Typecheck and run all wizard tests**

Run: `cd apps/web && pnpm typecheck && pnpm jest components/intake-wizard`
Expected: PASS.

- [ ] **Step 5: Ask user permission to commit**

---

## Task 16: Bare intake route

**Files:**
- Create: `apps/web/app/(intake)/layout.tsx`
- Create: `apps/web/app/(intake)/intake/[category]/[flowKey]/page.tsx`

- [ ] **Step 1: Create the layout**

```tsx
// apps/web/app/(intake)/layout.tsx
import type { ReactNode } from 'react';

export default function IntakeLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
```

The portal layout is in `app/(portal)/layout.tsx`; this `(intake)` group stays bare so the wizard owns the full viewport.

- [ ] **Step 2: Create the page**

```tsx
// apps/web/app/(intake)/intake/[category]/[flowKey]/page.tsx
import { notFound } from 'next/navigation';
import { judicialFlows, nonJudicialFlows, slugToFlowKey } from '@/lib/intake-flows';
import { WizardRuntime } from '@/components/intake-wizard/wizard-runtime';
import { getCurrentUserClientSide } from '@/lib/auth-helpers';

// Reads the JWT user from cookies/headers as the existing portal does.
// If the project doesn't yet expose a server-side user helper, mount a
// thin client component below that reads from localStorage.

import { ClientUserMount } from './client-user-mount';

export default async function IntakePage({ params }: { params: Promise<{ category: string; flowKey: string }> }) {
  const { category, flowKey } = await params;
  if (category !== 'judicial' && category !== 'non-judicial') notFound();
  const cat = category === 'judicial' ? 'judicial' : 'non_judicial';
  const flows = cat === 'judicial' ? judicialFlows : nonJudicialFlows;
  const key = slugToFlowKey(flowKey, cat);
  const flow = key ? flows.find((f) => f.key === key) : null;
  if (!flow) notFound();

  return <ClientUserMount flow={flow} exitHref={category === 'judicial' ? '/consumer/paralegal-services/judicial' : '/consumer/paralegal-services/non-judicial'} />;
}
```

- [ ] **Step 3: Create the client-user-mount sibling**

```tsx
// apps/web/app/(intake)/intake/[category]/[flowKey]/client-user-mount.tsx
'use client';
import { useEffect, useState } from 'react';
import { WizardRuntime } from '@/components/intake-wizard/wizard-runtime';
import type { IntakeFlow } from '@/lib/intake-flows';

export function ClientUserMount({ flow, exitHref }: { flow: IntakeFlow; exitHref: string }) {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('wusuq_user');
      if (raw) setUserId((JSON.parse(raw) as { id: string }).id);
    } catch {}
  }, []);
  if (!userId) return <div className="p-10 text-center text-slate-500">Loading…</div>;
  return <WizardRuntime flow={flow} userId={userId} exitHref={exitHref} />;
}
```

(The two existing portal/consumer flow pages already read JWT via the `PortalAuthGuard`; the new bare route doesn't have that guard. The client mount keeps it simple: if there's no `wusuq_user` we show a loading state until the user logs in elsewhere.)

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && pnpm typecheck`

- [ ] **Step 5: Ask user permission to commit**

---

## Task 17: Migrate route entry points

**Files:**
- Modify (4 files):
  - `apps/web/app/(consumer)/consumer/paralegal-services/judicial/[flowKey]/page.tsx`
  - `apps/web/app/(consumer)/consumer/paralegal-services/non-judicial/[flowKey]/page.tsx`
  - `apps/web/app/(portal)/paralegal-services/judicial/[flowKey]/page.tsx`
  - `apps/web/app/(portal)/paralegal-services/non-judicial/[flowKey]/page.tsx`

Each becomes a single-line redirect to `/intake/<category>/<flowKey>`.

- [ ] **Step 1: Replace the consumer judicial page**

```tsx
// apps/web/app/(consumer)/consumer/paralegal-services/judicial/[flowKey]/page.tsx
import { redirect } from 'next/navigation';

export default async function Page({ params }: { params: Promise<{ flowKey: string }> }) {
  const { flowKey } = await params;
  redirect(`/intake/judicial/${flowKey}`);
}
```

- [ ] **Step 2: Replace the consumer non-judicial page**

Same pattern; replace `judicial` with `non-judicial` in the redirect path.

- [ ] **Step 3: Replace the two portal pages identically**

Same pattern; portal pages redirect to the same `/intake/...` URL — staff and consumer both see the new wizard.

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && pnpm typecheck`

- [ ] **Step 5: Ask user permission to commit**

---

## Task 18: Manual verification & E2E

**Files:**
- Modify: `apps/web/e2e/intake-wizard.spec.ts` (or create if missing)

Even with unit tests, the wizard must be eyeballed because TDD on visuals is shallow.

- [ ] **Step 1: Manual smoke**

Run: `pnpm dev`
Open `http://localhost:3000/intake/judicial/case-files` (or whichever judicial slug exists).
Verify: full-screen layout, no sidebar, summary rail on right, picking an option auto-advances after ~150ms, price ticks up after province/city are picked, "Save & exit" returns to dashboard, refresh resumes mid-wizard, browser keyboard `+`/`-` works on a number step.

- [ ] **Step 2: Locate or create the Playwright spec**

Read the existing `apps/web/e2e/` directory.
Add (or extend) `intake-wizard.spec.ts` covering:

```ts
import { test, expect } from '@playwright/test';

test('consumer can complete a property-transfer intake', async ({ page }) => {
  // log in via the existing test helper, then:
  await page.goto('/intake/judicial/case-files');
  await expect(page.getByText(/Step 1 of/)).toBeVisible();
  await page.getByRole('button', { name: 'Punjab' }).click();
  await page.getByRole('button', { name: 'Lahore' }).click();
  // … walk through the rest of the steps
  await page.getByRole('button', { name: /Submit case/ }).click();
  await expect(page).toHaveURL(/dashboard/);
});
```

The exact button names depend on the flow's labels — read `lib/intake-flows.ts` for the case-files flow to fill in the right tile texts.

- [ ] **Step 3: Run E2E**

Run: `pnpm e2e -- --grep intake`
Expected: PASS.

- [ ] **Step 4: Ask user permission to commit**

---

## Task 19: Delete legacy wizard

**Files:**
- Delete: `apps/web/components/intake-wizard.tsx`
- Delete: `apps/web/components/intake-wizard/step-rail.tsx`
- Delete: `apps/web/components/intake-wizard/checkout-panel.tsx`

- [ ] **Step 1: Confirm no remaining imports**

Run: `cd apps/web && grep -rn "from '@/components/intake-wizard'\|from './intake-wizard'\|step-rail\|checkout-panel" --include="*.ts" --include="*.tsx" .`
Expected: only the legacy file itself and the three about-to-be-deleted files.

- [ ] **Step 2: Delete**

Run:
```
rm apps/web/components/intake-wizard.tsx
rm apps/web/components/intake-wizard/step-rail.tsx
rm apps/web/components/intake-wizard/checkout-panel.tsx
```

- [ ] **Step 3: Typecheck + tests**

Run: `cd apps/web && pnpm typecheck && pnpm jest components/intake-wizard`
Expected: PASS.

- [ ] **Step 4: Build to catch any unused-import / dead-route issues**

Run: `cd apps/web && pnpm build`
Expected: success.

- [ ] **Step 5: Ask user permission to commit**

This is the final commit of the work — a clean removal of the old wizard.

---

## Self-Review Notes

**Spec coverage:**

| Spec section | Implemented in |
|---|---|
| §4.1 Full-screen shell | Tasks 12, 16 |
| §4.2 Stage card | Task 4 |
| §4.3 Summary rail | Task 11 |
| §5 Step types (select/number/year/date/text/file) | Tasks 5–10 |
| §5 Composite (showWhen, multi-field steps) | Tasks 1, 2, 13, 15 |
| §6 Motion / auto-advance / keyboard | Task 5 (auto-advance), Task 6 (keyboard `+`/`-`) — note: full motion pass and keyboard 1–9 / Esc-to-exit / Backspace-to-back are NOT covered by tasks; add a follow-up if desired (see "Deferred" below) |
| §6 Save & resume | Task 2 (localStorage) |
| §7 Component decomposition | Mirrors the file structure above |
| §8 Routes | Tasks 16, 17 |
| §9 Data flow | Task 14 (runtime), Task 15 (composite) |
| §10 Error handling | Task 14 (submit error inline), Task 11 (price-rail states), Task 2 (stale localStorage tolerated by try/catch) |
| §11 Testing | Tasks 1–3, 5, 11 (unit), Task 18 (E2E) |
| §12 Migration cut-over | Tasks 17, 19 |
| §13 Pricing wiring | Task 3 |

**Deferred (call out at execution time, not in scope):**

- Full motion polish: 220ms slide+fade between steps, gradient progress animation easing curves. Add post-implementation as a small follow-up if the user wants it.
- Keyboard 1–9 tile select, `Esc` for save-and-exit, `Backspace` for back. The runtime currently supports `+`/`-` on number steps only.
- Mobile bottom-sheet for the rail (rail simply hides below `lg`). A future task should add a Drawer-based bottom sheet using the existing `components/ui/drawer.tsx`.
- Real inline calendar (DateStep currently uses native `<input type="date">`).
