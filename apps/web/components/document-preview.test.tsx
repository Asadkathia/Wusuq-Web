// Node-env unit test (see jest.config.js testEnvironment: 'node'). Render
// verification for <DocumentPreview> requires jsdom + @testing-library/react,
// which are not yet web devDependencies (same tradeoff documented in
// payment-method-details.test.tsx); that coverage is deferred to the Task 8
// Playwright e2e. Here we cover the pure, environment-agnostic `previewKind`
// helper.
import { previewKind } from './document-preview';

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
