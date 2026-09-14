import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Source-level guards for the batch-8 fixes that live in components.
 *
 * Web tests run as ESM with no jsdom, so components are asserted by reading
 * their source (the pattern consumer-ticket-board.test.ts established). Each
 * assertion below matches the real USAGE, never a bare identifier — a
 * `toContain('Foo')` is satisfied by the import line and so cannot fail on the
 * regression it exists to catch. All of these were mutation-proven.
 */
const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(join(here, p), 'utf8');

const repsBoard = read('../components/representatives-board.tsx');
const accountBoard = read('../components/user-account-board.tsx');
const walletBoard = read('../components/consumer-wallet-board.tsx');
const payPage = read('../app/(consumer)/consumer/tickets/[id]/pay/page.tsx');

describe('item 8 — payout Account Title survives a method change', () => {
  // batch-7 5.10 added an "Account Title" input to the JazzCash AND EasyPaisa
  // branches, but this handler (which predates it) cleared that same state key
  // for every non-bank method — blanking the field those branches exist to
  // collect, and wiping the loaded value when editing an existing rep.
  it('does NOT reset payoutAccountTitle when the method changes', () => {
    expect(repsBoard).not.toMatch(
      /payoutAccountTitle:\s*method === 'BANK_TRANSFER'\s*\?/,
    );
    expect(repsBoard).toMatch(/payoutAccountTitle:\s*c\.payoutAccountTitle,/);
  });

  it('still resets the rail-specific NUMBER fields', () => {
    // Those are genuinely per-rail and must not leak between methods.
    expect(repsBoard).toMatch(/payoutJazzCash:\s*method === 'JAZZ_CASH'\s*\?/);
    expect(repsBoard).toMatch(/payoutEasyPaisa:\s*method === 'EASY_PAISA'\s*\?/);
    expect(repsBoard).toMatch(/payoutBankName:\s*method === 'BANK_TRANSFER'\s*\?/);
  });
});

describe('item 9 — the phone error renders beside the phone field', () => {
  // It used to land in the single `formError` block at the BOTTOM of the form,
  // i.e. under the JazzCash box: "it gave us the error later".
  it('has a dedicated phoneError slot rendered inside the phone label', () => {
    expect(repsBoard).toMatch(/\{phoneError \?/);
    expect(repsBoard).toMatch(/\{phoneError\}<\/p>/);
  });

  it('validates as the consumer types, not only on submit', () => {
    expect(repsBoard).toMatch(/setPhoneError\(/);
    // The onChange handler must call the shared validator, not just store text.
    expect(repsBoard).toMatch(/onChange=\{\(e\) => \{[\s\S]{0,400}?validateLocalPhone\(/);
  });

  it('no longer routes phone validation into the generic formError', () => {
    expect(repsBoard).not.toMatch(/if \(phoneError\) return setFormError\(phoneError\)/);
  });
});

describe('item 3 — representatives board shows what each is owed', () => {
  it('fetches the per-representative earnings endpoint', () => {
    expect(repsBoard).toContain('/dashboard/representative-earnings');
  });

  it('renders a Payable column header', () => {
    expect(repsBoard).toMatch(/>Payable \(PKR\)</);
  });

  it('keeps representative money literal PKR, never formatStaffMoney', () => {
    // Payouts are domestic regardless of the consumer's billing currency —
    // running them through the staff FX formatter would be wrong. Match a
    // CALL, not the bare word: the file's own docblock mentions it by name.
    expect(repsBoard).not.toMatch(/formatStaffMoney\(/);
    expect(repsBoard).not.toMatch(/from '@wusuq\/shared'[\s\S]{0,200}formatStaffMoney/);
  });
});

describe('item 6 — account page converts ticket aggregates', () => {
  it('aggregates through sumMixedCurrencyToPkr rather than a raw sum', () => {
    expect(accountBoard).toMatch(/sumMixedCurrencyToPkr\(tickets\)/);
    expect(accountBoard).not.toMatch(
      /const billed = tickets\.reduce/,
    );
  });

  it('states the three cards in PKR, not the consumer’s own currency', () => {
    // The ticket row beneath them already renders a converted PKR figure; the
    // cards used to say "$15.00 (rate not set)" over the very rate it used.
    expect(accountBoard).toMatch(/title="Billed" value=\{formatStaffMoney\(billed, 'PKR'\)\}/);
    expect(accountBoard).toMatch(/title="Paid" value=\{formatStaffMoney\(paid, 'PKR'\)\}/);
    expect(accountBoard).toMatch(/title="Outstanding" value=\{formatStaffMoney\(due, 'PKR'\)\}/);
  });

  it('surfaces the exclusion count, honouring the exclude-and-count contract', () => {
    expect(accountBoard).toMatch(/\{unconvertedCount\}/);
    expect(accountBoard).toContain('FX rate not set');
  });

  it('keeps the wallet-credit chip in the consumer’s own currency', () => {
    // A wallet genuinely has no stamped rate, so "(rate not set)" is correct
    // there — only the TICKET aggregates were wrong.
    expect(accountBoard).toMatch(/formatStaffMoney\(account\.walletBalance, currency\)/);
  });
});

describe('item 5b — wallet copy no longer promises automatic settlement', () => {
  it('drops the sentence that contradicted the opt-in checkbox', () => {
    expect(walletBoard).not.toContain(
      'Funds are used automatically to settle new tickets on completion.',
    );
  });

  it('says the credit has not been deducted and names the opt-in', () => {
    expect(walletBoard).toContain('nothing has been deducted');
    expect(walletBoard).toContain('use my wallet balance');
  });

  it('labels the two halves of the net figure explicitly', () => {
    expect(walletBoard).toContain('credit added');
    expect(walletBoard).toContain('committed to unpaid tickets');
  });
});

describe('item 5 — the pay page can spend wallet credit', () => {
  it('offers the wallet path when credit and a due both exist', () => {
    expect(payPage).toMatch(/walletCredit > 0 && dueNow > 0/);
    expect(payPage).toContain('Pay from wallet balance');
  });

  it('posts to the targeted pay-ticket endpoint', () => {
    expect(payPage).toMatch(/\/wallet\/pay-ticket\/\$\{ticketId\}/);
  });

  it('does not demand a receipt on the wallet path', () => {
    // The mandatory-receipt rule (batch-7 2.1) evidences an EXTERNAL transfer;
    // there is none here. handlePayFromWallet must not touch receiptFile.
    const handler = payPage.slice(
      payPage.indexOf('const handlePayFromWallet'),
      payPage.indexOf('const handlePayLater'),
    );
    expect(handler.length).toBeGreaterThan(100);
    expect(handler).not.toContain('receiptFile');
  });

  it('still requires a receipt on the external-transfer path', () => {
    expect(payPage).toContain('Please attach your payment receipt before submitting.');
  });
});
