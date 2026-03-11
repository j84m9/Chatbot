'use client';

import { useMemo } from 'react';
import type { PinnedChart } from './Dashboard';
import { getChartTheme, formatDataLabel } from '@/utils/chart-theme';

const CURRENCY_PATTERNS = /revenue|salary|cost|price|amount|total_sales|income|profit|budget|payment|fee|spend|avg_|average_|sum_|total_|net_/i;
const PERCENT_PATTERNS = /rate|percent|pct|ratio|margin|growth|change/i;

function formatKPINumber(val: number, col: string): string {
  return formatDataLabel(val, col);
}

/** Compute delta from rows if there are multiple rows (e.g. current vs previous period) */
function computeDelta(rows: Record<string, any>[], col: string): { value: number; percent: number; direction: 'up' | 'down' | 'flat' } | null {
  // If 2 rows, treat row[0] as current and row[1] as previous
  if (rows.length === 2 && typeof rows[0][col] === 'number' && typeof rows[1][col] === 'number') {
    const current = rows[0][col] as number;
    const previous = rows[1][col] as number;
    if (previous === 0) return null;
    const diff = current - previous;
    const pct = (diff / Math.abs(previous)) * 100;
    return { value: diff, percent: pct, direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat' };
  }
  return null;
}

/** Build sparkline data from rows */
function getSparklineData(rows: Record<string, any>[], numericCol: string): number[] | null {
  if (rows.length < 3) return null;
  const values = rows.map(r => r[numericCol]).filter((v): v is number => typeof v === 'number');
  if (values.length < 3) return null;
  return values;
}

interface DashboardKPICardProps {
  pin: PinnedChart;
  darkMode: boolean;
  rows: Record<string, any>[];
}

export default function DashboardKPICard({ pin, darkMode, rows }: DashboardKPICardProps) {
  const theme = useMemo(() => getChartTheme(darkMode), [darkMode]);

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-xs dark:text-gray-500 text-gray-400">No data</span>
      </div>
    );
  }

  const row = rows[0];
  const cols = Object.keys(row);
  const numericCols = cols.filter(c => typeof row[c] === 'number');

  if (numericCols.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-xs dark:text-gray-500 text-gray-400">No numeric values</span>
      </div>
    );
  }

  // Single metric display
  if (numericCols.length === 1) {
    const col = numericCols[0];
    const val = row[col] as number;
    const label = cols.find(c => typeof row[c] === 'string') ? String(row[cols.find(c => typeof row[c] === 'string')!]) : col.replace(/_/g, ' ');
    const delta = computeDelta(rows, col);
    const sparklineData = getSparklineData(rows, col);

    return (
      <div className="flex flex-col items-center justify-center h-full px-4 relative">
        {/* Sparkline background */}
        {sparklineData && (
          <MiniSparkline data={sparklineData} color={theme.colors.primary} darkMode={darkMode} />
        )}

        <span className={`text-4xl font-bold tabular-nums relative z-10 ${darkMode ? 'text-gray-50' : 'text-gray-900'}`}>
          {formatKPINumber(val, col)}
        </span>

        {/* Delta indicator */}
        {delta && (
          <div className={`flex items-center gap-1 mt-1 relative z-10 text-sm font-medium ${
            delta.direction === 'up' ? 'text-emerald-500' :
            delta.direction === 'down' ? 'text-red-500' : 'text-gray-400'
          }`}>
            {delta.direction === 'up' && (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M8 1.75a.75.75 0 0 1 .75.75v8.69l2.72-2.72a.75.75 0 1 1 1.06 1.06l-4 4a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 1 1 1.06-1.06l2.72 2.72V2.5A.75.75 0 0 1 8 1.75Z" clipRule="evenodd" transform="scale(1,-1) translate(0,-16)" />
              </svg>
            )}
            {delta.direction === 'down' && (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M8 14.25a.75.75 0 0 1-.75-.75V4.81L4.53 7.53a.75.75 0 0 1-1.06-1.06l4-4a.75.75 0 0 1 1.06 0l4 4a.75.75 0 1 1-1.06 1.06L8.75 4.81v8.69a.75.75 0 0 1-.75.75Z" clipRule="evenodd" transform="scale(1,-1) translate(0,-16)" />
              </svg>
            )}
            <span>{delta.percent > 0 ? '+' : ''}{delta.percent.toFixed(1)}%</span>
          </div>
        )}

        <span className={`text-xs mt-1 uppercase tracking-wide relative z-10 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
          {label}
        </span>
      </div>
    );
  }

  // Multiple metrics in a row
  return (
    <div className="flex items-center justify-around h-full px-4 gap-4">
      {numericCols.map(col => {
        const delta = computeDelta(rows, col);
        return (
          <div key={col} className="flex flex-col items-center">
            <span className={`text-2xl font-bold tabular-nums ${darkMode ? 'text-gray-50' : 'text-gray-900'}`}>
              {formatKPINumber(row[col] as number, col)}
            </span>
            {delta && (
              <div className={`flex items-center gap-0.5 text-xs font-medium ${
                delta.direction === 'up' ? 'text-emerald-500' :
                delta.direction === 'down' ? 'text-red-500' : 'text-gray-400'
              }`}>
                {delta.direction === 'up' && <span>▲</span>}
                {delta.direction === 'down' && <span>▼</span>}
                <span>{delta.percent > 0 ? '+' : ''}{delta.percent.toFixed(1)}%</span>
              </div>
            )}
            <span className={`text-[10px] mt-0.5 uppercase tracking-wide ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              {col.replace(/_/g, ' ')}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Mini sparkline component using SVG path */
function MiniSparkline({ data, color, darkMode }: { data: number[]; color: string; darkMode: boolean }) {
  const path = useMemo(() => {
    if (data.length < 2) return '';
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const w = 120;
    const h = 32;
    const step = w / (data.length - 1);

    const points = data.map((v, i) => ({
      x: i * step,
      y: h - ((v - min) / range) * h,
    }));

    // Smooth spline path
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx1 = prev.x + step * 0.4;
      const cpx2 = curr.x - step * 0.4;
      d += ` C ${cpx1} ${prev.y}, ${cpx2} ${curr.y}, ${curr.x} ${curr.y}`;
    }
    return d;
  }, [data]);

  if (!path) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
      <svg viewBox="0 0 120 32" className="w-full h-12 max-w-[80%]" preserveAspectRatio="none">
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={path + ' L 120 32 L 0 32 Z'} fill="url(#sparkGrad)" />
        <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}
