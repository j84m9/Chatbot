/**
 * Pure-math column statistics computation.
 * No DB queries — operates on in-memory arrays of values.
 */

export interface NumericColumnStats {
  type: 'numeric';
  count: number;
  nulls: number;
  distinct: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  stdev: number;
  p25: number;
  p75: number;
  skewness: number;
}

export interface CategoricalColumnStats {
  type: 'categorical';
  count: number;
  nulls: number;
  distinct: number;
  topValues: { value: string; count: number }[];
}

export type ColumnStats = NumericColumnStats | CategoricalColumnStats;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

/**
 * Compute statistics for a column of values.
 * Automatically detects whether values are numeric or categorical.
 */
export function computeColumnStats(values: any[]): ColumnStats {
  const count = values.length;
  const nulls = values.filter(v => v == null || v === '').length;
  const nonNull = values.filter(v => v != null && v !== '');

  // Try to parse as numeric
  const numericValues = nonNull
    .map(v => typeof v === 'number' ? v : Number(v))
    .filter(v => !isNaN(v));

  // If >50% of non-null values are numeric, treat as numeric column
  if (numericValues.length > nonNull.length * 0.5 && numericValues.length > 0) {
    const sorted = [...numericValues].sort((a, b) => a - b);
    const n = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = sum / n;

    // Variance and stdev
    const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
    const stdev = Math.sqrt(variance);

    // Skewness
    let skewness = 0;
    if (stdev > 0 && n >= 3) {
      const m3 = sorted.reduce((acc, v) => acc + ((v - mean) / stdev) ** 3, 0) / n;
      skewness = m3;
    }

    return {
      type: 'numeric',
      count,
      nulls,
      distinct: new Set(numericValues).size,
      min: sorted[0],
      max: sorted[n - 1],
      mean,
      median: percentile(sorted, 50),
      stdev,
      p25: percentile(sorted, 25),
      p75: percentile(sorted, 75),
      skewness: Math.round(skewness * 1000) / 1000,
    };
  }

  // Categorical
  const freq = new Map<string, number>();
  for (const v of nonNull) {
    const key = String(v);
    freq.set(key, (freq.get(key) || 0) + 1);
  }

  const topValues = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([value, count]) => ({ value, count }));

  return {
    type: 'categorical',
    count,
    nulls,
    distinct: freq.size,
    topValues,
  };
}
