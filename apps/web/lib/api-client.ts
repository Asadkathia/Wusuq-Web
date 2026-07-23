/* eslint-disable @typescript-eslint/no-explicit-any */
 
 
 
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    public override message: string,
    public data?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Coerce a server error `message` into a single string. NestJS/class-validator
 * returns `message` as a string[] on validation errors; ApiError.message is
 * typed string and callers render it directly (e.g. `message.toLowerCase()`),
 * so a raw array white-screens the page. Anything non-stringy falls back to a
 * generic message.
 */
export function coerceErrorMessage(raw: unknown): string {
  if (Array.isArray(raw)) {
    const joined = raw.filter((m) => typeof m === 'string').join('; ');
    return joined || 'An error occurred';
  }
  return typeof raw === 'string' && raw ? raw : 'An error occurred';
}

interface RequestOptions extends RequestInit {
  requireAuth?: boolean;
}

let refreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  const refreshToken = localStorage.getItem('wusuq_refresh_token');
  if (!refreshToken) {
    return null;
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        throw new Error('Refresh failed');
      }

      const data = (await response.json()) as {
        accessToken?: string;
        refreshToken?: string;
      };

      if (!data.accessToken) {
        throw new Error('Missing access token');
      }

      localStorage.setItem('wusuq_access_token', data.accessToken);
      if (data.refreshToken) {
        localStorage.setItem('wusuq_refresh_token', data.refreshToken);
      }

      return data.accessToken;
    } catch {
      localStorage.removeItem('wusuq_access_token');
      localStorage.removeItem('wusuq_refresh_token');
      localStorage.removeItem('wusuq_user');
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export const apiClient = {
  async fetch<T>(endpoint: string, options: RequestOptions = {}, retryOnAuthFailure = true): Promise<T> {
    const { requireAuth = true, headers = {}, ...rest } = options;
    
    const requestHeaders = new Headers(headers);
    if (!requestHeaders.has('Content-Type') && !(rest.body instanceof FormData)) {
      requestHeaders.set('Content-Type', 'application/json');
    }

    if (requireAuth) {
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('wusuq_access_token');
        if (token) {
          requestHeaders.set('Authorization', `Bearer ${token}`);
        }
      }
    }

    const response = await fetch(`${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`, {
      ...rest,
      headers: requestHeaders,
    });

    if (!response.ok) {
      if (
        response.status === 401 &&
        requireAuth &&
        retryOnAuthFailure &&
        !endpoint.startsWith('/auth/login') &&
        !endpoint.startsWith('/auth/refresh')
      ) {
        const nextAccessToken = await refreshAccessToken();
        if (nextAccessToken) {
          return this.fetch<T>(endpoint, options, false);
        }
      }

      if (response.status === 401 && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      }
      
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { message: response.statusText };
      }

      throw new ApiError(
        response.status,
        coerceErrorMessage((errorData as { message?: unknown })?.message),
        errorData,
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  },

  get<T>(endpoint: string, options?: RequestOptions) {
    return this.fetch<T>(endpoint, { ...options, method: 'GET' });
  },

  post<T>(endpoint: string, body?: any, options?: RequestOptions) {
    return this.fetch<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  },

  put<T>(endpoint: string, body?: any, options?: RequestOptions) {
    return this.fetch<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  },

  patch<T>(endpoint: string, body?: any, options?: RequestOptions) {
    return this.fetch<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  },

  delete<T>(endpoint: string, options?: RequestOptions) {
    return this.fetch<T>(endpoint, { ...options, method: 'DELETE' });
  },

  // Authenticated GET that returns the raw Blob plus the filename parsed
  // from `Content-Disposition` (falls back to `'download'`). Mirrors the
  // 401 → refresh → retry flow of `fetch()` so a click after access-token
  // expiry still succeeds when the refresh token is valid.
  async getBlob(endpoint: string, retryOnAuthFailure = true): Promise<{ blob: Blob; filename: string }> {
    const headers = new Headers();
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('wusuq_access_token');
      if (token) headers.set('Authorization', `Bearer ${token}`);
    }
    const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) {
      if (response.status === 401 && retryOnAuthFailure) {
        const nextAccessToken = await refreshAccessToken();
        if (nextAccessToken) {
          return this.getBlob(endpoint, false);
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        }
      }
      throw new ApiError(response.status, response.statusText, null);
    }
    const cd = response.headers.get('Content-Disposition') ?? '';
    const match = /filename="?([^"]+)"?/.exec(cd);
    const filename = match && match[1] ? decodeURIComponent(match[1]) : 'download';
    const blob = await response.blob();
    return { blob, filename };
  },
};
