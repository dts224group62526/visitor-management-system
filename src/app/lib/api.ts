// Central fetch wrapper — always sends session cookie, always returns { ok, status, data }.
// All paths are relative; Vite proxies /api/* → http://localhost:4000 in development.

export interface ApiResponse<T = Record<string, unknown>> {
  ok:     boolean;
  status: number;
  data:   T;
}

async function req<T = Record<string, unknown>>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResponse<T>> {
  const isFormData = init.body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: isFormData
      ? (init.headers ?? {})
      : { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  // Gracefully handle non-JSON responses
  const data: T = await res.json().catch(() => ({} as T));
  return { ok: res.ok, status: res.status, data };
}

export const api = {
  get:    <T = Record<string, unknown>>(path: string) =>
            req<T>(path),

  post:   <T = Record<string, unknown>>(path: string, body: unknown) =>
            req<T>(path, { method: 'POST', body: JSON.stringify(body) }),

  put:    <T = Record<string, unknown>>(path: string, body: unknown) =>
            req<T>(path, { method: 'PUT',  body: JSON.stringify(body) }),

  patch:  <T = Record<string, unknown>>(path: string, body: unknown) =>
            req<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),

  del:    <T = Record<string, unknown>>(path: string) =>
            req<T>(path, { method: 'DELETE' }),

  upload: <T = Record<string, unknown>>(path: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return req<T>(path, { method: 'POST', body: fd });
  },
};
