export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: unknown,
  ) {
    super(message);
  }
}

type Init = Omit<RequestInit, 'body'> & { json?: unknown };

/** Calls the backend through the Next.js /api proxy. Throws ApiError on non-2xx. */
export async function api<T = unknown>(path: string, init: Init = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    ...rest,
    headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : undefined,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (res.status === 401 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg = (body as { message?: unknown } | null)?.message;
    throw new ApiError(res.status, Array.isArray(msg) ? msg.join(', ') : typeof msg === 'string' ? msg : res.statusText, body);
  }
  return body as T;
}

export const put = <T>(path: string, json: unknown, keepalive = false) => api<T>(path, { method: 'PUT', json, keepalive });
export const patch = <T>(path: string, json: unknown) => api<T>(path, { method: 'PATCH', json });
export const post = <T>(path: string, json?: unknown) => api<T>(path, { method: 'POST', json: json ?? {} });
export const del = (path: string) => api(path, { method: 'DELETE' });
