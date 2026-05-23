import { apiClient } from './api-client';

export interface PaymentSettings {
  id: string;
  bankName: string;
  accountTitle: string;
  accountNumber: string;
  iban?: string | null;
  instructions?: string | null;
  updatedAt: string;
  updatedByUserId?: string | null;
}

export interface UpdatePaymentSettingsPayload {
  bankName: string;
  accountTitle: string;
  accountNumber: string;
  iban?: string;
  instructions?: string;
}

export const paymentSettingsClient = {
  get(): Promise<PaymentSettings | null> {
    return apiClient.get<PaymentSettings | null>('/payment-settings');
  },

  update(payload: UpdatePaymentSettingsPayload): Promise<PaymentSettings> {
    return apiClient.put<PaymentSettings>('/payment-settings', payload);
  },
};
