import type { SourceRow } from './types.js';
import { MAX_ROWS } from './limits.js';

export function scalarRow(value: unknown): SourceRow | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.key !== 'string' || row.key.length === 0 || row.key.length > 180
    || /[\u0000-\u001f\u007f]/u.test(row.key) || Object.keys(row).length > 32) return null;
  if (!Object.values(row).every((cell) => cell === null || typeof cell === 'boolean'
    || (typeof cell === 'number' && Number.isFinite(cell))
    || (typeof cell === 'string' && cell.length <= 256))) return null;
  return row as SourceRow;
}

/** All source adapters share the same display boundary before data enters the cache. */
export function normalizedRows(value: unknown): SourceRow[] {
  if (!Array.isArray(value)) throw new Error('source rows must be an array');
  const rows = value.slice(0, MAX_ROWS).map(scalarRow);
  if (rows.some((row) => row === null)) throw new Error('source row fields must be bounded scalar values');
  return rows as SourceRow[];
}
