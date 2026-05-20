export type FilterOp = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'startswith' | 'contains';

export type FilterValue =
  | string | number | boolean
  | { op: FilterOp; value: string | number | boolean }
  | undefined;

export type FilterSpec = Record<string, FilterValue>;

function escapeValue(v: string | number | boolean): string {
  return String(v).replace(/~/g, '\\~');
}

export function buildFilter(spec: FilterSpec): string {
  const parts: string[] = [];
  for (const [field, raw] of Object.entries(spec)) {
    if (raw === undefined) continue;
    if (typeof raw === 'object' && raw !== null && 'op' in raw) {
      parts.push(`${field}.${raw.op}~${escapeValue(raw.value)}~`);
    } else {
      parts.push(`${field}.eq~${escapeValue(raw)}~`);
    }
  }
  if (parts.length === 0) return '';
  return `(${parts.join('&')})`;
}
