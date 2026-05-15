import { sniffAllowedType } from './magic-bytes';

describe('sniffAllowedType', () => {
  it('accepts PDFs by magic bytes', async () => {
    const pdf = Buffer.concat([
      Buffer.from('%PDF-1.4\n', 'utf-8'),
      Buffer.alloc(64, 0),
    ]);
    const r = await sniffAllowedType(pdf);
    expect(r?.mime).toBe('application/pdf');
    expect(r?.ext).toBe('pdf');
  });

  it('accepts PNGs by magic bytes', async () => {
    // PNG signature + IHDR chunk (file-type requires at least the IHDR to confirm PNG)
    const png = Buffer.from([
      // PNG signature
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      // IHDR chunk: length=13
      0x00, 0x00, 0x00, 0x0d,
      // 'IHDR'
      0x49, 0x48, 0x44, 0x52,
      // width=1, height=1
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      // bit depth=8, color type=2 (RGB), compression=0, filter=0, interlace=0
      0x08, 0x02, 0x00, 0x00, 0x00,
      // CRC
      0x90, 0x77, 0x53, 0xde,
    ]);
    const r = await sniffAllowedType(png);
    expect(r?.mime).toBe('image/png');
  });

  it('rejects unknown content (not on allowlist)', async () => {
    const text = Buffer.from('hello world this is plain text');
    expect(await sniffAllowedType(text)).toBeNull();
  });

  it('rejects executables (ELF)', async () => {
    const elf = Buffer.from([0x7f, 0x45, 0x4c, 0x46, ...new Array(64).fill(0)]);
    expect(await sniffAllowedType(elf)).toBeNull();
  });
});
