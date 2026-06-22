'use client';
import { LoginShell } from './login-shell';
import { PhoneStep } from './steps/phone-step';
import { OtpStep } from './steps/otp-step';
import { ProfileStep } from './steps/profile-step';
import { useLoginFlow } from './hooks/use-login-flow';

const STEP_INDEX = { phone: 1, otp: 2, profile: 3 } as const;

export default function ConsumerLoginPage() {
  const f = useLoginFlow();

  return (
    <LoginShell step={STEP_INDEX[f.step]} totalSteps={3}>
      {f.step === 'phone' ? (
        <PhoneStep
          countryCode={f.countryCode}
          onCountryChange={f.setCountryCode}
          phone={f.phone}
          onPhoneChange={f.setPhone}
          onSubmit={f.sendOtp}
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
  );
}
