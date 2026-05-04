import { apiClient } from '@/lib/api-client';

export type PersonalFile = {
  id: string;
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  deletedAt: string | null;
};

export type Quota = { bytesUsed: number; fileCount: number; quotaBytes: number };

export type ListResponse = { files: PersonalFile[]; usage: Quota };

export type ListParams = {
  search?: string;
  sort?: 'newest' | 'oldest' | 'name' | 'largest';
  includeDeleted?: boolean;
};

export function listPersonalFiles(params: ListParams = {}) {
  const q = new URLSearchParams();
  if (params.search) q.set('search', params.search);
  if (params.sort) q.set('sort', params.sort);
  if (params.includeDeleted) q.set('includeDeleted', 'true');
  const suffix = q.toString();
  return apiClient.get<ListResponse>(`/personal-files${suffix ? `?${suffix}` : ''}`);
}

export function getQuota() {
  return apiClient.get<Quota>('/personal-files/quota');
}

export async function uploadPersonalFile(file: File): Promise<PersonalFile> {
  const fd = new FormData();
  fd.append('file', file);
  return apiClient.post<PersonalFile>('/personal-files', fd);
}

export function softDeletePersonalFile(id: string) {
  return apiClient.delete<void>(`/personal-files/${id}`);
}

export function restorePersonalFile(id: string) {
  return apiClient.post<PersonalFile>(`/personal-files/${id}/restore`, {});
}

/**
 * Browser-friendly: hits /personal-files/:id/download which returns a 302 to
 * a signed URL. The browser follows the redirect and the file streams down.
 * We open it in a hidden anchor to get the Content-Disposition behavior.
 *
 * NOTE: this hits the API without an Authorization header (anchor click can't
 * set headers). The API endpoint is JWT-protected. To work around this we set
 * `credentials: 'include'`-equivalent via a cookie if available, OR we instead
 * pre-fetch a signed URL via apiClient (which DOES carry the JWT) and then
 * navigate to that signed URL. We use the second approach: server returns 302
 * to a temporary URL on the same `/files/personal/:token` path, which is
 * publicly accessible because the token is the auth.
 *
 * So the flow:
 *   1. apiClient.get('/personal-files/:id/download') → 302 → Location: /files/personal/<token>
 *   2. The fetch resolves to the redirected URL; we read it from response.url.
 *   3. We open response.url in a new tab.
 */
export async function downloadPersonalFile(id: string): Promise<void> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wusuq_access_token') : null;
  const r = await fetch(`${base}/personal-files/${id}/download`, {
    method: 'GET',
    redirect: 'follow',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) throw new Error(`download failed: ${r.status}`);
  // r.url is the final URL after following the 302.
  const a = document.createElement('a');
  a.href = r.url;
  a.rel = 'noopener';
  a.click();
}
