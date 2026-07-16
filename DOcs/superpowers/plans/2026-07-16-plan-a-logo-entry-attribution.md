# Plan A — Logo, Entry Point & Klarus Attribution

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the official Wusuq logo everywhere, make the consumer portal the default landing experience while moving staff login to `/staff-portal`, and add the "@2026-Klarus AI" attribution.

**Architecture:** Extract one `<WusuqLogo>` component from six copy-pasted `W` tiles and back it with real cropped PNG assets generated from the owner's source file. Move `app/login/page.tsx` → `app/staff-portal/page.tsx`, leaving a query-preserving redirect. Add one shared `<ShellFooter>` to both portal shells.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind v4 (`@theme` in `globals.css`, no tailwind.config), `next/image`, Jest (`testEnvironment: 'node'`), Python + Pillow for the one-time asset generation.

Spec: `DOcs/superpowers/specs/2026-07-16-branding-entry-invoice-design.md` (Parts 1–3).

## Global Constraints

- **Brand colours are in `apps/web/app/globals.css` `@theme`, NOT a tailwind.config.** `--color-brand-500: #7b248d`, `--color-ink-900: #121f35`.
- **Do NOT recolour the theme.** The logo art samples `#8F2B8E`; `brand-500` stays `#7b248d`. The logo is its own asset.
- **Attribution string is exactly `@2026-Klarus AI`.** Rendered as `Developed by @2026-Klarus AI`. Do not reword, do not change the year.
- **Staff path is exactly `/staff-portal`.** Old `/login` permanently redirects and **must preserve `?next=`**.
- **Jest is `testEnvironment: 'node'` with no jsdom and no Testing Library** (`apps/web/jest.config.js:6`). Do NOT add jsdom in this plan. Component assertions follow the existing **source-level guard test** pattern — see `apps/web/components/consumer-ticket-board.test.ts`, which reads the source file and asserts on its contents.
- **Test files run as ESM** (`extensionsToTreatAsEsm: ['.ts']` + ts-jest `useESM: true`), so **`__dirname` is UNDEFINED in a `.test.ts`**. Use `const currentDir = dirname(fileURLToPath(import.meta.url))`, as `consumer-ticket-board.test.ts` already does. (Corrected 2026-07-16 after Task 2 review — earlier drafts of this plan wrongly used `__dirname`.)
- **`next/image` does NOT auto-substitute `@2x` files.** Stock `next/image` (this app has no `images` config or custom loader in `next.config.ts`) builds its srcSet by re-requesting the SAME `src` at different widths via `/_next/image?url=…&w=…`. Ship **one high-resolution asset per variant** and let it downscale; never hand-write `@2x` paths. (Corrected 2026-07-16 after Task 2 review — earlier drafts wrongly claimed Next serves `@2x` siblings.)
- Web tests: `pnpm --filter @wusuq/web test`. Typecheck: `pnpm --filter @wusuq/web typecheck`. Lint: `pnpm --filter @wusuq/web lint`.
- **`react-hooks/set-state-in-effect` is enforced.** Synchronous `setState` in a `useEffect` body must be wrapped in `startTransition`. Do not disable the rule.
- Commit after every task. Do NOT push (owner rule: never push without asking).

## File Structure

| File | Responsibility |
|---|---|
| `apps/web/public/brand/*.png` | Generated raster assets (create) |
| `apps/web/app/favicon.ico` | Regenerated multi-size favicon (modify) |
| `apps/web/components/ui/wusuq-logo.tsx` | **The** logo component — the only place brand art is referenced (create) |
| `apps/web/components/ui/wusuq-logo.test.ts` | Source-level guard: no stray `W` tiles remain (create) |
| `apps/web/components/ui/shell-footer.tsx` | Shared footer + attribution (create) |
| `apps/web/app/staff-portal/page.tsx` | Staff login, moved (create — git mv) |
| `apps/web/app/login/page.tsx` | Query-preserving redirect (replace) |
| `apps/web/app/(portal)/about/page.tsx` | Staff-only About (create) |
| `apps/web/lib/staff-routes.ts` | `STAFF_LOGIN_PATH` + `staffLoginHref(next)` — the pure, testable bit (create) |
| `apps/web/lib/staff-routes.test.ts` | Unit tests for the above (create) |

---

### Task 1: Generate the brand assets

**Files:**
- Create: `apps/web/public/brand/wusuq-mark.png`, `wusuq-mark-white.png`, `wusuq-full.png`
- Create: `apps/web/scripts/generate-brand-assets.py`
- Modify: `apps/web/app/favicon.ico`

**Interfaces:**
- Produces: the three PNG paths above, referenced by `wusuq-logo.tsx` in Task 2.

**Context you need:** The source is `/Users/muhammadasad/Downloads/ChatGPT Image Jul 8, 2026, 09_34_26 PM.png` — 1024×1024 RGBA, genuinely transparent (background pixels are `alpha=0`). The art sits in four vertical bands, measured from the alpha channel:

```
 173 – 233   five squares (top of mark)
 293 – 597   main Kufic block
 620 – 707   WUSUQ wordmark
 723 – 768   LEGAL.QUICKER
 x extent: 283 – 706
```

Hence **mark** = `(283, 173, 707, 598)` (424×425) and **full lockup** = `(283, 173, 707, 769)` (424×596). These are exact — do not re-derive.

- [ ] **Step 1: Copy the source into the repo**

```bash
mkdir -p apps/web/public/brand
cp "/Users/muhammadasad/Downloads/ChatGPT Image Jul 8, 2026, 09_34_26 PM.png" \
   apps/web/scripts/wusuq-logo-source.png
```

- [ ] **Step 2: Write the generator**

