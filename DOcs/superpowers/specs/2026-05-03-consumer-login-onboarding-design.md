# Consumer Login & Onboarding — Design Spec

**Date:** 2026-05-03
**Status:** Draft, pending implementation plan
**Owner:** Asad

## 1. Problem

The current consumer login is a single-page email + password form. It feels like an admin form, doesn't match Pakistani consumer expectations (every fintech in PK uses phone-first OTP), and produces low conversion. There is no social login, no separate "create account" funnel that returning users can avoid, and no onboarding step that captures the minimum context the rest of the product needs (name, city) for first-time users.

## 2. Goal

Replace the consumer login with a **3-step phone-first login flow** that doubles as implicit signup for first-time users:

- Step 1: enter phone number (Pakistan only, +92), choose Google / Apple as alternatives.
- Step 2: enter the 4-digit OTP we sent.
- Step 3 (only for first-time users): capture name + city.

Returning, already-verified users skip step 3 entirely and land on `/consumer/dashboard` after step 2.

Google and Apple buttons render as **mocked stubs** that show a "Coming soon" toast — full OAuth wiring deferred to a follow-up. SMS sending is **mocked** in v1 — the OTP code is logged to the API server stdout and (in development) returned in the response so the frontend can autofill it. Real SMS provider integration is deferred.

The layout is a single centered card with progress dots above (mobile-first, scales to desktop), not the horizontal 3-card stack from the reference mockup.

