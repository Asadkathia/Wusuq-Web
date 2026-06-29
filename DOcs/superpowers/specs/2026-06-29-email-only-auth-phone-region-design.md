# Email-only auth, phone drives region (OTP deferred to v2)

**Date:** 2026-06-29
**Status:** Approved (brainstorm) → implementing

## Problem

On mobile, consumers hit the phone → **OTP** → profile path (`/consumer/login`). OTP
is not integrated (deferred to v2), so that path dead-ends: users can't sign up,
and we never capture their region. "Location not working on mobile" = the user's
**region/currency** (PK → PKR vs outside → USD) is never captured because the only
path that collected the phone required OTP.

## Decisions (locked in brainstorm)

1. **Mobile number is required at signup** — it is the region signal. No silent default.
2. **Keep the country dial picker** beside the phone field (🇵🇰 +92 │ 3001234567). Country still saved.
3. **One login screen** accepting **email *or* phone + password** (backend `login` already does `OR: [{email},{phone}]`).
4. **No phone uniqueness constraint** now. Phone-login stays "first match" (unchanged from today); email remains the unique primary identifier. Phone uniqueness + verification belong together with v2 OTP.
5. **Onboarding fields** (address, province/district/postal) were collected *only* in the OTP flow's profile step; they remain editable on the profile page. Signup stays minimal.
6. **User type is required at signup** — Civilian / Lawyer / Company. Reuse the existing `ConsumerKind` enum (`NON_LAWYER` / `LAWYER` / `CORPORATE`) with the labels remapped (Civilian = `NON_LAWYER`, Company = `CORPORATE`) so there is **no Prisma enum migration**. Persisted at user creation; also satisfies the existing profile-completion banner for new users.

## Changes

### Frontend (`apps/web`)

- **Signup (`/consumer/signup`)**: phone becomes **required** (validation + UI copy); the dial composition always runs. Country picker stays required. Add a required **User type** picker (Civilian / Lawyer / Company) sent as `consumerKind`. Currency is derived from the composed phone by the existing server-side `deriveCurrency` (phone dial code wins) — no logic change. "Sign in" link → `/consumer/login`; remove the "Continue with phone number" block.
- **Shared**: remap `CONSUMER_KIND_LABELS` to `{ LAWYER: 'Lawyer', NON_LAWYER: 'Civilian', CORPORATE: 'Company' }` (single source; rebuild `@wusuq/shared`).
- **Login**: `/consumer/login` becomes the email/password screen (moved from `/consumer/login/email`). `/consumer/login/email` becomes a server redirect to `/consumer/login` (preserves bookmarks/E2E).
- **Remove** the now-unused phone-OTP UI: `login/api.ts`, `hooks/use-login-flow.ts`, `hooks/use-otp-countdown.ts`, `login-shell.tsx`, `steps/{phone,otp,profile}-step.tsx`.
- **E2E**: point `mobile-responsive.spec.ts` and `payment-gating.spec.ts` at `/consumer/login`.

### Backend (`apps/api`)

- `SignupDto.phone`: `@IsOptional()` → **required** (`@IsString() @MinLength(7)`). Add required `consumerKind` (`@IsIn(CONSUMER_KINDS)`). `country` stays optional.
- `signup()` persists `consumerKind: dto.consumerKind`; phone now always present; `deriveCurrency` already phone-first.
- **OTP endpoints/service left intact** for v2 (just unlinked from the UI).

## Out of scope / v2

- OTP/SMS integration and phone verification.
- Phone uniqueness constraint + duplicate de-dup migration.
- Collecting onboarding (type/address) during signup.

## Verification

- New unit test asserting `SignupDto` rejects a missing phone and accepts a valid payload.
- Existing `auth-currency.spec.ts` (signup currency derivation) stays green.
- `pnpm typecheck` + `pnpm --filter @wusuq/web build` green.