Create `apps/web/scripts/generate-brand-assets.py`:

```python
"""One-shot brand asset generator. Re-run only if the source art changes.

Source: apps/web/scripts/wusuq-logo-source.png (1024x1024 RGBA, transparent).
Crop boxes are measured from the alpha channel; see the plan/spec.
"""
from PIL import Image
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / "wusuq-logo-source.png"
OUT = HERE.parent / "public" / "brand"
ICON = HERE.parent / "app" / "favicon.ico"

MARK_BOX = (283, 173, 707, 598)   # 424x425 - Kufic mark only
FULL_BOX = (283, 173, 707, 769)   # 424x596 - mark + WUSUQ + LEGAL.QUICKER


def knockout_white(img: Image.Image) -> Image.Image:
    """Recolour every visible pixel to white, preserving the alpha channel.

    Used for dark surfaces (ink-900) and the invoice header tile, where the
    brand purple has no contrast.
    """
    alpha = img.split()[3]
    white = Image.new("RGBA", img.size, (255, 255, 255, 0))
    white.putalpha(alpha)
    return white


def save(img: Image.Image, name: str, width: int) -> None:
    h = round(img.height * width / img.width)
    resized = img.resize((width, h), Image.LANCZOS)
    resized.save(OUT / name, optimize=True)
    print(f"  {name:28} {width}x{h}")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    src = Image.open(SRC).convert("RGBA")

    mark = src.crop(MARK_BOX)
    full = src.crop(FULL_BOX)
    mark_white = knockout_white(mark)

    # ONE high-resolution asset per variant. next/image downscales it to each
    # call site's width (incl. retina) via /_next/image?w=…; it does NOT
    # substitute "@2x" sibling files, so shipping them would be dead weight.
    print("brand assets:")
    save(mark, "wusuq-mark.png", 192)
    save(mark_white, "wusuq-mark-white.png", 192)
    save(full, "wusuq-full.png", 480)

    # Favicon: square-pad the mark so it isn't distorted by .ico's square sizes.
    side = max(mark.size)
    canvas = Image.new("RGBA", (side, side), (255, 255, 255, 0))
    canvas.paste(mark, ((side - mark.width) // 2, (side - mark.height) // 2))
    canvas.save(ICON, sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print(f"  favicon.ico                  {side}x{side} -> 6 sizes")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Run it**

```bash
cd apps/web && python3 -m pip install --quiet Pillow && python3 scripts/generate-brand-assets.py
```

Expected output:
```
brand assets:
  wusuq-mark.png               192x192
  wusuq-mark-white.png         192x192
  wusuq-full.png               480x675
  favicon.ico                  425x425 -> 6 sizes
```

- [ ] **Step 4: Verify the crops visually**

Open `apps/web/public/brand/wusuq-mark.png` and `wusuq-full.png`. Confirm: no clipped edges, no stray background, the white knockout is genuinely white-on-transparent. **If the mark looks clipped, STOP and report — do not adjust the boxes silently.**

- [ ] **Step 5: Commit**

```bash
git add apps/web/public/brand apps/web/scripts/generate-brand-assets.py \
        apps/web/scripts/wusuq-logo-source.png apps/web/app/favicon.ico
git commit -m "feat(web): generate official Wusuq brand assets + favicon"
```

---

### Task 2: The `<WusuqLogo>` component

**Files:**
- Create: `apps/web/components/ui/wusuq-logo.tsx`
- Test: `apps/web/components/ui/wusuq-logo.test.ts`

**Interfaces:**
- Consumes: `/brand/*.png` from Task 1.
- Produces:
  ```ts
  type WusuqLogoProps = {
    variant?: 'mark' | 'full';
    tone?: 'brand' | 'white';
    size?: number;          // px width; height derives from aspect ratio
    className?: string;
    priority?: boolean;     // pass-through to next/image for above-the-fold heroes
  };
  export function WusuqLogo(props: WusuqLogoProps): JSX.Element;
  ```
  Tasks 3–5 consume this component.

**Context you need:** There is **no `next/image` usage anywhere in the app yet** — this introduces it. `next/image` needs explicit `width`/`height`; it downscales the single high-res source to each call site's width (retina included) via `/_next/image?url=…&w=…`. **It does not substitute `@2x` sibling files** — never hand-write an `@2x` path.

Aspect ratios from Task 1: mark = 425/424 ≈ **1.0024** (square in practice, source 192×192); full = 596/424 ≈ **1.4057** (source 480×675).

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/ui/wusuq-logo.test.ts`. This is a **source-level guard test**, matching the established pattern in `apps/web/components/consumer-ticket-board.test.ts` (Jest here is `testEnvironment: 'node'` — it cannot render JSX):

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(__dirname, 'wusuq-logo.tsx'), 'utf8');

describe('WusuqLogo', () => {
  it('uses next/image rather than a raw <img>', () => {
    expect(src).toContain("from 'next/image'");
    expect(src).not.toMatch(/<img\s/);
  });

  it('references the generated brand assets', () => {
    expect(src).toContain('/brand/wusuq-mark.png');
    expect(src).toContain('/brand/wusuq-mark-white.png');
    expect(src).toContain('/brand/wusuq-full.png');
  });

  it('hardcodes no @2x path — next/image downscales one high-res source', () => {
    expect(src).not.toContain('@2x');
  });

  it('exports the WusuqLogo component', () => {
    expect(src).toMatch(/export function WusuqLogo/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @wusuq/web test -- wusuq-logo`
Expected: FAIL — `ENOENT: no such file or directory ... wusuq-logo.tsx`

- [ ] **Step 3: Implement**

Create `apps/web/components/ui/wusuq-logo.tsx`:

```tsx
import Image from 'next/image';

/**
 * The single source of brand art. Every logo in the app renders through this.
 *
 * `tone="white"` uses the knockout asset — required on dark surfaces
 * (ink-900, brand-500), where the purple mark has no contrast.
 */
