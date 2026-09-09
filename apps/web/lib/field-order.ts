/**
 * Order intake fields so the mandatory ones come first (batch-7 1.1).
 *
 * The client asked for this twice. V1, on Case Details:
 *   "I want to take the case title, judge designation and judge name above…
 *    take these three, the ones with the asterisk, up, and the ones that are
 *    not necessary, take them down."
 * V12, on the Supreme Court flow:
 *   "I requested you to bring the red ones to one side, the others separately."
 *
 * WHY THIS IS NOT A PLAIN SORT
 * A field gated by `showWhen` must never be promoted ABOVE the field that
 * gates it — the consumer would meet a required input before the question
 * that reveals it, which is the same "silently committed to a branch"
 * confusion batch-6 D1 fixed by hoisting `fir_mode`.
 *
 * So a required field is promoted only when its gate is NOT one of the fields
 * on this step (i.e. it was answered on an earlier step, like
 * `select_court_type` in Step 1). A field gated by a same-step field keeps its
 * declared position.
 *
 * The sort is STABLE (guaranteed since ES2019), so relative order inside each
 * group is exactly as declared.
 */

export interface OrderableField {
  key: string;
  showWhen?: { field: string } | undefined;
}

/**
 * @param fields       the step's fields, already filtered for rendering
 * @param isRequired   resolves the per-court-tier required flag for a field
 */
export function orderRequiredFirst<T extends OrderableField>(
  fields: T[],
  isRequired: (field: T) => boolean,
): T[] {
  const keysOnThisStep = new Set(fields.map((f) => f.key));
  const gatedBySameStep = (f: T): boolean =>
    Boolean(f.showWhen?.field && keysOnThisStep.has(f.showWhen.field));

  const promote = (f: T): boolean => isRequired(f) && !gatedBySameStep(f);

  // One stable partition, not a comparator — a comparator returning 0 for
  // equal ranks relies on sort stability anyway, and this reads plainly.
  const required: T[] = [];
  const rest: T[] = [];
  for (const f of fields) (promote(f) ? required : rest).push(f);
  return [...required, ...rest];
}
