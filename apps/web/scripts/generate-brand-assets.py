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

    print("brand assets:")
    save(mark, "wusuq-mark.png", 96)
    save(mark, "wusuq-mark@2x.png", 192)
    save(mark_white, "wusuq-mark-white.png", 96)
    save(mark_white, "wusuq-mark-white@2x.png", 192)
    save(full, "wusuq-full.png", 240)
    save(full, "wusuq-full@2x.png", 480)

    # Favicon: square-pad the mark so it isn't distorted by .ico's square sizes.
    side = max(mark.size)
    canvas = Image.new("RGBA", (side, side), (255, 255, 255, 0))
    canvas.paste(mark, ((side - mark.width) // 2, (side - mark.height) // 2))
    canvas.save(ICON, sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print(f"  favicon.ico                  {side}x{side} -> 6 sizes")


if __name__ == "__main__":
    main()
