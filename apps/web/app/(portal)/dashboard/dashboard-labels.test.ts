// Node-env source-level guard tests (see jest.config.js testEnvironment:
// 'node' — no jsdom/@testing-library/react available, same constraint as
// components/consumer-ticket-board.test.ts). Pins the G1 labelling fix:
// (1) the consumer dashboard's wallet SummaryCard must not show two
//     unrelated-looking numbers ("Wallet balance" + a bare "Outstanding:"
//     hint) — it must derive its label from the sign of the balance and
//     phrase the hint as a component of that balance, not a second figure.
// (2) the portal dashboard's dead consumer-branch StatCards must not
//     hardcode "(PKR)" on a possibly-non-PKR consumer's own balance.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const consumerDashboardSource = readFileSync(
  join(here, '..', '..', '(consumer)', 'consumer', 'dashboard', 'page.tsx'),
  'utf8',
);
const portalDashboardSource = readFileSync(join(here, 'page.tsx'), 'utf8');

describe('consumer dashboard wallet SummaryCard (G1.1)', () => {
  it('labels the card by the sign of walletBalance, not a fixed "Wallet balance"', () => {
    expect(consumerDashboardSource).toMatch(
      /label=\{walletBalance < 0 \? 'Amount owed' : 'Wallet balance'\}/,
    );
  });

  it('never hardcodes a currency word — value goes through formatMoney(walletBalance, walletCurrency)', () => {
    expect(consumerDashboardSource).toMatch(/value=\{formatMoney\(walletBalance, walletCurrency\)\}/);
  });

  it('phrases the outstanding hint as part of the balance, not a bare "Outstanding:" second figure', () => {
    expect(consumerDashboardSource).not.toMatch(/`Outstanding: \$\{formatMoney/);
    expect(consumerDashboardSource).toMatch(/Includes \$\{formatMoney\(summary\.myOutstanding, walletCurrency\)\} in ticket dues/);
  });
});

describe('portal dashboard consumer-branch StatCards (G1.2)', () => {
  it('does not hardcode "(PKR)" on the Outstanding StatCard title', () => {
    expect(portalDashboardSource).not.toMatch(/title="Outstanding \(PKR\)"/);
    expect(portalDashboardSource).toMatch(/title="Outstanding"\s+value=\{summary\.myOutstanding/);
  });

  it('does not hardcode "(PKR)" on the Wallet Balance StatCard title', () => {
    expect(portalDashboardSource).not.toMatch(/title="Wallet Balance \(PKR\)"/);
    expect(portalDashboardSource).toMatch(/title="Wallet Balance"\s+value=\{summary\.myWalletBalance/);
  });

  it('still labels the genuinely-converted admin aggregate cards as PKR in the value, not the title', () => {
    // Sibling admin KPI cards (Total Revenue / Outstanding) embed "PKR" in
    // the value string for a real multi-currency-converted sum — this
    // pattern is untouched by the G1 fix and must not regress.
    expect(portalDashboardSource).toMatch(/title="Total Revenue"/);
    expect(portalDashboardSource).toMatch(/value=\{`PKR \$\{Number\(kpis\.totalRevenue\)\.toLocaleString\(\)\}`\}/);
  });
});