type WusuqLogoProps = {
  variant?: 'mark' | 'full';
  tone?: 'brand' | 'white';
  /** Rendered width in px. Height derives from the asset's aspect ratio. */
  size?: number;
  className?: string;
  priority?: boolean;
};

// Intrinsic aspect ratios of the generated crops (see generate-brand-assets.py).
const RATIO = { mark: 425 / 424, full: 596 / 424 } as const;

export function WusuqLogo({
  variant = 'mark',
  tone = 'brand',
  size = 40,
  className,
  priority = false,
}: WusuqLogoProps) {
  const src =
    variant === 'full'
      ? '/brand/wusuq-full.png'
      : tone === 'white'
        ? '/brand/wusuq-mark-white.png'
        : '/brand/wusuq-mark.png';

  return (
    <Image
      src={src}
      alt="Wusuq"
      width={size}
      height={Math.round(size * RATIO[variant])}
      className={className}
      priority={priority}
    />
  );
}
```

Note: `variant="full"` intentionally ignores `tone` — there is no white full-lockup asset, because the full lockup is only used on light surfaces. If a dark full lockup is ever needed, generate `wusuq-full-white.png` first.

- [ ] **Step 4: Run tests + typecheck**

```bash
pnpm --filter @wusuq/web test -- wusuq-logo
pnpm --filter @wusuq/web typecheck
```
Expected: 4 tests PASS; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ui/wusuq-logo.tsx apps/web/components/ui/wusuq-logo.test.ts
git commit -m "feat(web): add WusuqLogo component backed by real brand assets"
```

---

### Task 3: Replace all six `W` tiles

**Files:**
- Modify: `apps/web/components/ui/shell-nav.tsx:66-76`
- Modify: `apps/web/app/login/page.tsx:94-102` and `:126-133`
- Modify: `apps/web/app/(auth)/consumer/login/page.tsx:92-97` and `:122-129`
- Modify: `apps/web/app/(auth)/consumer/signup/page.tsx:187-192` and `:216-223`
- Modify: `apps/web/app/elections/page.tsx:74`
- Test: `apps/web/components/ui/wusuq-logo.test.ts` (extend)

**Interfaces:**
- Consumes: `WusuqLogo` from Task 2.

**Context you need — read this before editing.** The six tiles have *divergent* markup and this is the decision that resolves it:

| Site | Current tile | Surface | New |
|---|---|---|---|
| `shell-nav.tsx:67` | `h-10 w-10 rounded-xl bg-brand-500 ... shadow-elev-1` | white | **Drop the tile.** `<WusuqLogo size={40} />` bare on white. |
| `login/page.tsx:95` | `h-11 w-11 rounded-xl bg-white/10 ring-1` | `ink-900` | Keep tile, `<WusuqLogo tone="white" size={28} />` |
| `login/page.tsx:128` | `h-10 w-10 rounded-xl bg-ink-900` | white | **Drop the tile.** `<WusuqLogo size={40} />` |
| `consumer/login:93` | `h-11 w-11 rounded-xl bg-white/10 ring-1` | `brand-500` | Keep tile, `<WusuqLogo tone="white" size={28} />` |
| `consumer/login:124` | `h-10 w-10 rounded-xl bg-brand-500` | white | **Drop the tile.** `<WusuqLogo size={40} />` |
| `signup:188` / `:218` | same as consumer/login | same | same as consumer/login |
| `elections:74` | `h-10 w-10 bg-brand-500` (**no rounding**) | white | **Drop the tile.** `<WusuqLogo size={40} />` |

**Why drop the tile on light surfaces:** the logo art is purple-on-transparent. Rendering it inside a filled `bg-brand-500` tile is purple-on-purple and will not read. On `ink-900` / `brand-500` the tile stays but the art must be the **white knockout**.

- [ ] **Step 1: Write the failing guard test**

Append to `apps/web/components/ui/wusuq-logo.test.ts`. **`readFileSync`, `join`, and the module-scope `currentDir` already exist in that file from Task 2 — reuse them, do not re-import.** These test files run as **ESM**, so `__dirname` is undefined; `currentDir` is `dirname(fileURLToPath(import.meta.url))`.

```ts
describe('no hand-rolled W tiles remain', () => {
  const SITES = [
    '../shell-nav.tsx',
    '../../app/login/page.tsx',
    '../../app/(auth)/consumer/login/page.tsx',
    '../../app/(auth)/consumer/signup/page.tsx',
    '../../app/elections/page.tsx',
  ];

  it.each(SITES)('%s renders WusuqLogo, not a letter-W div', (rel) => {
    const body = readFileSync(join(currentDir, rel), 'utf8');
    expect(body).toContain('WusuqLogo');
    // The old tiles were a <div className="...">\n  W\n</div>
    expect(body).not.toMatch(/>\s*\n\s*W\s*\n\s*</);
  });
});
```

Note `shell-nav.tsx` lives beside this test, hence `../shell-nav.tsx` — adjust only if you move files.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @wusuq/web test -- wusuq-logo`
Expected: FAIL — 5 cases fail on `expect(body).toContain('WusuqLogo')`.

- [ ] **Step 3: Edit `shell-nav.tsx`**

Replace lines 66–76:

```tsx
        <div className="flex items-center gap-3">
          <WusuqLogo size={40} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-ink-900">Wusuq</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400">
              {variant === 'consumer' ? 'Client portal' : 'Staff portal'}
            </p>
          </div>
        </div>
