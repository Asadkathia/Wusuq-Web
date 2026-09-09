/**
 * The consumer's street address, captured as three named parts.
 *
 * Batch-7 1.4, verbatim: "Remove street address to House no. Town, Block" and
 * "Address Issue — there are 2 types of address: the profile address, and the
 * one at ticket-creation time."
 *
 * The two halves of collapsing that duplication:
 *   - the WIZARD's delivery address lost its Block / Main Area boxes (1.3),
 *     because the profile line already carries them;
 *   - the PROFILE line gains the structure, so what the wizard inherits is a
 *     real address rather than a free-text blob.
 *
 * `User.address` stays a single column — this composes to and parses from one
 * comma-separated line, so no migration and no data loss for the addresses
 * already stored. Anything that does not parse into three parts is treated as
 * a legacy free-text address and kept in `house`, exactly as
 * parseDeliveryAddress does for the wizard.
 */

export interface StreetAddressParts {
  house: string;
  town: string;
  block: string;
}

export const EMPTY_STREET_ADDRESS: StreetAddressParts = {
  house: '',
  town: '',
  block: '',
};

/** "H 12, Johar Town, Block R-1" -> parts. Legacy text lands in `house`. */
export function parseStreetAddress(value: string | null | undefined): StreetAddressParts {
  const raw = (value ?? '').trim();
  if (!raw) return { ...EMPTY_STREET_ADDRESS };

  // Review finding 15: this used to split ANY exactly-3-part string into
  // house/town/block. But "H 12, Johar Town, Lahore" is an extremely common
  // real address, and that guess puts the CITY into the "Block / sector /
  // street" box — the consumer then sees their city mislabelled and
  // "corrects" it, writing a wrong value back.
  //
  // A stored address is just a line; there is no marker distinguishing one we
  // composed from one someone typed, so ANY split is a guess. Don't guess:
  // keep the stored line whole in `house` (the field labelled for the street
  // line) and leave the other two blank for the consumer to fill in if they
  // want the finer structure. Lossless, and never mislabels.
  return { house: raw, town: '', block: '' };
}

/** Parts -> the single line stored on `User.address`. Blanks are dropped. */
export function formatStreetAddress(parts: StreetAddressParts): string {
  return [parts.house, parts.town, parts.block]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(', ');
}
