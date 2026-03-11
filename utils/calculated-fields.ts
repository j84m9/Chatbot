/**
 * Client-side calculated fields — derived columns computed from existing data.
 * Supports common business analytics calculations without requiring SQL changes.
 */

export type CalculationType =
  | 'percent_of_total'
  | 'running_total'
  | 'period_change'
  | 'period_change_pct'
  | 'rank'
  | 'moving_average'
  | 'expression';

export interface CalculatedField {
  name: string;
  type: CalculationType;
  sourceColumn: string;
  /** For moving_average: window size */
  window?: number;
  /** For expression: simple math expression like "column_a / column_b * 100" */
  expression?: string;
}

/**
 * Apply a calculated field to rows, returning new rows with the derived column added.
 */
export function applyCalculatedField(
  rows: Record<string, any>[],
  field: CalculatedField
): Record<string, any>[] {
  if (rows.length === 0) return rows;

  switch (field.type) {
    case 'percent_of_total':
      return computePercentOfTotal(rows, field.sourceColumn, field.name);
    case 'running_total':
      return computeRunningTotal(rows, field.sourceColumn, field.name);
    case 'period_change':
      return computePeriodChange(rows, field.sourceColumn, field.name, false);
    case 'period_change_pct':
      return computePeriodChange(rows, field.sourceColumn, field.name, true);
    case 'rank':
      return computeRank(rows, field.sourceColumn, field.name);
    case 'moving_average':
      return computeMovingAverage(rows, field.sourceColumn, field.name, field.window || 3);
    case 'expression':
      return computeExpression(rows, field.expression || '', field.name);
    default:
      return rows;
  }
}

function computePercentOfTotal(
  rows: Record<string, any>[],
  col: string,
  outputCol: string
): Record<string, any>[] {
  const values = rows.map(r => typeof r[col] === 'number' ? r[col] : Number(r[col]) || 0);
  const total = values.reduce((a, b) => a + Math.abs(b), 0);
  if (total === 0) return rows.map(r => ({ ...r, [outputCol]: 0 }));
  return rows.map((r, i) => ({ ...r, [outputCol]: (values[i] / total) * 100 }));
}

function computeRunningTotal(
  rows: Record<string, any>[],
  col: string,
  outputCol: string
): Record<string, any>[] {
  let cumulative = 0;
  return rows.map(r => {
    const val = typeof r[col] === 'number' ? r[col] : Number(r[col]) || 0;
    cumulative += val;
    return { ...r, [outputCol]: cumulative };
  });
}

function computePeriodChange(
  rows: Record<string, any>[],
  col: string,
  outputCol: string,
  asPercent: boolean
): Record<string, any>[] {
  return rows.map((r, i) => {
    if (i === 0) return { ...r, [outputCol]: null };
    const current = typeof r[col] === 'number' ? r[col] : Number(r[col]) || 0;
    const previous = typeof rows[i - 1][col] === 'number' ? rows[i - 1][col] : Number(rows[i - 1][col]) || 0;
    if (asPercent) {
      return { ...r, [outputCol]: previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : null };
    }
    return { ...r, [outputCol]: current - previous };
  });
}

function computeRank(
  rows: Record<string, any>[],
  col: string,
  outputCol: string
): Record<string, any>[] {
  const indexed = rows.map((r, i) => ({ value: typeof r[col] === 'number' ? r[col] : Number(r[col]) || 0, index: i }));
  indexed.sort((a, b) => b.value - a.value);
  const ranks = new Array(rows.length);
  indexed.forEach((item, rank) => { ranks[item.index] = rank + 1; });
  return rows.map((r, i) => ({ ...r, [outputCol]: ranks[i] }));
}

function computeMovingAverage(
  rows: Record<string, any>[],
  col: string,
  outputCol: string,
  window: number
): Record<string, any>[] {
  return rows.map((r, i) => {
    if (i < window - 1) return { ...r, [outputCol]: null };
    let sum = 0;
    let count = 0;
    for (let j = i - window + 1; j <= i; j++) {
      const val = typeof rows[j][col] === 'number' ? rows[j][col] : Number(rows[j][col]);
      if (!isNaN(val)) { sum += val; count++; }
    }
    return { ...r, [outputCol]: count > 0 ? sum / count : null };
  });
}

/**
 * Evaluate a simple math expression with column references.
 * Supports: +, -, *, /, parentheses, column names
 * Example: "revenue / orders * 100"
 */
function computeExpression(
  rows: Record<string, any>[],
  expression: string,
  outputCol: string
): Record<string, any>[] {
  if (!expression.trim()) return rows;

  // Get all column names from first row
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return rows.map(r => {
    try {
      // Replace column names with values
      let expr = expression;
      // Sort columns by length (longest first) to avoid partial replacements
      const sortedCols = [...columns].sort((a, b) => b.length - a.length);
      for (const col of sortedCols) {
        const val = typeof r[col] === 'number' ? r[col] : Number(r[col]);
        if (!isNaN(val)) {
          expr = expr.replace(new RegExp(`\\b${escapeRegex(col)}\\b`, 'g'), String(val));
        }
      }

      // Only allow safe characters: digits, operators, parens, dots, whitespace
      if (!/^[\d\s+\-*/().]+$/.test(expr)) {
        return { ...r, [outputCol]: null };
      }

      // Evaluate the sanitized expression
      const result = Function(`"use strict"; return (${expr})`)();
      return { ...r, [outputCol]: typeof result === 'number' && isFinite(result) ? result : null };
    } catch {
      return { ...r, [outputCol]: null };
    }
  });
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