```

Add to the imports at the top: `import { WusuqLogo } from './wusuq-logo';`

- [ ] **Step 4: Edit `app/login/page.tsx`**

Hero (lines 94–102) — keep the tile, white knockout:

```tsx
          <div className="relative flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-inset ring-white/20 backdrop-blur-sm">
              <WusuqLogo tone="white" size={28} priority />
            </div>
            <div>
              <p className="text-lg font-semibold tracking-tight">Wusuq</p>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/50">Staff portal</p>
            </div>
          </div>
```

Mobile header (lines 126–133) — drop the tile:

```tsx
            <div className="mb-8 lg:hidden">
              <div className="flex items-center gap-2.5">
                <WusuqLogo size={40} />
                <span className="text-lg font-semibold tracking-tight text-slate-900">Wusuq Staff</span>
              </div>
            </div>
```

Add `import { WusuqLogo } from '@/components/ui/wusuq-logo';`

- [ ] **Step 5: Edit `app/(auth)/consumer/login/page.tsx`**

Hero (lines 92–97):

```tsx
          <div className="relative flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-inset ring-white/20 backdrop-blur-sm">
              <WusuqLogo tone="white" size={28} priority />
            </div>
            <span className="text-lg font-semibold tracking-tight">Wusuq</span>
          </div>
```

Mobile (lines 122–129):

```tsx
            <div className="mb-8 lg:hidden">
              <div className="flex items-center gap-2.5">
                <WusuqLogo size={40} />
                <span className="text-lg font-semibold tracking-tight text-slate-900">Wusuq</span>
              </div>
            </div>
```

Add `import { WusuqLogo } from '@/components/ui/wusuq-logo';`

- [ ] **Step 6: Edit `app/(auth)/consumer/signup/page.tsx`**

Apply the exact same two replacements as Step 5 (hero at lines 187–192, mobile at 216–223 — identical markup). Add the same import.

- [ ] **Step 7: Edit `app/elections/page.tsx`**

Replace line 74:

```tsx
          <WusuqLogo size={40} />
```

Add `import { WusuqLogo } from '@/components/ui/wusuq-logo';`

- [ ] **Step 8: Run tests, typecheck, lint**

```bash
pnpm --filter @wusuq/web test -- wusuq-logo
pnpm --filter @wusuq/web typecheck
pnpm --filter @wusuq/web lint
```
Expected: all PASS; typecheck 0; lint 0 errors.

- [ ] **Step 9: Commit**

```bash
git add apps/web/components/ui/shell-nav.tsx apps/web/app/login/page.tsx \
  "apps/web/app/(auth)/consumer/login/page.tsx" "apps/web/app/(auth)/consumer/signup/page.tsx" \
  apps/web/app/elections/page.tsx apps/web/components/ui/wusuq-logo.test.ts
git commit -m "feat(web): render the official logo at all six brand surfaces"
```

---

### Task 4: Staff route helper

**Files:**
- Create: `apps/web/lib/staff-routes.ts`
- Test: `apps/web/lib/staff-routes.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const STAFF_LOGIN_PATH = '/staff-portal';
  export function staffLoginHref(next?: string | null): string;
  ```
  Consumed by Tasks 5 and 6.

**Context you need:** `portal-auth-guard.tsx:38` currently builds `/login?next=${encodeURIComponent(nextPath)}`. Extracting this into a pure function is what makes the redirect behaviour testable under `testEnvironment: 'node'` — the pages themselves cannot be rendered by this Jest config.

**Security note:** `next` must be validated as a **relative, staff-side** path. An unvalidated `next` is an open-redirect. The existing page guards against this at `login/page.tsx:27` (`candidate.startsWith('/') && !candidate.startsWith('/consumer')`); this helper centralises that rule.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/staff-routes.test.ts`:

```ts
import { STAFF_LOGIN_PATH, staffLoginHref } from './staff-routes';

describe('STAFF_LOGIN_PATH', () => {
  it('is /staff-portal', () => {
    expect(STAFF_LOGIN_PATH).toBe('/staff-portal');
  });
});

describe('staffLoginHref', () => {
  it('returns the bare path when there is no next', () => {
    expect(staffLoginHref()).toBe('/staff-portal');
    expect(staffLoginHref(null)).toBe('/staff-portal');
    expect(staffLoginHref('')).toBe('/staff-portal');
  });

  it('appends an encoded next', () => {
    expect(staffLoginHref('/tickets')).toBe('/staff-portal?next=%2Ftickets');
    expect(staffLoginHref('/finance?tab=a')).toBe('/staff-portal?next=%2Ffinance%3Ftab%3Da');
  });

  it('drops a consumer-side next (staff login must not bounce to /consumer)', () => {
    expect(staffLoginHref('/consumer/dashboard')).toBe('/staff-portal');
  });

  it('drops an absolute or protocol-relative next (open-redirect guard)', () => {
    expect(staffLoginHref('https://evil.test/x')).toBe('/staff-portal');
    expect(staffLoginHref('//evil.test/x')).toBe('/staff-portal');
    expect(staffLoginHref('javascript:alert(1)')).toBe('/staff-portal');
  });

  it('drops a next that is the login path itself (no redirect loop)', () => {
    expect(staffLoginHref('/staff-portal')).toBe('/staff-portal');
    expect(staffLoginHref('/login')).toBe('/staff-portal');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @wusuq/web test -- staff-routes`
Expected: FAIL — `Cannot find module './staff-routes'`

- [ ] **Step 3: Implement**

