'use client';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { requestOtp, verifyOtp, completeProfile, type OtpVerifyResponse } from '../api';
import type { ConsumerKind } from '@wusuq/shared';

export type LoginStep = 'phone' | 'otp' | 'profile';

export function useLoginFlow() {
  const router = useRouter();
  const [step, setStep] = useState<LoginStep>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [cityName, setCityName] = useState('');
  const [consumerKind, setConsumerKind] = useState<ConsumerKind | null>(null);
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

  const sendOtp = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const r = await requestOtp(phone);
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
  }, [phone]);

  const submitOtp = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const r = await verifyOtp(phone, otp);
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
  }, [phone, otp, router]);

  const submitProfile = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      await completeProfile(name, cityName || undefined, consumerKind ?? undefined);
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
  }, [name, cityName, consumerKind, router]);

  const skipProfile = useCallback(() => {
    router.replace('/consumer/dashboard');
  }, [router]);

  const changePhone = useCallback(() => {
    setStep('phone');
    setOtp('');
    setError(null);
  }, []);

  return {
    step, phone, setPhone, otp, setOtp, name, setName, cityName, setCityName,
    consumerKind, setConsumerKind,
    error, loading, devCode,
    sendOtp, submitOtp, submitProfile, skipProfile, changePhone,
  };
}
