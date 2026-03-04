'use client';

import type { ChartConfig } from './PlotlyChart';

const CHART_TYPES: { type: ChartConfig['chartType']; label: string; icon: string }[] = [
  { type: 'bar', label: 'Bar', icon: 'M3 13h2v8H3zm6-4h2v12H9zm6-6h2v18h-2zm6 10h2v8h-2z' },
  { type: 'line', label: 'Line', icon: 'M3 20L8 14L13 17L21 4' },
  { type: 'area', label: 'Area', icon: 'M3 20L8 14L13 17L21 4V20H3Z' },
  { type: 'scatter', label: 'Scatter', icon: 'M5 16a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm4-6a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm6 2a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm4-5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z' },
  { type: 'pie', label: 'Pie', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 2v8l6.93 4A8 8 0 0012 4z' },
  { type: 'histogram', label: 'Histogram', icon: 'M4 18h3v-4H4zm5 0h3v-8H9zm5 0h3V6h-3z' },
  { type: 'box', label: 'Box Plot', icon: 'M8 4v4M8 16v4M16 4v4M16 16v4M6 8h4v8H6zM14 8h4v8h-4z' },
  { type: 'funnel', label: 'Funnel', icon: 'M3 4h18l-3 5H6L3 4zm3 5h12l-2 5H8l-2-5zm2 5h8l-2 5h-4l-2-5z' },
  { type: 'waterfall', label: 'Waterfall', icon: 'M3 20h2v-6h-2zm4 0h2v-10h-2zm4 0h2v-4h-2zm4 0h2v-14h-2zm4 0h2v-8h-2z' },
  { type: 'gauge', label: 'Gauge', icon: 'M12 22C6.48 22 2 17.52 2 12h2a8 8 0 108-8V2c5.52 0 10 4.48 10 10h-2a8 8 0 00-8-8z' },
  { type: 'heatmap', label: 'Heatmap', icon: 'M3 3h4v4H3zm6 0h4v4H9zm6 0h4v4h-4zM3 9h4v4H3zm6 0h4v4H9zm6 0h4v4h-4zM3 15h4v4H3zm6 0h4v4H9zm6 0h4v4h-4z' },
  { type: 'grouped_bar', label: 'Grouped Bar', icon: 'M3 17h2v3H3zm3 0h2v3H6zm5-4h2v7h-2zm3 0h2v7h-2zm5-6h2v13h-2z' },
  { type: 'stacked_bar', label: 'Stacked Bar', icon: 'M3 10h4v10H3zM9 6h4v14H9zm6 4h4v10h-4z' },
];

interface ChartTypeSwitcherProps {
  currentType: ChartConfig['chartType'];
  rows: Record<string, any>[];
  columns: string[];
  onChangeType: (newType: ChartConfig['chartType']) => void;
}

function isTypeDisabled(type: ChartConfig['chartType'], rowCount: number, columnCount: number): boolean {
  if (type === 'gauge' && rowCount > 1) return true;
  if (type === 'pie' && rowCount > 12) return true;
  if (type === 'heatmap' && columnCount < 3) return true;
  if (type === 'funnel' && rowCount > 15) return true;
  return false;
}

export default function ChartTypeSwitcher({ currentType, rows, columns, onChangeType }: ChartTypeSwitcherProps) {
  const rowCount = rows.length;
  const columnCount = columns.length;

  return (
    <div className="flex flex-wrap gap-1 mb-2">
      {CHART_TYPES.map(({ type, label, icon }) => {
        const disabled = isTypeDisabled(type, rowCount, columnCount);
        const active = currentType === type;

        return (
          <button
            key={type}
            onClick={() => !disabled && onChangeType(type)}
            disabled={disabled}
            title={label}
            className={`p-1.5 rounded-md transition-all cursor-pointer ${
              active
                ? 'bg-indigo-500/20 text-indigo-400 ring-1 ring-indigo-500/30'
                : disabled
                  ? 'text-gray-600 opacity-30 cursor-not-allowed'
                  : 'text-gray-400 hover:bg-white/[0.06] hover:text-gray-300'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