> ⚠️ **The code below is SUPERSEDED — do not copy it.** Its `isRelative` check has a **working open-redirect bypass**: it blocks a literal `//` prefix but not the backslash form. Browsers treat a leading `\` as `/` for http/https, so `staffLoginHref('/\evil.test')` yields a `next` that resolves to origin `evil.test`, and this app feeds `next` into `router.replace(...)` — a real cross-origin navigation. Found in the Task 4 review (2026-07-16) and fixed in commit `35c22dc`, which also fails closed on non-string input, compares the consumer/self guards case-insensitively, and rejects percent-encoded `//`. **Read the committed `apps/web/lib/staff-routes.ts` as the source of truth.** The sketch is kept only to show the intended shape.

Create `apps/web/lib/staff-routes.ts`:

```ts
/** The staff login path. Consumers never link here (spec 2026-07-16, Part 2). */
export const STAFF_LOGIN_PATH = '/staff-portal';

/** Legacy path, kept only as a permanent redirect for existing bookmarks. */
export const LEGACY_STAFF_LOGIN_PATH = '/login';

/**
 * Build the staff login href, carrying a validated `next` for post-login bounce-back.
 *
 * `next` is dropped unless it is a same-origin, staff-side path. An unvalidated
 * `next` would be an open redirect; a consumer-side or self-referential `next`
 * would bounce the user to the wrong portal or loop.
 */
export function staffLoginHref(next?: string | null): string {
  if (!next) return STAFF_LOGIN_PATH;
  const isRelative = next.startsWith('/') && !next.startsWith('//');
  const isConsumer = next === '/consumer' || next.startsWith('/consumer/');
  const isSelf = next === STAFF_LOGIN_PATH || next === LEGACY_STAFF_LOGIN_PATH;
  if (!isRelative || isConsumer || isSelf) return STAFF_LOGIN_PATH;
  return `${STAFF_LOGIN_PATH}?next=${encodeURIComponent(next)}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @wusuq/web test -- staff-routes`
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/staff-routes.ts apps/web/lib/staff-routes.test.ts
git commit -m "feat(web): add staff route helper with open-redirect guard"
```

---

### Task 5: Move staff login to /staff-portal

**Files:**
- Create (via `git mv`): `apps/web/app/staff-portal/page.tsx`
- Replace: `apps/web/app/login/page.tsx`
- Modify: `apps/web/components/portal-auth-guard.tsx:38`
- Modify: `apps/web/components/topbar.tsx:16`
- Modify: `apps/web/components/finance-board.tsx:887`
- Modify: `apps/web/app/page.tsx:38`
- Modify: `apps/web/app/(auth)/consumer/login/page.tsx:211-221` (delete)
- Test: `apps/web/lib/staff-routes.test.ts` (extend)

**Interfaces:**
- Consumes: `STAFF_LOGIN_PATH`, `staffLoginHref` from Task 4.

**Context you need — there are FIVE `/login` references, not two.** All must move:

```
apps/web/app/page.tsx:38                       router.replace(isConsumer ? '/consumer/login' : '/login')
apps/web/app/(auth)/consumer/login/page.tsx:215 href="/login"          <- DELETE the whole block
apps/web/components/topbar.tsx:16              window.location.href = '/login'
apps/web/components/finance-board.tsx:887      <Link href="/login">
apps/web/components/portal-auth-guard.tsx:38   router.replace(`/login?next=...`)
```

- [ ] **Step 1: Write the failing guard test**

