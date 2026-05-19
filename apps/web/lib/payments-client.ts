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
};
