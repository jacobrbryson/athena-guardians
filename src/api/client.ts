import { proxyUrl } from '../config';

/**
 * Thin fetch wrapper. Every request includes credentials so the httpOnly
 * Guardian session cookie is sent to the proxy (same-origin in dev, cross-site
 * with SameSite=None in production).
 */
export interface ApiError extends Error {
  status: number;
  body?: unknown;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(proxyUrl(path), {
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
    ...init,
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json().catch(() => undefined) : undefined;

  if (!res.ok) {
    const err = new Error(
      (body as { message?: string })?.message || `Request failed (${res.status})`
    ) as ApiError;
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: data !== undefined ? JSON.stringify(data) : undefined,
    }),
};
