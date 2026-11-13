export async function postAiJson<T>(endpoint: string, payload: unknown): Promise<T> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (res.status === 404 || res.status === 405) {
      throw new Error(
        'De AI-serverfunctie is op deze statische hosting (zoals GitHub Pages) niet beschikbaar. Open StudyFlow via de volledige app-URL om AI-generatie te gebruiken.'
      );
    }
    throw new Error(`Onverwachte serverreactie (status ${res.status}). Probeer het opnieuw.`);
  }

  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Fout bij AI-aanvraag (status ${res.status}).`);
  }
  return data;
}
