'use client';

import { useMemo } from 'react';
import type { PinnedChart } from './Dashboard';
import { getChartTheme, formatDataLabel } from '@/utils/chart-theme';

const CURRENCY_PATTERNS = /revenue|salary|cost|price|amount|total_sales|income|profit|budget|payment|fee|spend|avg_|average_|sum_|total_|net_/i;

export interface ScorecardConfig {
  valueColumn: string;
  label?: string;
  deltaColumn?: string;
  sparklineColumn?: string;
  targetValue?: number;
  format?: 'currency' | 'percent' | 'number';
  color?: string;
}

interface DashboardScorecardProps {
  pin: PinnedChart;
  darkMode: boolean;
  rows: Record<string, any>[];
  onUnpin: (id: string) => void;
}

export default function DashboardScorecard({ pin, darkMode, rows, onUnpin }: DashboardScorecardProps) {
  const theme = useMemo(() => getChartTheme(darkMode), [darkMode]);
  const config = (pin.chart_config as any).scorecardConfig as ScorecardConfig | undefined;

  if (rows.length === 0) {
    return (
      <div className="group h-full border rounded-xl overflow-hidden flex flex-col dark:border-[#2a2b2d] border-gray-200 dark:bg-[#111213] bg-white">
        <ScorecardHeader pin={pin} onUnpin={onUnpin} />
        <div className="flex-1 flex items-center justify-center">
          <span className="text-xs dark:text-gray-500 text-gray-400">No data</span>
        </div>
      </div>
    );
  }

  const row = rows[0];
  const cols = Object.keys(row);
  const numericCols = cols.filter(c => typeof row[c] === 'number');
  const valueCol = config?.valueColumn || numericCols[0] || cols[0];
  const value = typeof row[valueCol] === 'number' ? row[valueCol] : Number(row[valueCol]) || 0;
  const label = config?.label || pin.title || valueCol.replace(/_/g, ' ');

  // Delta calculation
  let delta: { value: number; percent: number; direction: 'up' | 'down' | 'flat' } | null = null;
  if (config?.deltaColumn && typeof row[config.deltaColumn] === 'number') {
    const prev = row[config.deltaColumn] as number;
    if (prev !== 0) {
      const diff = value - prev;
      delta = { value: diff, percent: (diff / Math.abs(prev)) * 100, direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat' };
    }
  } else if (rows.length >= 2 && typeof rows[1][valueCol] === 'number') {
    const prev = rows[1][valueCol] as number;
    if (prev !== 0) {
      const diff = value - prev;
      delta = { value: diff, percent: (diff / Math.abs(prev)) * 100, direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat' };
    }
  }

  // Sparkline data
  const sparklineData = config?.sparklineColumn
    ? rows.map(r => r[config.sparklineColumn!]).filter((v): v is number => typeof v === 'number')
    : rows.length >= 3 ? rows.map(r => r[valueCol]).filter((v): v is number => typeof v === 'number') : null;

  // Target progress
  const target = config?.targetValue;
  const progress = target ? Math.min((value / target) * 100, 100) : null;

  // Format
  const isCurrency = config?.format === 'currency' || CURRENCY_PATTERNS.test(valueCol);

  // Color coding
  const accentColor = config?.color || theme.colors.primary;

  return (
    <div className="group h-full border rounded-xl overflow-hidden flex flex-col dark:border-[#2a2b2d] border-gray-200 dark:bg-[#111213] bg-white relative">
      <ScorecardHeader pin={pin} onUnpin={onUnpin} />

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-3 relative">
        {/* Sparkline background */}
        {sparklineData && sparklineData.length >= 3 && (
          <div className="absolute inset-0 flex items-end justify-center opacity-15 pointer-events-none px-4 pb-2">
            <SparklineSVG data={sparklineData} color={accentColor} />
          </div>
        )}

        {/* Main value */}
        <span className={`text-3xl font-bold tabular-nums relative z-10 ${darkMode ? 'text-gray-50' : 'text-gray-900'}`}>
          {formatDataLabel(value, valueCol)}
        </span>

        {/* Delta */}
        {delta && (
          <div className={`flex items-center gap-1 mt-1 relative z-10 text-sm font-medium ${
            delta.direction === 'up' ? 'text-emerald-500' :
            delta.direction === 'down' ? 'text-red-500' : 'text-gray-400'
          }`}>
            <span>{delta.direction === 'up' ? '▲' : delta.direction === 'down' ? '▼' : '—'}</span>
            <span>{delta.percent > 0 ? '+' : ''}{delta.percent.toFixed(1)}%</span>
          </div>
        )}

        {/* Target progress bar */}
        {progress !== null && (
          <div className="w-full max-w-[120px] mt-2 relative z-10">
            <div className="h-1.5 rounded-full dark:bg-gray-800 bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%`, backgroundColor: accentColor }}
              />
            </div>
            <div className="flex justify-between mt-0.5">
              <span className="text-[9px] dark:text-gray-600 text-gray-400">0</span>
              <span className="text-[9px] dark:text-gray-600 text-gray-400">{formatDataLabel(target!, valueCol)}</span>
            </div>
          </div>
        )}

        {/* Label */}
        <span className={`text-xs mt-1.5 uppercase tracking-wide relative z-10 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
          {label}
        </span>
      </div>
    </div>
  );
}

function ScorecardHeader({ pin, onUnpin }: { pin: PinnedChart; onUnpin: (id: string) => void }) {
  return (
    <div className="drag-handle flex items-center gap-2 px-3 py-1.5 cursor-grab active:cursor-grabbing border-b dark:border-[#2a2b2d]/50 border-gray-100 flex-shrink-0">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 dark:text-gray-600 text-gray-300 flex-shrink-0">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
      </svg>
      <h3 className="text-xs font-medium dark:text-gray-300 text-gray-700 truncate flex-1">
        {pin.title}
      </h3>
      <button
        onClick={() => onUnpin(pin.id)}
        className="p-0.5 rounded dark:text-gray-600 text-gray-300 dark:hover:text-red-400 hover:text-red-500 transition-colors cursor-pointer opacity-0 group-hover:opacity-100 flex-shrink-0"
        title="Remove"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function SparklineSVG({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 200;
  const h = 40;
  const step = w / (data.length - 1);

  const points = data.map((v, i) => ({
    x: i * step,
    y: h - ((v - min) / range) * h,
  }));

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx1 = prev.x + step * 0.4;
    const cpx2 = curr.x - step * 0.4;
    d += ` C ${cpx1} ${prev.y}, ${cpx2} ${curr.y}, ${curr.x} ${curr.y}`;
  }

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="scGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={d + ` L ${w} ${h} L 0 ${h} Z`} fill="url(#scGrad)" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
