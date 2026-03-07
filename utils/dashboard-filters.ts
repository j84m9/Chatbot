import type { GlobalFilter } from '@/types/dashboard';

/** Wraps base SQL in a subquery with WHERE clauses for each filter */
export function applyFiltersToSql(baseSql: string, filters: GlobalFilter[]): string {
  const activeFilters = filters.filter(f => {
    if (f.type === 'date_range') return f.from || f.to;
    if (f.type === 'select') return f.values && f.values.length > 0;
    return false;
  });

  if (activeFilters.length === 0) return baseSql;

  const conditions = activeFilters.map(f => {
    const col = `"${f.column}"`;
    if (f.type === 'date_range') {
      const parts: string[] = [];
      if (f.from) parts.push(`${col} >= '${f.from}'`);
      if (f.to) parts.push(`${col} <= '${f.to}'`);
      return parts.join(' AND ');
    }
    if (f.type === 'select' && f.values && f.values.length > 0) {
      const escaped = f.values.map(v => typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v));
      return `${col} IN (${escaped.join(', ')})`;
    }
    return '';
  }).filter(Boolean);

  if (conditions.length === 0) return baseSql;

  return `SELECT * FROM (${baseSql}) AS __filtered WHERE ${conditions.join(' AND ')}`;
}

/** Filters rows array in memory using global filters */
export function applyClientFilters(rows: Record<string, any>[], filters: GlobalFilter[]): Record<string, any>[] {
  if (!filters || filters.length === 0) return rows;

  return rows.filter(row => {
    return filters.every(f => {
      if (!(f.column in row)) return true;
      const val = row[f.column];

      if (f.type === 'date_range') {
        if (val == null) return false;
        const strVal = String(val);
        if (f.from && strVal < f.from) return false;
        if (f.to && strVal > f.to) return false;
        return true;
      }

      if (f.type === 'select' && f.values && f.values.length > 0) {
        return f.values.some(fv => String(fv) === String(val));
      }

      return true;
    });
  });
}

/** Detect filterable columns across multiple charts */
export function detectFilterableColumns(pinnedCharts: { results_snapshot: { rows: Record<string, any>[]; columns: string[] } }[]): {
  dateColumns: string[];
  categoricalColumns: string[];
} {
  const columnOccurrences = new Map<string, { count: number; isDate: boolean; uniqueValues: Set<string> }>();

  const datePatterns = /^(date|time|created|updated|timestamp|month|year|day|week|quarter|period)/i;
  const dateSuffixPatterns = /(date|time|timestamp|_at|_on|month|year|quarter|period)$/i;
  const isoDatePattern = /^\d{4}[-/]\d{2}/;

  for (const chart of pinnedCharts) {
    const rows = chart.results_snapshot.rows;
    if (rows.length === 0) continue;

    for (const col of Object.keys(rows[0])) {
      if (!columnOccurrences.has(col)) {
        // Detect if date column
        const sampleValues = rows.slice(0, 10).map(r => r[col]).filter(v => v != null);
        const isDate = datePatterns.test(col) || dateSuffixPatterns.test(col) ||
          (sampleValues.length > 0 && sampleValues.filter(v => typeof v === 'string' && isoDatePattern.test(v)).length >= sampleValues.length * 0.7);

        columnOccurrences.set(col, { count: 0, isDate, uniqueValues: new Set() });
      }

      const info = columnOccurrences.get(col)!;
      info.count++;

      // Collect unique values for categorical detection
      if (!info.isDate) {
        for (const row of rows.slice(0, 100)) {
          if (row[col] != null) info.uniqueValues.add(String(row[col]));
        }
      }
    }
  }

  const dateColumns: string[] = [];
  const categoricalColumns: string[] = [];

  for (const [col, info] of columnOccurrences) {
    if (info.isDate && info.count >= 1) {
      dateColumns.push(col);
    } else if (!info.isDate && info.uniqueValues.size > 0 && info.uniqueValues.size <= 20 && info.count >= 2) {
      // Categorical: string with <=20 unique values, appears in 2+ charts
      // Check that values are strings (not all numbers)
      const allNumeric = [...info.uniqueValues].every(v => !isNaN(Number(v)));
      if (!allNumeric) {
        categoricalColumns.push(col);
      }
    }
  }

  return { dateColumns, categoricalColumns };
}
