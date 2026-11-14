import { auth } from './firebase';

export async function getAuthToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) return '';
  return user.getIdToken();
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (res.status === 404 || res.status === 405) {
      throw new Error(
        'De serverfunctie is op deze statische hosting (zoals GitHub Pages) niet beschikbaar. Open StudyFlow via de volledige app-URL.'
      );
    }
    throw new Error(`Onverwachte serverreactie (status ${res.status}). Probeer het opnieuw.`);
  }

  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Serverfout (status ${res.status}).`);
  }
  return data;
}

export async function postAiJson<T>(endpoint: string, payload: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = await getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else {
    throw new Error('Je bent niet ingelogd.');
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return parseJsonResponse<T>(res);
}

export async function apiGet<T>(endpoint: string, opts?: { requireAuth?: boolean }): Promise<T> {
  const headers: Record<string, string> = {};
  const token = await getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else if (opts?.requireAuth) {
    throw new Error('Je bent niet ingelogd.');
  }

  const res = await fetch(endpoint, { method: 'GET', headers });
  return parseJsonResponse<T>(res);
}

export async function apiPost<T>(
  endpoint: string,
  payload?: unknown,
  opts?: { requireAuth?: boolean }
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = await getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else if (opts?.requireAuth !== false) {
    throw new Error('Je bent niet ingelogd.');
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: payload !== undefined ? JSON.stringify(payload) : '{}',
  });
  return parseJsonResponse<T>(res);
}

export async function apiPut<T>(
  endpoint: string,
  payload?: unknown,
  opts?: { requireAuth?: boolean }
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = await getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else if (opts?.requireAuth !== false) {
    throw new Error('Je bent niet ingelogd.');
  }

  const res = await fetch(endpoint, {
    method: 'PUT',
    headers,
    body: payload !== undefined ? JSON.stringify(payload) : '{}',
  });
  return parseJsonResponse<T>(res);
}

export async function apiDelete<T>(
  endpoint: string,
  opts?: { requireAuth?: boolean }
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = await getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else if (opts?.requireAuth !== false) {
    throw new Error('Je bent niet ingelogd.');
  }

  const res = await fetch(endpoint, {
    method: 'DELETE',
    headers,
  });
  return parseJsonResponse<T>(res);
}
