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
