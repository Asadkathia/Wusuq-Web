/**
 * Classifies a document by its filename (extension) or content-type string
 * so the viewer knows whether it can render an inline preview. Pure — kept in
 * lib (not the component) so unit tests import it without pulling the client
 * module into the Jest graph.
 */
export function previewKind(nameOrType: string): 'pdf' | 'image' | 'other' {
  const value = (nameOrType ?? '').toLowerCase().trim();
  if (!value) return 'other';

  // Content-type style, e.g. "application/pdf", "image/png"
  if (value.startsWith('image/')) return 'image';
  if (value === 'application/pdf') return 'pdf';

  // Filename style — branch on the extension
  const extMatch = value.match(/\.([a-z0-9]+)$/);
  const ext = extMatch?.[1] ?? value;
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image';
  return 'other';
}
