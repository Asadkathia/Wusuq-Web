'use client';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { requestOtp, verifyOtp, completeProfile, type OtpVerifyResponse } from '../api';
import type { ConsumerKind } from '@wusuq/shared';
import { DEFAULT_COUNTRY_CODE, findCountry } from '@/lib/countries';

export type LoginStep = 'phone' | 'otp' | 'profile';

export function useLoginFlow() {
  const router = useRouter();
  const [step, setStep] = useState<LoginStep>('phone');
  // QA B9/B10: region picked alongside the phone input (McDonald's-style),
  // not locked to +92. The local phone digits are stored without the dial
  // prefix; the prefix is composed at request time from the selected
  // country's dial code.
  const [countryCode, setCountryCode] = useState<string>(DEFAULT_COUNTRY_CODE);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [cityName, setCityName] = useState('');
  const [consumerKind, setConsumerKind] = useState<ConsumerKind | null>(null);
  const [streetAddress, setStreetAddress] = useState('');
  const [province, setProvince] = useState('');
  const [provinceId, setProvinceId] = useState('');
  const [district, setDistrict] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function persist(tokens: OtpVerifyResponse) {
    try {
      localStorage.setItem('wusuq_access_token', tokens.accessToken);
      localStorage.setItem('wusuq_refresh_token', tokens.refreshToken);
      localStorage.setItem('wusuq_user', JSON.stringify(tokens.user));
    } catch {
      // localStorage unavailable
    }
  }

  const composedPhone = useCallback(() => {
    // Strip whitespace, dashes, parens, leading + and leading zero. Compose
    // an E.164-ish "+<dial><local>" so the backend OTP requester always sees
    // a fully-qualified number regardless of how the user typed it.
    const digits = phone.replace(/[\s\-()]/g, '').replace(/^\+/, '').replace(/^0+/, '');
    const dial = findCountry(countryCode).dial;
    // If the user already typed the dial code (e.g. "923001234567"), don't
    // double it up. Otherwise prepend.
    const local = digits.startsWith(dial) ? digits : `${dial}${digits}`;
    return `+${local}`;
  }, [phone, countryCode]);

  const sendOtp = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const r = await requestOtp(composedPhone());
      setDevCode(r.devCode);
      setOtp(r.devCode ?? '');
      setStep('otp');
    } catch (e) {
      const msg =
        (e as { response?: { error?: string; retryAfterSec?: number } })?.response?.error ??
        (e instanceof Error ? e.message : 'Failed to send code');
      setError(msg === 'too_many_requests' ? 'Too many requests. Try again shortly.' : msg);
    } finally {
      setLoading(false);
    }
  }, [composedPhone]);

  const submitOtp = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const r = await verifyOtp(composedPhone(), otp);
      persist(r);
      if (r.isNewUser) {
        setStep('profile');
      } else {
        router.replace('/consumer/dashboard');
      }
    } catch (e) {
      const msg = (e as { response?: { error?: string } })?.response?.error;
      if (msg === 'code_expired') setError('Code expired. Tap Resend.');
      else if (msg === 'too_many_attempts') setError('Too many wrong attempts. Tap Resend.');
      else setError('Wrong code. Try again.');
    } finally {
      setLoading(false);
    }
  }, [composedPhone, otp, router]);

  const submitProfile = useCallback(async () => {
    setError(null);
    setLoading(true);
    // Compose a single address string from street + district + province so the
    // User.address column gets a human-readable label; the structured fields
    // (province/district/postalCode) are stored separately.
    const composedAddress = [streetAddress, district, province].filter(Boolean).join(', ') || undefined;
    try {
      await completeProfile({
        name,
        cityName: cityName || undefined,
        consumerKind: consumerKind ?? undefined,
        address: composedAddress,
        province: province || undefined,
        district: district || undefined,
        postalCode: postalCode || undefined,
        // Country drives billing currency (server locks it once the account is active).
        country: countryCode || undefined,
      });
      try {
        const raw = localStorage.getItem('wusuq_user');
        if (raw) {
          const u = JSON.parse(raw) as Record<string, unknown>;
          u.name = name;
          if (cityName) u.city = cityName;
          if (consumerKind) u.consumerKind = consumerKind;
          localStorage.setItem('wusuq_user', JSON.stringify(u));
        }
      } catch {
        // localStorage unavailable
      }
    } catch {
      // Best-effort: even on failure, account exists; let the user into the dashboard.
    } finally {
      setLoading(false);
      router.replace('/consumer/dashboard');
    }
  }, [name, cityName, consumerKind, streetAddress, province, district, postalCode, countryCode, router]);

  const skipProfile = useCallback(() => {
    router.replace('/consumer/dashboard');
  }, [router]);

  const changePhone = useCallback(() => {
    setStep('phone');
    setOtp('');
    setError(null);
  }, []);

  return {
    step,
    countryCode, setCountryCode,
    phone, setPhone, otp, setOtp, name, setName, cityName, setCityName,
    consumerKind, setConsumerKind,
    streetAddress, setStreetAddress,
    province, setProvince,
    provinceId, setProvinceId,
    district, setDistrict,
    postalCode, setPostalCode,
    error, loading, devCode,
    sendOtp, submitOtp, submitProfile, skipProfile, changePhone,
  };
}
