export const money = (v: unknown) => `Rs. ${Number(v || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;

export const humanize = (key: string) => key.replace(/_/g, ' ');

const MONEY_KEY = /total|amount|balance|paid|received|cost|rate|debit|credit|value|profit/i;

export function formatCell(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return `${value.length} lines`;
  if (typeof value === 'object') { const o = value as Record<string, unknown>; return String(o.name ?? o.invoiceNo ?? '—'); }
  if (MONEY_KEY.test(key) && key !== 'cost_per_kg') return money(value);
  if (/^date$/i.test(key)) return new Date(String(value)).toLocaleDateString('en-PK');
  return String(value);
}

// Columns worth showing: drop ids/timestamps, lead with the first scalar, then joined records, cap at 7.
export function visibleKeys(row: Record<string, unknown>): string[] {
  const all = Object.keys(row || {}).filter(k => !/^id$|_id$|^created_at$|^updated_at$/.test(k));
  const related = all.filter(k => row[k] && typeof row[k] === 'object');
  const [first, ...rest] = all.filter(k => !related.includes(k));
  return [first, ...related, ...rest].filter(Boolean).slice(0, 7);
}

export const timeAgo = (ts: number | null) => {
  if (!ts) return '';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : new Date(ts).toLocaleDateString('en-PK');
};