Out of scope: separate signup form (there isn't one anymore — first OTP-verify creates the account), CNIC capture, role selection, native iOS/Android, real OAuth, real SMS, international phone numbers.

## 3. Decisions Locked With User

| Decision | Choice |
|---|---|
| Identifier | A1 — Phone-first (Pakistan +92 only in v1) |
| Social providers | B3 — Google + Apple buttons (mocked; "Coming soon") |
| Step-3 questions (new users only) | C2 — Name + City only |
| Post-login destination | D1 — `/consumer/dashboard` (no auto-flow into intake wizard) |
| Layout | E3 — Single centered card with step dots above |
| Recovery | F1 — Resend timer + back-to-edit-number link |
| OTP delivery in v1 | Mocked: log to server stdout; dev mode returns code in response |
| Existing email/password users | Untouched; existing email login lives behind a "Use email instead" link |
| Separate signup page | Removed — phone-first login covers both new and returning users |

## 4. User Journey

```
┌─ /consumer/login ─────────────────────────────────────────────┐
│                                                               │
│   • • •   ← step dots (1 active, 2 pending)                  │
│                                                               │
│   Welcome back                                                │
│   Enter your phone number to continue                         │
│                                                               │
│   [ +92 ▾ ] [ 300 1234567        ]                           │
│                                                               │
│   [          Continue  →           ]                         │
│                                                               │
│   ─────────── or continue with ───────────                   │
│   [ G  Continue with Google  ]                                │
│   [    Continue with Apple   ]                                │
│                                                               │
│   Use email instead                                           │
│                                                               │
│   By continuing, you agree to our Terms and Privacy.         │
└───────────────────────────────────────────────────────────────┘
       ↓ (POST /auth/otp/request)
┌─ Same route, step 2 ──────────────────────────────────────────┐
│   • • •                                                       │
│                                                               │
│   Verify your number                                          │
│   Enter the 4-digit code sent to +92 300 1234567              │
│                                                               │
│   [ _ ] [ _ ] [ _ ] [ _ ]   ← 4 OTP boxes, auto-advance      │
│                                                               │
│   Resend code in 0:25  /  Change number                       │
│                                                               │
│   (after verify) ✓ Code verified                             │
└───────────────────────────────────────────────────────────────┘
       ↓ (POST /auth/otp/verify → returns tokens + isNewUser flag)
       ↓ if existing verified user → /consumer/dashboard
       ↓ if first-time → step 3
┌─ Same route, step 3 (first-time only) ────────────────────────┐
│   • • •                                                       │
│                                                               │
│   Tell us about you                                           │
│   This helps us serve you better.                             │
│                                                               │
│   Full Name *  [ Ali Raza                  ]                  │
│   City (optional)  [ ▾ Lahore             ]                   │
│                                                               │
│   [        Continue to dashboard  →        ]                  │
│   I'll do this later                                          │
└───────────────────────────────────────────────────────────────┘
       ↓ /consumer/dashboard
```

### 4.1 Returning users

When a user enters a phone that is already registered AND verified, the OTP request behaves identically to a first-time login. On step 2, `POST /auth/otp/verify` returns `isNewUser: false` and the user is logged in directly to the dashboard — step 3 is skipped. From the user's perspective there is no distinction between "log in" and "sign up" in step 1; both feel like the same action.

### 4.2 First-time users

If `POST /auth/otp/verify` returns `isNewUser: true`, the user is taken to step 3 to capture name + city. Both fields can be skipped via "I'll do this later"; the account already exists at this point and the user is fully usable in the dashboard with `name = null`, `cityId = null`. The dashboard renders an inline banner prompting them to complete the profile until both fields are filled.

### 4.3 "Use email instead"

A small text link beneath the social buttons takes existing email/password users to `/consumer/login/email` (the prior form, kept untouched). New users have no email-based signup path going forward.

## 5. Frontend Architecture

### 5.1 Route

Single page: `apps/web/app/(auth)/consumer/login/page.tsx`.
The existing 290-line file is fully replaced. Inside it, a `useState`-driven local step machine cycles through steps 1, 2, 3 — no nested routes, no URL changes between steps (preserves form state on browser back).

The existing email/password form is preserved at `apps/web/app/(auth)/consumer/login/email/page.tsx` (moved as part of this work).

The existing `/consumer/signup` route is removed entirely; a redirect from `/consumer/signup` → `/consumer/login` is added so existing inbound links still work.

### 5.2 Component decomposition

```
apps/web/app/(auth)/consumer/login/
  page.tsx                       // route + step orchestration only
  email/page.tsx                 // existing email/password login (moved, untouched)
  login-shell.tsx                // brand panel + centered card + step dots + footer trust badges
  steps/
    phone-step.tsx               // +92 country lock + national number + Continue + social buttons
    otp-step.tsx                 // 4-digit input + resend timer + change-number
    profile-step.tsx             // name + city + Continue / skip
  hooks/
    use-otp-countdown.ts         // 30s countdown + resend handler
    use-login-flow.ts            // owns { phone, otp, name, city, currentStep, error, loading }
```

Files are scoped narrowly so each one is single-purpose and the orchestrator (`page.tsx`) stays under ~80 lines.

### 5.3 Reuse

- City picker uses the existing `/api/geo/cities` endpoint (the same dataset the intake wizard uses), rendered as a searchable `<Select>` (the existing `apps/web/components/ui/select.tsx` primitive — already supports `searchable` and ≥8 auto-search threshold).
- Trust-badge footer ("Trusted by Thousands · 100% Secure · Fast & Reliable · Help When You Need") is its own small component within `login-shell.tsx`, reusing the existing icon system (`lucide-react`).

### 5.4 Layout (single-card, mobile-first)

The card is centered in the viewport, `max-w-md` (~480px), with the brand panel hidden below the `lg` breakpoint. On `lg+` the brand panel sits to the left of the card (matching the reference mockup's left strip). Step dots sit above the card; the trust badges sit below.

### 5.5 OTP input

Four `<input type="text" inputmode="numeric" maxlength="1">` boxes. Auto-advance focus on input, auto-back on backspace, full code paste handling (paste 4 digits → distributes across boxes). `autocomplete="one-time-code"` so iOS / Android pull from SMS automatically (when real SMS lands).

### 5.6 Mocked social buttons

Both Google and Apple buttons are real `<button>` elements styled to match the reference. On click they call a `showToast("Social login coming soon")` and do nothing else. The handler is a single `function handleMockedSocial(provider: 'google' | 'apple')` so the real OAuth call site is obvious when wiring later.

## 6. Backend Architecture

### 6.1 New endpoints

All in `apps/api/src/auth/`:

```
POST /auth/otp/request   { phone: string }
  → 200 { sent: true, devCode?: string }
  → 429 { error: 'too_many_requests', retryAfterSec: number }

POST /auth/otp/verify    { phone: string, code: string }
  → 200 { accessToken, refreshToken, user, isNewUser: boolean }
  → 401 { error: 'invalid_code' }
  → 410 { error: 'code_expired' }

POST /auth/profile/complete   (auth required)
  { name: string, cityId?: string }
  → 200 { user }
```

The existing `POST /auth/login` (email/password) and `POST /auth/signup` (email/password) stay untouched and continue to back the email login form.

### 6.2 New table — `OtpCode`

```prisma
model OtpCode {
  id         String   @id @default(cuid())
  phone      String   @db.VarChar(20)
  code       String   @db.VarChar(6)        // hashed in v2; plaintext in v1 mock
  expiresAt  DateTime
  attempts   Int      @default(0)
  consumed   Boolean  @default(false)
  createdAt  DateTime @default(now())

  @@index([phone, createdAt])
}
```

A new migration adds this table. The `User` model already has `phone` and `phoneVerified`; no schema change there.

### 6.3 OTP service behavior

In `apps/api/src/auth/otp.service.ts`:

- `request(phone)`:
  - Normalize phone to `+92XXXXXXXXXX` (strip leading 0, reject non-PK numbers in v1).
  - Rate-limit: 1 request per 30s per phone, 5 per hour per phone, 20 per hour per IP. Return 429 with `retryAfterSec` if exceeded.
  - Invalidate any unused OTPs for this phone.
  - Generate 4-digit numeric code, insert with `expiresAt = now + 5min`.
  - **Mock send:** `console.log('[OTP MOCK] phone=%s code=%s', phone, code)` and (when `NODE_ENV !== 'production'`) include the code in the response payload as `devCode` so the frontend can auto-fill in dev.
- `verify(phone, code)`:
  - Look up the most recent unconsumed OtpCode for this phone.
  - If none → 401.
  - If `expiresAt < now` → 410.
  - If `attempts >= 3` → 401 lockout (`error: 'too_many_attempts'`).
  - If `code !== submitted` → increment attempts, return 401.
  - On match: mark `consumed = true`. Find or create the `User` (set `phoneVerified = true`). Issue tokens via existing `AuthService.issueTokens`. Return `{ accessToken, refreshToken, user, isNewUser }`.

### 6.4 Profile completion

`POST /auth/profile/complete` accepts `{ name, cityId? }`. Updates the authenticated user's `name` and (if provided) `cityId`. No-op for fields not present. Returns the updated user object.

## 7. Data Flow

```
[Step 1 submit] frontend
  → POST /auth/otp/request { phone }
  → reads devCode from response (dev only) and pre-fills step 2
  → advances local step state to 2

[Step 2 submit] frontend
  → POST /auth/otp/verify { phone, code }
  → on 200: stash tokens + user in localStorage (existing keys: wusuq_access_token, wusuq_refresh_token, wusuq_user)
  → if response.isNewUser → advance to step 3
  → else router.replace('/consumer/dashboard')

[Step 3 submit] frontend
  → POST /auth/profile/complete { name, cityId? }
  → router.replace('/consumer/dashboard')

[Step 3 skip] frontend
  → router.replace('/consumer/dashboard')
```

## 8. Mock Behavior in Detail

| Mock surface | v1 behavior | Real-integration TODO |
|---|---|---|
| SMS delivery | `console.log` on the API + `devCode` in response (non-prod only) | Replace `OtpService.dispatchSms()` stub with Twilio (or chosen provider) call. Single function to swap. |
| Google button | Click → `toast("Coming soon")` | Replace `handleMockedSocial('google')` with NextAuth or hand-rolled OAuth redirect to `/auth/google/start`. |
| Apple button | Click → `toast("Coming soon")` | Same pattern. Requires Apple Developer account ($99/yr). |

Each mock is wrapped behind a single named function so the swap site is unambiguous. No "FIXME" markers in code — mocked behavior is its own current contract.

## 9. Error Handling

- **Phone format invalid** (not 10-11 digits after +92) → inline error under the input, Continue disabled.
- **OTP request rate-limited** (429) → toast "Too many requests, try again in N seconds", Continue disabled until countdown.
- **OTP expired** (410) → step-2 inline message "Code expired. Tap Resend to get a new one." Resend button enabled regardless of countdown.
- **OTP wrong** (401, attempts < 3) → inline shake animation on the boxes, message "Wrong code. Try again."
- **OTP lockout** (401, attempts ≥ 3) → message "Too many wrong attempts. Tap Resend for a new code." Boxes disabled until resend.
- **Network error on any step** → toast "Connection error. Please try again." Step state preserved.
- **Profile-complete failure** → toast, but the user can still proceed to dashboard (account exists from step 2).

## 10. Testing

Web app has no Jest. Verification approach:

- **Manual smoke** (required before merge): walk through steps 1 → 2 → 3 in the dev browser; confirm dev OTP autofills; confirm "I'll do this later" works; confirm Google/Apple toasts; confirm already-registered phone skips step 3.
- **API unit tests** (Jest, in `apps/api/`): one test file `otp.service.spec.ts` covering: request rate-limit, expiry, invalid code, attempt lockout, successful verify creates user with `phoneVerified=true`.
- **Playwright E2E** (`apps/web/e2e/consumer-login.spec.ts`): single happy-path test using the dev `devCode` to walk all three steps to dashboard, plus a returning-user variant that confirms step 3 is skipped on second login.

## 11. Migration

- `/consumer/login` route entirely replaces the existing one. The 290-line email/password page is moved to `/consumer/login/email` and untouched.
- `/consumer/signup` route is removed; a `redirect('/consumer/login')` page replaces it so existing inbound links keep working.
- Existing email/password users keep working — they tap "Use email instead" on `/consumer/login`.
- No data migration: the OTP-based phone-first flow uses the existing `User.phone` and `User.phoneVerified` columns. Users who registered via email never had a phone; they continue to use email login.

## 12. Open Questions for Plan-Time

- Whether the existing portal/staff login (`/login`, not `/consumer/login`) should also adopt phone-first OTP. Probably no — staff login is low-volume, internal, and already works. Keep this scoped to consumer login.
- Pakistan-only restriction: hardcoded `+92` country code in v1. International support not in scope.
- The dashboard banner that nudges first-time users to complete name + city after they tap "I'll do this later" — to confirm at plan time whether it's part of this scope or a separate dashboard polish task. Default: include it as the last task of this plan, since without it the "skip" behavior is invisible.
