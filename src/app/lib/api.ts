const API_URL = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

// ── Core fetch with auth ──────────────────────────────────────────────────────

export async function fetchWithAuth(
  endpoint: string,
  token: string,
  options: RequestInit = {}
) {
  const url = `${API_URL}/${endpoint.replace(/^\//, '')}`;

  const isFormData = options.body instanceof FormData;

  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(
      errorBody?.detail || `${endpoint} failed: ${response.status}`,
      response.status,
      errorBody
    );
  }

  return response.json();
}


// ── Typed error class ─────────────────────────────────────────────────────────

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}


// ── Unauthenticated helpers ───────────────────────────────────────────────────

export async function fetchData(endpoint: string) {
  const res = await fetch(`${API_URL}/${endpoint}`);
  if (!res.ok) throw new Error(`GET ${endpoint} failed: ${res.status}`);
  return res.json();
}

export async function postData(endpoint: string, body: unknown) {
  const res = await fetch(`${API_URL}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${endpoint} failed: ${res.status}`);
  return res.json();
}


// ── Authenticated method helpers ──────────────────────────────────────────────

export async function getWithAuth(endpoint: string, token: string) {
  return fetchWithAuth(endpoint, token, { method: 'GET' });
}

export async function postWithAuth(endpoint: string, token: string, body: unknown) {
  return fetchWithAuth(endpoint, token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function putWithAuth(endpoint: string, token: string, body: unknown) {
  return fetchWithAuth(endpoint, token, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function patchWithAuth(endpoint: string, token: string, body: unknown) {
  return fetchWithAuth(endpoint, token, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function deleteWithAuth(endpoint: string, token: string) {
  return fetchWithAuth(endpoint, token, { method: 'DELETE' });
}