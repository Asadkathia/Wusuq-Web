import type { KeyboardEvent } from 'react';

const SKIP_INPUT_TYPES = new Set([
  'submit',
  'button',
  'reset',
  'checkbox',
  'radio',
  'file',
  'range',
  'color',
]);

const FOCUSABLE_SELECTOR = [
  'input:not([disabled]):not([type="hidden"]):not([readonly])',
  'select:not([disabled])',
  'textarea:not([disabled]):not([readonly])',
].join(', ');

/**
 * Form-level Enter-to-next-field handler.
 *
 * Attach as `<form onKeyDown={advanceOnEnter}>`. When the user presses Enter
 * inside a single-line input, focus moves to the next focusable form control
 * instead of submitting. If the input is the last in the chain, the default
 * submit behavior is preserved. Textareas, selects, and non-text inputs are
 * left untouched.
 */
export function advanceOnEnter(event: KeyboardEvent<HTMLFormElement>) {
  if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }
  if (event.isDefaultPrevented()) return;

  const target = event.target as HTMLElement | null;
  if (!(target instanceof HTMLInputElement)) return;
  if (SKIP_INPUT_TYPES.has(target.type)) return;

  const form = event.currentTarget;
  const focusables = Array.from(
    form.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((el) => el.tabIndex !== -1 && el.offsetParent !== null);

  const idx = focusables.indexOf(target);
  if (idx === -1) return;

  const next = focusables[idx + 1];
  if (!next) return;

  event.preventDefault();
  next.focus();
  if (next instanceof HTMLInputElement && /^(text|email|tel|url|search|password|number)$/.test(next.type)) {
    next.select?.();
  }
}
