import { apiClient } from './api-client';

export interface InitiateResponse {
  paymentId: string;
  providerTxnId: string;
  redirectUrl: string;
}

export interface PaymentStatusResponse {
  id: string;
  status: 'INITIATED' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
}

export interface PendingWalletTransaction {
  id: string;
  userId: string;
  amount: number;
  paymentMode: string;
  currency: string;
  status: string;
  type: 'TOPUP' | 'TICKET_PAYMENT' | 'TICKET_DEBIT' | 'ADMIN_ADJUSTMENT';
  ticketId?: string | null;
  receiptUrl?: string | null;
  createdAt: string;
  note?: string | null;
}

export interface WalletAdjustResponse {
  walletBalance: number;
}

export const paymentsClient = {
  initiate(ticketId: string) {
    return apiClient.post<InitiateResponse>('/payments/initiate', { ticketId });
  },
  getById(paymentId: string) {
    return apiClient.get<PaymentStatusResponse>(`/payments/${paymentId}`);
  },
  resolveMock(providerTxnId: string, outcome: 'SUCCESS' | 'FAILED' | 'CANCELLED') {
    return apiClient.post(`/payments/mock/${providerTxnId}/resolve`, { outcome });
  },

  // Admin wallet adjustment (POST /wallet/:userId/adjust)
  adjustWallet(
    userId: string,
    amount: number,
    note: string,
  ): Promise<WalletAdjustResponse> {
    return apiClient.post<WalletAdjustResponse>(`/wallet/${userId}/adjust`, {
      amount,
      note,
    });
  },

  // Approve a PENDING_VERIFICATION wallet transaction
  verifyTransaction(id: string, note?: string): Promise<unknown> {
    return apiClient.post(`/wallet/transactions/${id}/verify`, { note });
  },

  // Reject a PENDING_VERIFICATION wallet transaction
  rejectTransaction(id: string, note?: string): Promise<unknown> {
    return apiClient.post(`/wallet/transactions/${id}/reject`, { note });
  },

  // Admin: post phase-2 clerk charges and finalize the remainder
  finalizeRemainder(
    ticketId: string,
    charges: {
      attestedCharges?: number;
      nonAttestedCharges?: number;
      printingCharges?: number;
      deliveryCharges?: number;
      pdfCharges?: number;
    },
  ): Promise<unknown> {
    return apiClient.post(`/tickets/${ticketId}/finalize-remainder`, charges);
  },

  // Admin: bulk-assign multiple tickets to a representative
  assignBulk(dto: {
    ticketIds: string[];
    representativeId: string;
    forceAssign?: boolean;
  }): Promise<{ assigned: string[]; skipped: { ticketId: string; reason: string }[] }> {
    return apiClient.post('/tickets/assign-bulk', dto);
  },

  // Clerk: record next-hearing date (and optional type) on a ticket
  recordNextHearing(
    ticketId: string,
    dto: { scheduledDate: string; hearingType?: string },
  ): Promise<unknown> {
    return apiClient.post(`/tickets/${ticketId}/next-hearing`, dto);
  },

  // Admin: generate a new follow-up ticket from a completed ticket's next-hearing date
  generateNextHearing(ticketId: string): Promise<{ batchNo: string; id: string }> {
    return apiClient.post(`/tickets/${ticketId}/generate-next-hearing`, {});
  },

  // Admin: set any status bypassing the normal state machine (audited override)
  overrideStatus(ticketId: string, status: string): Promise<unknown> {
    return apiClient.patch(`/tickets/${ticketId}/status-override`, { status });
  },

  // Admin "Review & Complete": verify clerk receipt + finalize charges +
  // complete (+ auto-deliver digital) in one step.
  reviewAndComplete(
    ticketId: string,
    charges: {
      attestedCharges?: number;
      nonAttestedCharges?: number;
      printingCharges?: number;
      deliveryCharges?: number;
    },
  ): Promise<unknown> {
    return apiClient.post(`/tickets/${ticketId}/review-complete`, charges);
  },

  // Admin: send a ticket back to the clerk from review (with a reason).
  sendBackToClerk(ticketId: string, reason?: string): Promise<unknown> {
    return apiClient.post(`/tickets/${ticketId}/send-back`, { reason });
  },
};
