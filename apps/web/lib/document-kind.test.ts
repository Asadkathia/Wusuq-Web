import { previewKind } from './document-kind';

describe('previewKind', () => {
  it('classifies pdf by extension', () => {
    expect(previewKind('x.pdf')).toBe('pdf');
  });

  it('classifies pdf by content-type', () => {
    expect(previewKind('application/pdf')).toBe('pdf');
  });

  it('classifies common image extensions', () => {
    expect(previewKind('a.png')).toBe('image');
    expect(previewKind('a.jpg')).toBe('image');
    expect(previewKind('a.jpeg')).toBe('image');
    expect(previewKind('a.gif')).toBe('image');
    expect(previewKind('a.webp')).toBe('image');
  });

  it('classifies image content-types', () => {
    expect(previewKind('image/jpeg')).toBe('image');
    expect(previewKind('image/png')).toBe('image');
  });

  it('classifies anything else as other', () => {
    expect(previewKind('a.docx')).toBe('other');
    expect(previewKind('application/msword')).toBe('other');
  });

  it('handles case-insensitivity and empty input', () => {
    expect(previewKind('DOCUMENT.PDF')).toBe('pdf');
    expect(previewKind('')).toBe('other');
  });
});
