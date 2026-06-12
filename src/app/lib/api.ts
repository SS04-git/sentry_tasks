const API_URL = process.env.NEXT_PUBLIC_API_URL;

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

export async function fetchWithAuth(endpoint: string, token: string) {
  const res = await fetch(`${API_URL}/${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET ${endpoint} failed: ${res.status}`);
  return res.json();
}