export function pickArray<T = unknown>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  if (body && typeof body === 'object' && 'data' in body && Array.isArray((body as { data: unknown[] }).data)) {
    return (body as { data: T[] }).data;
  }
  return [];
}
