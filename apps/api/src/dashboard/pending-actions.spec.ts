import { DashboardService } from './dashboard.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Batch-9 §9 — client review finding.
 *
 * `dashboard.service.ts`'s `clerk_submitted` pending-action counts tickets
 * with `clerkApprovalStatus: 'SUBMITTED'` — no `status` filter at all. That
 * value is written ONLY by `submitClerkCosts` (tickets.service.ts), and only
 * in the same atomic update that advances the ticket to `WAITING_APPROVAL`
 * (`sendBackToClerk`/`reviewAndComplete` move it to REJECTED/VERIFIED and
 * never leave it SUBMITTED elsewhere). So every ticket the count includes is,
 * by construction, WAITING_APPROVAL — the deep link must point at the same
 * list `waiting_approval` points at, or the destination structurally cannot
 * contain any of the counted tickets. It used to point at
 * `/tickets/in-progress`, a status-disjoint list.
 */
describe('DashboardService.buildPendingActions — clerk_submitted deep link (§9)', () => {
  function callBuildPendingActions() {
    const prisma = {} as unknown as PrismaService;
    const service = new DashboardService(prisma);
    return (
      service as unknown as {
        buildPendingActions(input: {
          pendingVerifications: number;
          oldestPendingVerificationAt: Date | null | undefined;
          pendingTicketsCount: number;
          oldestPendingTicketAt: Date | null | undefined;
          waitingApprovalCount: number;
          oldestWaitingApprovalAt: Date | null | undefined;
          clerkSubmittedCount: number;
          stuckInProgressCount: number;
          agedOutstandingAmount: number;
        }): Array<{ key: string; deepLink: string; count: number }>;
      }
    ).buildPendingActions({
      pendingVerifications: 0,
      oldestPendingVerificationAt: null,
      pendingTicketsCount: 0,
      oldestPendingTicketAt: null,
      // Distinct, nonzero counts so a future accidental key/value swap
      // between the two actions would also be caught.
      waitingApprovalCount: 5,
      oldestWaitingApprovalAt: null,
      clerkSubmittedCount: 3,
      stuckInProgressCount: 0,
      agedOutstandingAmount: 0,
    });
  }

  it('sends clerk_submitted to the SAME list waiting_approval links to', () => {
    // The actual invariant: clerkApprovalStatus:'SUBMITTED' tickets are a
    // SUBSET of WAITING_APPROVAL tickets (see file-header note), so their
    // destination must be identical to the waiting_approval action's — not
    // an independently-hardcoded string that could drift from it.
    const actions = callBuildPendingActions();
    const clerkSubmitted = actions.find((a) => a.key === 'clerk_submitted');
    const waitingApproval = actions.find((a) => a.key === 'waiting_approval');
    expect(clerkSubmitted).toBeDefined();
    expect(waitingApproval).toBeDefined();
    expect(clerkSubmitted?.deepLink).toBe(waitingApproval?.deepLink);
  });

  it('pins the specific corrected route (regression: was /tickets/in-progress)', () => {
    const actions = callBuildPendingActions();
    const clerkSubmitted = actions.find((a) => a.key === 'clerk_submitted');
    expect(clerkSubmitted?.deepLink).toBe('/tickets/waiting-approval');
    expect(clerkSubmitted?.deepLink).not.toBe('/tickets/in-progress');
  });

  it('keeps each action counting its own input (no key/value crossover)', () => {
    const actions = callBuildPendingActions();
    expect(actions.find((a) => a.key === 'clerk_submitted')?.count).toBe(3);
    expect(actions.find((a) => a.key === 'waiting_approval')?.count).toBe(5);
  });
});
