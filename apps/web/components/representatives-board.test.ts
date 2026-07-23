// Node-env unit test (jest.config.js testEnvironment: 'node', no jsdom /
// Testing Library — see CLAUDE.md "Web tests run as ESM"). Component behavior
// is asserted at the source level, matching the pattern established by
// consumer-ticket-board.test.ts: read the file, assert on its contents.
//
// Covers two client-reported fixes:
//   J2 — "Federal Constitutional Court Paralegal Service" was missing from
//        the Add-Representative service list.
//   H4 — the Phone field should use the shared CountryPicker (dial-code
//        picker), matching the consumer signup form, instead of a bare text
//        input.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const currentDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(currentDir, 'representatives-board.tsx'), 'utf8');

describe('representatives-board (J2 — Federal Constitutional Court in service list)', () => {
  it('lists the Federal Constitutional Court Paralegal Service', () => {
    // Exact string match against the backend's seeded Service.name
    // (services.service.ts) — a typo here would silently desync the two.
    expect(source).toContain("'Federal Constitutional Court Paralegal Service'");
  });

  it('the FCC entry lives inside the SERVICES catalog array', () => {
    const servicesBlockMatch = source.match(/const SERVICES: ServiceEntry\[\] = \[([\s\S]*?)\];/);
    expect(servicesBlockMatch).not.toBeNull();
    expect(servicesBlockMatch![1]).toContain('Federal Constitutional Court Paralegal Service');
  });
});

describe('representatives-board (H4 — phone uses the shared CountryPicker)', () => {
  it('imports CountryPicker from the shared ui component', () => {
    expect(source).toMatch(/import\s*\{\s*CountryPicker\s*\}\s*from\s*'@\/components\/ui\/country-picker'/);
  });

  it('renders <CountryPicker in JSX (not just imported, actually used)', () => {
    expect(source).toMatch(/<CountryPicker\b/);
  });

  it('does not fall back to a bare textField(...) call for the phone input', () => {
    expect(source).not.toMatch(/textField\(\s*'Phone'/);
  });

  it('composes the dial code + local digits before sending phone to the API (mirrors signup)', () => {
    expect(source).toMatch(/function composePhone\(/);
    // Both the update (PATCH) and create (POST) payload builders must route
    // phone through the composer, not the raw form field — a single
    // `toMatch` would still pass if only one of the two call sites was
    // reverted, since it just needs ONE match anywhere in the file. Count
    // occurrences explicitly so both sites are required.
    const composedPhoneUses = source.match(/phone:\s*composedPhone\b/g) ?? [];
    expect(composedPhoneUses.length).toBe(2);
    // And the raw, uncomposed form field must never be sent directly as the
    // submit payload's phone (that would skip the dial-code prefix).
    expect(source).not.toMatch(/phone:\s*form\.phone\b/);
  });
});
