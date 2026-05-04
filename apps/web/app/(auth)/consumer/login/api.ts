import { apiClient } from '@/lib/api-client';

export type OtpRequestResponse = { sent: true; devCode?: string };
export type OtpVerifyResponse = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; name: string | null; email: string | null; role: string };
  isNewUser: boolean;
};
export type ProfileCompleteResponse = {
  id: string;
  name: string | null;
  email: string | null;
  city: string | null;
  role: string;
};

export function requestOtp(phone: string) {
  return apiClient.post<OtpRequestResponse>('/auth/otp/request', { phone });
}

export function verifyOtp(phone: string, code: string) {
  return apiClient.post<OtpVerifyResponse>('/auth/otp/verify', { phone, code });
}

export function completeProfile(name: string, cityName?: string) {
  return apiClient.post<ProfileCompleteResponse>('/auth/profile/complete', {
    name,
    ...(cityName ? { cityName } : {}),
  });
}
