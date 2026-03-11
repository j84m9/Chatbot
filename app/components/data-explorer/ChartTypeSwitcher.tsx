'use client';

import { useState, useRef, useEffect } from 'react';
import type { ChartConfig } from './PlotlyChart';

interface ChartTypeItem {
  type: ChartConfig['chartType'];
  label: string;
  icon: string;
  description: string;
}

const CHART_GROUPS: { label: string; items: ChartTypeItem[] }[] = [
  {
    label: 'Standard',
    items: [
      { type: 'bar', label: 'Bar', icon: 'M3 13h2v8H3zm6-4h2v12H9zm6-6h2v18h-2zm6 10h2v8h-2z', description: 'Compare categories' },
      { type: 'line', label: 'Line', icon: 'M3 20L8 14L13 17L21 4', description: 'Trends over time' },
      { type: 'area', label: 'Area', icon: 'M3 20L8 14L13 17L21 4V20H3Z', description: 'Volume over time' },
      { type: 'scatter', label: 'Scatter', icon: 'M5 16a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm4-6a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm6 2a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm4-5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z', description: 'Correlation between variables' },
      { type: 'pie', label: 'Pie', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 2v8l6.93 4A8 8 0 0012 4z', description: 'Parts of a whole' },
    ],
  },
  {
    label: 'Comparison',
    items: [
      { type: 'grouped_bar', label: 'Grouped Bar', icon: 'M3 17h2v3H3zm3 0h2v3H6zm5-4h2v7h-2zm3 0h2v7h-2zm5-6h2v13h-2z', description: 'Compare across groups' },
      { type: 'stacked_bar', label: 'Stacked Bar', icon: 'M3 10h4v10H3zM9 6h4v14H9zm6 4h4v10h-4z', description: 'Composition by group' },
      { type: 'box', label: 'Box Plot', icon: 'M8 4v4M8 16v4M16 4v4M16 16v4M6 8h4v8H6zM14 8h4v8h-4z', description: 'Distribution & outliers' },
    ],
  },
  {
    label: 'Specialized',
    items: [
      { type: 'histogram', label: 'Histogram', icon: 'M4 18h3v-4H4zm5 0h3v-8H9zm5 0h3V6h-3z', description: 'Frequency distribution' },
      { type: 'heatmap', label: 'Heatmap', icon: 'M3 3h4v4H3zm6 0h4v4H9zm6 0h4v4h-4zM3 9h4v4H3zm6 0h4v4H9zm6 0h4v4h-4zM3 15h4v4H3zm6 0h4v4H9zm6 0h4v4h-4z', description: 'Matrix of values' },
      { type: 'funnel', label: 'Funnel', icon: 'M3 4h18l-3 5H6L3 4zm3 5h12l-2 5H8l-2-5zm2 5h8l-2 5h-4l-2-5z', description: 'Sequential stages' },
      { type: 'waterfall', label: 'Waterfall', icon: 'M3 20h2v-6h-2zm4 0h2v-10h-2zm4 0h2v-4h-2zm4 0h2v-14h-2zm4 0h2v-8h-2z', description: 'Incremental changes' },
      { type: 'gauge', label: 'KPI', icon: 'M12 22C6.48 22 2 17.52 2 12h2a8 8 0 108-8V2c5.52 0 10 4.48 10 10h-2a8 8 0 00-8-8z', description: 'Single metric display' },
    ],
  },
];

interface ChartTypeSwitcherProps {
  currentType: ChartConfig['chartType'];
  rows: Record<string, any>[];
  columns: string[];
  onChangeType: (newType: ChartConfig['chartType']) => void;
}

function isTypeDisabled(type: ChartConfig['chartType'], rowCount: number, columnCount: number): string | null {
  if (type === 'gauge' && rowCount > 1) return 'Requires exactly 1 row';
  if (type === 'pie' && rowCount > 12) return 'Too many categories (max 12)';
  if (type === 'heatmap' && columnCount < 3) return 'Needs 3+ columns';
  if (type === 'funnel' && rowCount > 15) return 'Too many stages (max 15)';
  return null;
}

export default function ChartTypeSwitcher({ currentType, rows, columns, onChangeType }: ChartTypeSwitcherProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const rowCount = rows.length;
  const columnCount = columns.length;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Find current item for label
  const currentItem = CHART_GROUPS.flatMap(g => g.items).find(i => i.type === currentType);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs dark:text-gray-300 text-gray-600 hover:dark:text-gray-100 hover:text-gray-900 transition-colors cursor-pointer"
      >
        {currentItem && (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d={currentItem.icon} />
          </svg>
        )}
        <span>{currentItem?.label || currentType}</span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-40 dark:bg-[#1a1b1c] bg-white border dark:border-[#2a2b2d] border-gray-200 rounded-xl shadow-xl py-1.5 min-w-[240px] max-h-[400px] overflow-y-auto">
          {CHART_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-3 pt-2 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider dark:text-gray-600 text-gray-400">
                  {group.label}
                </span>
              </div>
              {group.items.map(({ type, label, icon, description }) => {
                const disabledReason = isTypeDisabled(type, rowCount, columnCount);
                const active = currentType === type;

                return (
                  <button
                    key={type}
                    onClick={() => {
                      if (!disabledReason) {
                        onChangeType(type);
                        setOpen(false);
                      }
                    }}
                    disabled={!!disabledReason}
                    title={disabledReason || description}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                      active
                        ? 'dark:bg-indigo-500/15 bg-indigo-50 dark:text-indigo-300 text-indigo-600'
                        : disabledReason
                          ? 'dark:text-gray-700 text-gray-300 cursor-not-allowed'
                          : 'dark:text-gray-300 text-gray-600 dark:hover:bg-[#2a2b2d] hover:bg-gray-50'
                    }`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4 flex-shrink-0">
                      <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                    </svg>
                    <div className="flex-1 text-left">
                      <div className="font-medium">{label}</div>
                      <div className={`text-[10px] ${
                        disabledReason
                          ? 'dark:text-gray-700 text-gray-300'
                          : 'dark:text-gray-600 text-gray-400'
                      }`}>
                        {disabledReason || description}
                      </div>
                    </div>
                    {active && (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0">
                        <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
