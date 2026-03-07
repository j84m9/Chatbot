import type { ChartAnnotation } from '@/app/components/data-explorer/PlotlyChart';

export interface Anomaly {
  x: number | string;
  y: number;
  type: 'spike' | 'drop' | 'outlier';
  severity: 'warning' | 'critical';
  description: string;
}

/**
 * Detect statistical anomalies in chart data using Z-score, period-over-period, and IQR methods.
 */
export function detectAnomalies(
  rows: Record<string, any>[],
  xColumn: string,
  yColumn: string,
  chartType: string
): Anomaly[] {
  if (rows.length < 5) return [];

  const yValues = rows.map(r => Number(r[yColumn])).filter(v => !isNaN(v));
  if (yValues.length < 5) return [];

  const anomalies: Anomaly[] = [];
  const seen = new Set<string>();

  const addAnomaly = (a: Anomaly) => {
    const key = `${a.x}:${a.y}`;
    if (!seen.has(key)) {
      seen.add(key);
      anomalies.push(a);
    }
  };

  // Z-score method
  const mean = yValues.reduce((a, b) => a + b, 0) / yValues.length;
  const stdev = Math.sqrt(yValues.reduce((a, b) => a + (b - mean) ** 2, 0) / yValues.length);

  if (stdev > 0) {
    rows.forEach((row) => {
      const y = Number(row[yColumn]);
      if (isNaN(y)) return;
      const z = Math.abs((y - mean) / stdev);
      if (z > 3) {
        addAnomaly({
          x: row[xColumn],
          y,
          type: y > mean ? 'spike' : 'drop',
          severity: 'critical',
          description: `Critical outlier: ${y > mean ? '+' : ''}${((y - mean) / stdev).toFixed(1)}σ from mean`,
        });
      } else if (z > 2) {
        addAnomaly({
          x: row[xColumn],
          y,
          type: y > mean ? 'spike' : 'drop',
          severity: 'warning',
          description: `Outlier: ${y > mean ? '+' : ''}${((y - mean) / stdev).toFixed(1)}σ from mean`,
        });
      }
    });
  }

  // Period-over-period (time series)
  const isTimeSeries = ['line', 'area'].includes(chartType);
  if (isTimeSeries && rows.length >= 3) {
    for (let i = 1; i < rows.length; i++) {
      const prev = Number(rows[i - 1][yColumn]);
      const curr = Number(rows[i][yColumn]);
      if (isNaN(prev) || isNaN(curr) || prev === 0) continue;
      const pctChange = ((curr - prev) / Math.abs(prev)) * 100;
      if (Math.abs(pctChange) > 60) {
        addAnomaly({
          x: rows[i][xColumn],
          y: curr,
          type: pctChange > 0 ? 'spike' : 'drop',
          severity: 'critical',
          description: `${pctChange > 0 ? '+' : ''}${pctChange.toFixed(0)}% change from previous period`,
        });
      } else if (Math.abs(pctChange) > 40) {
        addAnomaly({
          x: rows[i][xColumn],
          y: curr,
          type: pctChange > 0 ? 'spike' : 'drop',
          severity: 'warning',
          description: `${pctChange > 0 ? '+' : ''}${pctChange.toFixed(0)}% change from previous period`,
        });
      }
    }
  }

  // IQR method (non-time-series)
  if (!isTimeSeries) {
    const sorted = [...yValues].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;

    if (iqr > 0) {
      rows.forEach((row) => {
        const y = Number(row[yColumn]);
        if (isNaN(y)) return;
        if (y < lowerFence || y > upperFence) {
          addAnomaly({
            x: row[xColumn],
            y,
            type: 'outlier',
            severity: y < q1 - 3 * iqr || y > q3 + 3 * iqr ? 'critical' : 'warning',
            description: `IQR outlier: value ${y.toLocaleString()} outside [${lowerFence.toFixed(0)}, ${upperFence.toFixed(0)}]`,
          });
        }
      });
    }
  }

  return anomalies;
}

/**
 * Convert anomalies to ChartAnnotation objects with anomaly styling flags.
 */
export function anomaliesToAnnotations(anomalies: Anomaly[]): ChartAnnotation[] {
  return anomalies.map(a => ({
    id: `anomaly-${a.x}-${a.y}`,
    x: a.x,
    y: a.y,
    text: a.description,
    isAnomaly: true,
    severity: a.severity,
  }));
}
