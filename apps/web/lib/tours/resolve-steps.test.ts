import { resolveSteps, tourSelector } from './resolve-steps';

const visible = (ids: string[]) => (t: string) => ids.includes(t);

describe('resolveSteps', () => {
  it('maps targets to data-tour selectors and keeps centred steps', () => {
    const r = resolveSteps(
      [{ title: 'Hi', body: 'b' }, { target: 'a', title: 'A', body: 'b' }],
      { isMobile: false, isVisible: visible(['a']) },
    );
    expect(r).toEqual({
      ok: true,
      steps: [
        { title: 'Hi', body: 'b' },
        { element: '[data-tour="a"]', title: 'A', body: 'b' },
      ],
    });
  });

  it('skips a missing optional step', () => {
    const r = resolveSteps([{ target: 'gone', optional: true, title: 'x', body: 'y' }], {
      isMobile: false,
      isVisible: visible([]),
    });
    expect(r).toEqual({ ok: true, steps: [] });
  });

  it('aborts on a missing required step, naming it', () => {
    const r = resolveSteps([{ target: 'gone', title: 'x', body: 'y' }], { isMobile: false, isVisible: visible([]) });
    expect(r).toEqual({ ok: false, missing: 'gone' });
  });

  it('uses mobileTarget on mobile', () => {
    const r = resolveSteps([{ target: 'desk', mobileTarget: 'mob', title: 'x', body: 'y' }], {
      isMobile: true,
      isVisible: visible(['mob']),
    });
    expect(r.ok && r.steps[0]?.element).toBe('[data-tour="mob"]');
  });

  it('falls back to a centred card on mobile when the desktop target is hidden and no mobileTarget', () => {
    const r = resolveSteps([{ target: 'desk', title: 'x', body: 'y' }], { isMobile: true, isVisible: visible([]) });
    expect(r).toEqual({ ok: true, steps: [{ title: 'x', body: 'y' }] });
  });

  it('builds attribute selectors', () => {
    expect(tourSelector('shell.sidebar')).toBe('[data-tour="shell.sidebar"]');
  });

  it('reports ok with zero steps as an abort-worthy empty tour', () => {
    const r = resolveSteps([], { isMobile: false, isVisible: visible([]) });
    expect(r).toEqual({ ok: true, steps: [] });
  });
});