Append to `apps/web/lib/staff-routes.test.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

const WEB = join(__dirname, '..');

describe('no source links to the legacy /login path', () => {
  const FILES = [
    'app/page.tsx',
    'components/topbar.tsx',
    'components/finance-board.tsx',
    'components/portal-auth-guard.tsx',
    'app/(auth)/consumer/login/page.tsx',
  ];

  it.each(FILES)('%s does not reference /login', (rel) => {
    const body = readFileSync(join(WEB, rel), 'utf8');
    expect(body).not.toMatch(/["'`]\/login\b/);
  });

  it('the consumer login page has no staff link at all', () => {
    const body = readFileSync(join(WEB, 'app/(auth)/consumer/login/page.tsx'), 'utf8');
    expect(body).not.toContain('staff-portal');
    expect(body.toLowerCase()).not.toContain('staff login');
  });

  it('the staff login page no longer links to the consumer portal', () => {
    const body = readFileSync(join(WEB, 'app/staff-portal/page.tsx'), 'utf8');
    expect(body).not.toContain('/consumer/login');
    expect(body.toLowerCase()).not.toContain('client portal');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @wusuq/web test -- staff-routes`
Expected: FAIL — several cases, plus `ENOENT` for `app/staff-portal/page.tsx`.

- [ ] **Step 3: Move the page**

```bash
mkdir -p apps/web/app/staff-portal
git mv apps/web/app/login/page.tsx apps/web/app/staff-portal/page.tsx
```

- [ ] **Step 4: Delete the consumer-portal link from the staff page**

In `apps/web/app/staff-portal/page.tsx`, delete lines 187–193 entirely (the `<p className="mt-8 text-center text-xs text-slate-500">Are you a client? …</p>` block). Then remove the now-unused `import Link from 'next/link';` at line 4 — **lint will fail on the unused import if you skip this.**

- [ ] **Step 5: Create the redirect at the old path**

Create `apps/web/app/login/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { staffLoginHref } from '@/lib/staff-routes';

/**
 * Legacy staff-login path. Kept as a permanent redirect so existing staff
 * bookmarks survive the move to /staff-portal (spec 2026-07-16, Part 2).
 *
 * The `next` query MUST be forwarded: PortalAuthGuard sends users here as
 * `/login?next=…` on a stale JWT, and dropping it breaks post-login bounce-back.
 */
export default async function LegacyLoginRedirect({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = params.next;
  const next = Array.isArray(raw) ? raw[0] : raw;
  redirect(staffLoginHref(next));
}
```

Note: this is a **server component** — Next 16 types `searchParams` as a Promise. `redirect()` from `next/navigation` issues a 307 by default; that is correct and preserves the method.

- [ ] **Step 6: Point `portal-auth-guard.tsx` at the new path**

Replace line 38:

```tsx
      router.replace(staffLoginHref(nextPath));
```

Add `import { staffLoginHref } from '@/lib/staff-routes';` to the imports.

- [ ] **Step 7: Update `topbar.tsx` and `finance-board.tsx`**

`apps/web/components/topbar.tsx:16`:
```tsx
    window.location.href = STAFF_LOGIN_PATH;
```
Add `import { STAFF_LOGIN_PATH } from '@/lib/staff-routes';`

`apps/web/components/finance-board.tsx:887`:
```tsx
              <Link className="ml-2 font-semibold underline" href={STAFF_LOGIN_PATH}>
```
Add `import { STAFF_LOGIN_PATH } from '@/lib/staff-routes';`

- [ ] **Step 8: Default the root to the consumer portal**

In `apps/web/app/page.tsx`, replace line 38:

```tsx
      router.replace(isConsumer ? '/consumer/login' : STAFF_LOGIN_PATH);
```

Then change the fallback so an **unknown** visitor lands on the consumer portal. The current logic sets `isConsumer` false when there is no stored user, which sends a first-time visitor to staff. Replace the block at lines 25–38 with:

```tsx
    const token = localStorage.getItem('wusuq_access_token');
    let role = '';
    try {
      const user = JSON.parse(localStorage.getItem('wusuq_user') || 'null') as { role?: string } | null;
      role = user?.role ?? '';
    } catch {}
    const isConsumer = CONSUMER_ROLES.includes(role);
    const isRepresentative = role === 'representative';
    const isKnownStaff = role !== '' && !isConsumer;

    if (!token || hasExpiredJwt(token)) {
      localStorage.removeItem('wusuq_access_token');
      localStorage.removeItem('wusuq_refresh_token');
      localStorage.removeItem('wusuq_user');
      // Unknown visitors land on the consumer portal; only a known staff role
      // is sent to the staff door (spec 2026-07-16, Part 2).
      router.replace(isKnownStaff ? STAFF_LOGIN_PATH : '/consumer/login');
      return;
    }
```

Add `import { STAFF_LOGIN_PATH } from '@/lib/staff-routes';`

- [ ] **Step 9: Delete the staff link from the consumer login page**

In `apps/web/app/(auth)/consumer/login/page.tsx`, delete lines 211–221 entirely (the `<div className="mt-6 border-t …">Staff member? …</div>` block). `Link` is still used at line 203 for the signup link, so **keep** the import.

- [ ] **Step 10: Fix the wrong-portal asymmetry**

Still in `apps/web/app/(auth)/consumer/login/page.tsx`, replace lines 62–64:

```tsx
      const role = data.user?.role ?? '';
      if (!CONSUMER_ROLES.includes(role)) {
        // Staff who land here are redirected silently. Telling them "this
        // account is for staff" confirms a valid staff email to an attacker
        // (spec 2026-07-16, Part 2).
        localStorage.setItem('wusuq_access_token', data.accessToken);
        localStorage.setItem('wusuq_refresh_token', data.refreshToken);
        if (data.user) localStorage.setItem('wusuq_user', JSON.stringify(data.user));
        router.replace('/dashboard');
        return;
      }
```

This mirrors the staff page's existing consumer handling at `staff-portal/page.tsx:61-67`.

- [ ] **Step 11: Run everything**

```bash
pnpm --filter @wusuq/web test
pnpm --filter @wusuq/web typecheck
pnpm --filter @wusuq/web lint
pnpm --filter @wusuq/web build
```
Expected: all tests PASS; typecheck 0; lint 0 errors; build succeeds.

- [ ] **Step 12: Verify the redirect by hand**

```bash
pnpm --filter @wusuq/web dev
```
Then check, in a browser:
1. `http://localhost:3000/login` → lands on `/staff-portal`.
2. `http://localhost:3000/login?next=%2Ffinance` → lands on `/staff-portal?next=%2Ffinance`.
3. `http://localhost:3000/` with cleared localStorage → lands on `/consumer/login`.
4. `/consumer/login` shows **no** staff link.

**If any of these fail, STOP and report.**

- [ ] **Step 13: Commit**

```bash
git add -A apps/web/app apps/web/components apps/web/lib
git commit -m "feat(web): move staff login to /staff-portal, default root to consumer portal"
```

---

### Task 6: Shared footer + Klarus AI attribution

**Files:**
- Create: `apps/web/components/ui/shell-footer.tsx`
- Test: `apps/web/components/ui/shell-footer.test.ts`
- Modify: `apps/web/app/(portal)/layout.tsx:13`
- Modify: `apps/web/app/(consumer)/layout.tsx:13`
- Modify: `apps/web/app/staff-portal/page.tsx:119-121` and `:126-133`
- Modify: `apps/web/app/(auth)/consumer/login/page.tsx:114-116` and `:122-129`
- Modify: `apps/web/app/(auth)/consumer/signup/page.tsx:209-211` and `:216-223`

**Interfaces:**
- Produces:
  ```ts
  export const ATTRIBUTION = 'Developed by @2026-Klarus AI';
  export function copyrightLine(year?: number): string;   // "© 2026 Wusuq"
  export function ShellFooter(props: { className?: string }): JSX.Element;
  ```

**Context you need:** Both shells are already `<div className="flex flex-1 flex-col min-w-0">` wrapping `<main className="flex-1 p-4 sm:p-6">`, so a `<footer>` sibling after `<main>` drops in with no layout change. The app has **no `<footer>` anywhere today** — this is the first.

The auth hero panels are `hidden lg:flex`, so an attribution added only there **will not render below `lg`**. It must also go in the mobile header block.

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/ui/shell-footer.test.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { ATTRIBUTION, copyrightLine } from './shell-footer';

describe('attribution', () => {
  it('is the exact agreed string', () => {
    expect(ATTRIBUTION).toBe('Developed by @2026-Klarus AI');
  });

  it('builds the copyright line for a given year', () => {
    expect(copyrightLine(2026)).toBe('© 2026 Wusuq');
  });

  it('defaults to the current year', () => {
    expect(copyrightLine()).toBe(`© ${new Date().getFullYear()} Wusuq`);
  });
});

describe('attribution reaches every required surface', () => {
  const WEB = join(__dirname, '..', '..');
  const SURFACES = [
    'app/(portal)/layout.tsx',
    'app/(consumer)/layout.tsx',
  ];

  it.each(SURFACES)('%s renders ShellFooter', (rel) => {
    expect(readFileSync(join(WEB, rel), 'utf8')).toContain('ShellFooter');
  });

  const AUTH_PAGES = [
    'app/staff-portal/page.tsx',
    'app/(auth)/consumer/login/page.tsx',
    'app/(auth)/consumer/signup/page.tsx',
  ];

  it.each(AUTH_PAGES)('%s shows the attribution', (rel) => {
    expect(readFileSync(join(WEB, rel), 'utf8')).toContain('ATTRIBUTION');
  });

  it.each(AUTH_PAGES)('%s shows it on mobile too, not only in the lg-only hero', (rel) => {
    const body = readFileSync(join(WEB, rel), 'utf8');
    // The hero is `hidden lg:flex`; the attribution must appear at least twice
    // (hero + mobile block) or mobile users never see it.
    const hits = body.match(/ATTRIBUTION/g) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @wusuq/web test -- shell-footer`
Expected: FAIL — `Cannot find module './shell-footer'`

- [ ] **Step 3: Implement the footer**

Create `apps/web/components/ui/shell-footer.tsx`:

```tsx
/** Attribution for the team that built this portal. Exact string — do not reword. */
export const ATTRIBUTION = 'Developed by @2026-Klarus AI';

export function copyrightLine(year: number = new Date().getFullYear()): string {
  return `© ${year} Wusuq`;
}

/**
 * The app's only page footer. Rendered by both the portal and consumer shells.
 * Also the single home of the copyright string, which was previously
 * copy-pasted across three auth pages.
 */
export function ShellFooter({ className }: { className?: string }) {
  return (
    <footer
      className={`border-t border-border-soft px-4 py-4 text-center text-xs text-slate-400 sm:px-6 ${className ?? ''}`}
    >
      {copyrightLine()} · {ATTRIBUTION}
    </footer>
  );
}
```

- [ ] **Step 4: Wire both shells**

`apps/web/app/(portal)/layout.tsx` — add the import and the footer:

```tsx
import type { ReactNode } from 'react';
import { SidebarNav } from '@/components/nav';
import { Topbar } from '@/components/topbar';
import { PortalAuthGuard } from '@/components/portal-auth-guard';
import { ShellFooter } from '@/components/ui/shell-footer';

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <PortalAuthGuard>
      <div className="flex min-h-screen bg-background text-foreground">
        <SidebarNav />
        <div className="flex flex-1 flex-col min-w-0">
          <Topbar />
          <main className="flex-1 p-4 sm:p-6">{children}</main>
          <ShellFooter />
        </div>
      </div>
    </PortalAuthGuard>
  );
}
```

`apps/web/app/(consumer)/layout.tsx` — the same, with `ConsumerSidebarNav` / `ConsumerTopbar` unchanged:

```tsx
import type { ReactNode } from 'react';
import { ConsumerAuthGuard } from '@/components/consumer-auth-guard';
import { ConsumerSidebarNav } from '@/components/consumer-nav';
import { ConsumerTopbar } from '@/components/consumer-topbar';
import { ShellFooter } from '@/components/ui/shell-footer';

export default function ConsumerLayout({ children }: { children: ReactNode }) {
  return (
    <ConsumerAuthGuard>
      <div className="flex min-h-screen bg-background text-foreground">
        <ConsumerSidebarNav />
        <div className="flex flex-1 flex-col min-w-0">
          <ConsumerTopbar />
          <main className="flex-1 p-4 sm:p-6">{children}</main>
          <ShellFooter />
        </div>
      </div>
    </ConsumerAuthGuard>
  );
}
```

- [ ] **Step 5: Add the attribution to the three auth pages**

`apps/web/app/staff-portal/page.tsx` — hero footer (was lines 119–121):

```tsx
          <p className="relative text-xs text-white/50">
            {copyrightLine()} · Internal use only
            <br />
            {ATTRIBUTION}
          </p>
```

and in the mobile block, after the logo row (inside the `lg:hidden` div):

```tsx
            <div className="mb-8 lg:hidden">
              <div className="flex items-center gap-2.5">
                <WusuqLogo size={40} />
                <span className="text-lg font-semibold tracking-tight text-slate-900">Wusuq Staff</span>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">{ATTRIBUTION}</p>
            </div>
```

Add `import { ATTRIBUTION, copyrightLine } from '@/components/ui/shell-footer';`

`apps/web/app/(auth)/consumer/login/page.tsx` — hero footer (was 114–116):

```tsx
          <p className="relative text-xs text-brand-100/70">
            {copyrightLine()} · All rights reserved
            <br />
            {ATTRIBUTION}
          </p>
```

and the mobile block:

```tsx
            <div className="mb-8 lg:hidden">
              <div className="flex items-center gap-2.5">
                <WusuqLogo size={40} />
                <span className="text-lg font-semibold tracking-tight text-slate-900">Wusuq</span>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">{ATTRIBUTION}</p>
            </div>
```

Add the same import.

`apps/web/app/(auth)/consumer/signup/page.tsx` — apply the identical two edits (hero was 209–211, mobile 216–223). Same import.

- [ ] **Step 6: Run everything**

```bash
pnpm --filter @wusuq/web test
pnpm --filter @wusuq/web typecheck
pnpm --filter @wusuq/web lint
```
Expected: all PASS; typecheck 0; lint 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/ui/shell-footer.tsx apps/web/components/ui/shell-footer.test.ts \
  "apps/web/app/(portal)/layout.tsx" "apps/web/app/(consumer)/layout.tsx" \
  apps/web/app/staff-portal/page.tsx "apps/web/app/(auth)/consumer/login/page.tsx" \
  "apps/web/app/(auth)/consumer/signup/page.tsx"
git commit -m "feat(web): add shared footer with Klarus AI attribution"
```

---

### Task 7: Admin About page

**Files:**
- Create: `apps/web/app/(portal)/about/page.tsx`
- Modify: `apps/web/components/nav.tsx` (add the nav entry)

**Interfaces:**
- Consumes: `ATTRIBUTION`, `copyrightLine` (Task 6); `WusuqLogo` (Task 2).

**Context you need:** `(portal)` is already wrapped by `PortalAuthGuard`, so anything under it is staff-only by construction — no extra guard needed. `buildNavItems` is at `nav.tsx:33-90`; `buildClerkItems` (`:92-128`) is the clerk's list and should **not** get this entry. The app version comes from `apps/web/package.json`.

- [ ] **Step 1: Create the page**

Create `apps/web/app/(portal)/about/page.tsx`:

```tsx
import { WusuqLogo } from '@/components/ui/wusuq-logo';
import { ATTRIBUTION, copyrightLine } from '@/components/ui/shell-footer';
import pkg from '../../../package.json';

export const metadata = { title: 'About · Wusuq' };

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="rounded-2xl border border-border-soft bg-surface p-8 text-center shadow-elev-1">
        <div className="flex justify-center">
          <WusuqLogo variant="full" size={140} />
        </div>

        <h1 className="mt-6 text-xl font-semibold tracking-tight text-ink-900">
          Wusuq — Paralegal Services
        </h1>
        <p className="mt-1 text-sm text-slate-500">Legal. Quicker.</p>

        <dl className="mx-auto mt-8 max-w-xs space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Version</dt>
            <dd className="font-medium text-ink-900">{pkg.version}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Developed by</dt>
            <dd className="font-medium text-ink-900">@2026-Klarus AI</dd>
          </div>
        </dl>

        <p className="mt-8 border-t border-border-soft pt-6 text-xs text-slate-400">
          {copyrightLine()} · {ATTRIBUTION}
        </p>
      </div>
    </div>
  );
}
```

If `pkg.version` is missing from `apps/web/package.json`, add `"version": "0.1.0"` to it rather than hardcoding a string here.

- [ ] **Step 2: Add the nav entry**

In `apps/web/components/nav.tsx`, inside `buildNavItems`'s returned array, add after the `Promo Codes` entry:

```tsx
    { label: 'About', href: '/about', icon: Info },
```

Add `Info` to the existing `lucide-react` import. **Do not add this to `buildClerkItems`.**

- [ ] **Step 3: Verify**

```bash
pnpm --filter @wusuq/web typecheck
pnpm --filter @wusuq/web lint
pnpm --filter @wusuq/web build
```
Expected: typecheck 0; lint 0 errors; build succeeds.

Importing `package.json` requires `resolveJsonModule`. If typecheck errors with "Cannot find module '../../../package.json'", add `"resolveJsonModule": true` to `apps/web/tsconfig.json` `compilerOptions`.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(portal)/about/page.tsx" apps/web/components/nav.tsx apps/web/package.json apps/web/tsconfig.json
git commit -m "feat(web): add staff About page with Klarus AI attribution"
```

---

### Task 8: Full verification

**Files:** none — verification only.

- [ ] **Step 1: Run the full suite**

```bash
pnpm lint
pnpm typecheck
pnpm --filter @wusuq/web test
pnpm --filter @wusuq/web build
```
Expected: all green. Record the actual test count.

- [ ] **Step 2: Drive the app**

```bash
pnpm dev:web
```

Confirm each, in a browser:

| Check | Expected |
|---|---|
| `/` with localStorage cleared | → `/consumer/login` |
| `/login` | → `/staff-portal` |
| `/login?next=%2Ffinance` | → `/staff-portal?next=%2Ffinance` |
| `/staff-portal` | real logo in hero (white on ink-900) + mobile; **no** "client portal" link |
| `/consumer/login` | real logo; **no** "staff login" link; attribution visible |
| `/consumer/login` at 375px width | attribution still visible (mobile block) |
| `/consumer/signup` | real logo + attribution |
| `/elections` | real logo |
| Any `(portal)` page | sidebar logo + footer attribution |
| Any `(consumer)` page | sidebar logo + footer attribution |
| `/about` | renders; version + attribution |
| Browser tab | new favicon |

- [ ] **Step 3: Report**

Report the actual test count, the build result, and any check above that failed. **Do not claim completion without having run these.**
