import { apiClient } from './api-client';

export interface InitiateResponse {
  paymentId: string;
  providerTxnId: string;
  redirectUrl: string;
}

export interface PaymentStatusResponse {
  id: string;
  status: 'INITIATED' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  ticketPaymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
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
};
