type Copy = { title: string; body: string };

export const notificationTemplates = {
  ticketCreatedForConsumer: (batchNo: string, serviceName: string): Copy => ({
    title: `Request submitted — ${batchNo}`,
    body: `Your ${serviceName} request is in the queue. We'll keep you posted as it progresses.`,
  }),
  ticketCreatedForAdmin: (batchNo: string, serviceName: string): Copy => ({
    title: `New ticket — ${batchNo}`,
    body: `A ${serviceName} request was submitted and is awaiting triage.`,
  }),
  ticketStatusForConsumer: (batchNo: string, to: string): Copy => ({
    title: `Update on ${batchNo}`,
    body: `Your request status is now ${to.replace(/_/g, ' ').toLowerCase()}.`,
  }),
  ticketStatusForAssignee: (batchNo: string, to: string): Copy => ({
    title: `Ticket ${batchNo} → ${to.replace(/_/g, ' ').toLowerCase()}`,
    body: `A ticket assigned to you changed status to ${to
      .replace(/_/g, ' ')
      .toLowerCase()}.`,
  }),
  ticketCompletedForConsumer: (batchNo: string, serviceName: string): Copy => ({
    title: `Service completed — ${batchNo}`,
    body: `${serviceName} has been completed. Log in to download your documents.`,
  }),
  ticketAssignedForAssignee: (batchNo: string, serviceName: string): Copy => ({
    title: `New assignment — ${batchNo}`,
    body: `You've been assigned a ${serviceName} ticket. Review and accept it.`,
  }),
  ticketReassignedForOldAssignee: (batchNo: string): Copy => ({
    title: `Assignment removed — ${batchNo}`,
    body: `Ticket ${batchNo} has been reassigned to another representative.`,
  }),
  ticketAssignmentAcceptedForAdmin: (batchNo: string): Copy => ({
    title: `Assignment accepted — ${batchNo}`,
    body: `The representative accepted ticket ${batchNo}.`,
  }),
  ticketAssignmentRejectedForAdmin: (batchNo: string, reason: string): Copy => ({
    title: `Assignment rejected — ${batchNo}`,
    body: `Ticket ${batchNo} was rejected by the representative: ${reason}`,
  }),
  ticketClerkCostsForBackOffice: (batchNo: string): Copy => ({
    title: `Costs submitted — ${batchNo}`,
    body: `Clerk costs for ticket ${batchNo} are ready for review.`,
  }),
  ticketClerkReceiptSubmittedForBackOffice: (batchNo: string): Copy => ({
    title: `Receipt submitted — ${batchNo}`,
    body: `A clerk receipt for ticket ${batchNo} is awaiting verification.`,
  }),
  ticketClerkReceiptDecidedForAssignee: (
    batchNo: string,
    decision: 'VERIFIED' | 'REJECTED',
  ): Copy => ({
    title: `Receipt ${decision.toLowerCase()} — ${batchNo}`,
    body:
      decision === 'VERIFIED'
        ? `Your receipt for ticket ${batchNo} was verified.`
        : `Your receipt for ticket ${batchNo} was rejected. Please resubmit.`,
  }),
  ticketDocumentUploadedForConsumer: (batchNo: string): Copy => ({
    title: `New document — ${batchNo}`,
    body: `A document is now available on your request ${batchNo}.`,
  }),
  ticketRegeneratedForConsumer: (batchNo: string): Copy => ({
    title: `Request regenerated — ${batchNo}`,
    body: `A new request ${batchNo} has been created from a previous one.`,
  }),
  paymentCompletedForConsumer: (batchNo: string): Copy => ({
    title: `Payment received — ${batchNo}`,
    body: `We've received your payment for ticket ${batchNo}. Thank you.`,
  }),
  paymentCompletedForFinance: (batchNo: string): Copy => ({
    title: `Payment received — ${batchNo}`,
    body: `Payment for ticket ${batchNo} has been confirmed.`,
  }),
  walletTopupCreatedForConsumer: (amount: number): Copy => ({
    title: `Top-up submitted`,
    body: `Your wallet top-up of PKR ${amount} is awaiting verification.`,
  }),
  walletTopupCreatedForFinance: (amount: number): Copy => ({
    title: `Top-up awaiting verification`,
    body: `A wallet top-up of PKR ${amount} needs review.`,
  }),
  walletTopupDecidedForConsumer: (
    amount: number,
    decision: 'VERIFIED' | 'REJECTED',
  ): Copy => ({
    title: decision === 'VERIFIED' ? `Top-up approved` : `Top-up rejected`,
    body:
      decision === 'VERIFIED'
        ? `Your wallet top-up of PKR ${amount} has been credited.`
        : `Your wallet top-up of PKR ${amount} was rejected.`,
  }),
  walletReceiptUploadedForFinance: (): Copy => ({
    title: `Wallet receipt uploaded`,
    body: `A consumer uploaded a wallet payment receipt for review.`,
  }),
  caseCreatedForConsumer: (caseRef: string): Copy => ({
    title: `Case opened — ${caseRef}`,
    body: `A case file ${caseRef} has been opened for you.`,
  }),
  caseStatusForConsumer: (caseRef: string, to: string): Copy => ({
    title: `Case ${caseRef} updated`,
    body: `Your case ${caseRef} status is now ${to.toLowerCase()}.`,
  }),
  caseDriftForAdmin: (caseRef: string): Copy => ({
    title: `Context drift — ${caseRef}`,
    body: `A completed ticket reported values that differ from case ${caseRef}.`,
  }),
  authPasswordChanged: (): Copy => ({
    title: `Password changed`,
    body: `Your account password was changed. If this wasn't you, contact support.`,
  }),
  authImpersonationStarted: (adminEmail: string): Copy => ({
    title: `Admin access to your account`,
    body: `An administrator (${adminEmail}) started a support session on your account.`,
  }),
};
