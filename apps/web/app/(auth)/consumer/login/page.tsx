'use client';
import { useState } from 'react';
import { LoginShell } from './login-shell';
import { PhoneStep } from './steps/phone-step';
import { OtpStep } from './steps/otp-step';
import { ProfileStep } from './steps/profile-step';
import { useLoginFlow } from './hooks/use-login-flow';

const STEP_INDEX = { phone: 1, otp: 2, profile: 3 } as const;

export default function ConsumerLoginPage() {
  const f = useLoginFlow();
  const [toast, setToast] = useState<string | null>(null);

  function handleMockedSocial(provider: 'google' | 'apple') {
    setToast(`${provider === 'google' ? 'Google' : 'Apple'} login coming soon`);
    setTimeout(() => setToast(null), 2500);
  }

  return (
    <>
      <LoginShell step={STEP_INDEX[f.step]} totalSteps={3}>
        {f.step === 'phone' ? (
          <PhoneStep
            countryCode={f.countryCode}
            onCountryChange={f.setCountryCode}
            phone={f.phone}
            onPhoneChange={f.setPhone}
            onSubmit={f.sendOtp}
            onMockedSocial={handleMockedSocial}
            loading={f.loading}
            error={f.error}
          />
        ) : null}
        {f.step === 'otp' ? (
          <OtpStep
            phone={f.phone}
            otp={f.otp}
            onOtpChange={f.setOtp}
            onSubmit={f.submitOtp}
            onResend={f.sendOtp}
            onChangePhone={f.changePhone}
            loading={f.loading}
            error={f.error}
          />
        ) : null}
        {f.step === 'profile' ? (
          <ProfileStep
            name={f.name}
            onNameChange={f.setName}
            cityName={f.cityName}
            onCityChange={f.setCityName}
            consumerKind={f.consumerKind}
            onConsumerKindChange={f.setConsumerKind}
            streetAddress={f.streetAddress}
            onStreetAddressChange={f.setStreetAddress}
            province={f.province}
            onProvinceChange={f.setProvince}
            provinceId={f.provinceId}
            onProvinceIdChange={f.setProvinceId}
            district={f.district}
            onDistrictChange={f.setDistrict}
            postalCode={f.postalCode}
            onPostalCodeChange={f.setPostalCode}
            onSubmit={f.submitProfile}
            loading={f.loading}
          />
        ) : null}
      </LoginShell>
      {toast ? (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2 text-sm text-white shadow-elev-2">
          {toast}
        </div>
      ) : null}
    </>
  );
}
