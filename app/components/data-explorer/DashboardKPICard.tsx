'use client';

import type { PinnedChart } from './Dashboard';

const CURRENCY_PATTERNS = /revenue|salary|cost|price|amount|total_sales|income|profit|budget|payment|fee|spend|avg_|average_|sum_|total_|net_/i;

function formatKPINumber(val: number, col: string): string {
  const isCurrency = CURRENCY_PATTERNS.test(col);
  const abs = Math.abs(val);
  let formatted: string;

  if (abs >= 1e9) {
    formatted = (val / 1e9).toFixed(2) + 'B';
  } else if (abs >= 1e6) {
    formatted = (val / 1e6).toFixed(2) + 'M';
  } else if (abs >= 1e4) {
    formatted = (val / 1e3).toFixed(1) + 'K';
  } else if (Number.isInteger(val)) {
    formatted = val.toLocaleString();
  } else {
    formatted = val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return isCurrency ? '$' + formatted : formatted;
}

interface DashboardKPICardProps {
  pin: PinnedChart;
  darkMode: boolean;
  rows: Record<string, any>[];
}

export default function DashboardKPICard({ pin, darkMode, rows }: DashboardKPICardProps) {
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
    const label = cols.find(c => typeof row[c] === 'string') ? String(row[cols.find(c => typeof row[c] === 'string')!]) : col;

    return (
      <div className="flex flex-col items-center justify-center h-full px-4">
        <span className={`text-3xl font-bold ${darkMode ? 'text-gray-100' : 'text-gray-800'} tabular-nums`}>
          {formatKPINumber(val, col)}
        </span>
        <span className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'} uppercase tracking-wide`}>
          {label}
        </span>
      </div>
    );
  }

  // Multiple metrics in a row
  return (
    <div className="flex items-center justify-around h-full px-4 gap-4">
      {numericCols.map(col => (
        <div key={col} className="flex flex-col items-center">
          <span className={`text-2xl font-bold ${darkMode ? 'text-gray-100' : 'text-gray-800'} tabular-nums`}>
            {formatKPINumber(row[col] as number, col)}
          </span>
          <span className={`text-[10px] mt-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'} uppercase tracking-wide`}>
            {col.replace(/_/g, ' ')}
          </span>
        </div>
      ))}
    </div>
  );
}
