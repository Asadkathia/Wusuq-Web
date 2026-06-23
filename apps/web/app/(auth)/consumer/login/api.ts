import { apiClient } from '@/lib/api-client';

export type OtpRequestResponse = { sent: true; devCode?: string };
export type OtpVerifyResponse = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; name: string | null; email: string | null; role: string };
  isNewUser: boolean;
};
import type { ConsumerKind } from '@wusuq/shared';

export type ProfileCompleteResponse = {
  id: string;
  name: string | null;
  email: string | null;
  city: string | null;
  role: string;
  consumerKind: ConsumerKind | null;
};

export function requestOtp(phone: string) {
  return apiClient.post<OtpRequestResponse>('/auth/otp/request', { phone });
}

export function verifyOtp(phone: string, code: string) {
  return apiClient.post<OtpVerifyResponse>('/auth/otp/verify', { phone, code });
}

export type ProfileCompleteParams = {
  name: string;
  cityName?: string;
  consumerKind?: ConsumerKind;
  address?: string;
  province?: string;
  district?: string;
  postalCode?: string;
  country?: string;
};

export function completeProfile(params: ProfileCompleteParams) {
  const { name, cityName, consumerKind, address, province, district, postalCode, country } = params;
  return apiClient.post<ProfileCompleteResponse>('/auth/profile/complete', {
    name,
    ...(cityName ? { cityName } : {}),
    ...(consumerKind ? { consumerKind } : {}),
    ...(address ? { address } : {}),
    ...(province ? { province } : {}),
    ...(district ? { district } : {}),
    ...(postalCode ? { postalCode } : {}),
    ...(country ? { country } : {}),
  });
}
