'use client';

import { useState, useMemo } from 'react';
import type { SlicerConfig, GlobalFilter } from '@/types/dashboard';
import type { PinnedChart } from './Dashboard';

interface DashboardSlicerCardProps {
  pin: PinnedChart;
  darkMode: boolean;
  slicerConfig: SlicerConfig;
  currentFilter: GlobalFilter | undefined;
  allCharts: PinnedChart[];
  onFilterChange: (column: string, filter: Partial<GlobalFilter>) => void;
  onUnpin: (id: string) => void;
}

export default function DashboardSlicerCard({
  pin, darkMode, slicerConfig, currentFilter, allCharts, onFilterChange, onUnpin,
}: DashboardSlicerCardProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Collect unique values from all charts for this column
  const uniqueValues = useMemo(() => {
    const values = new Set<string>();
    for (const chart of allCharts) {
      if (chart.item_type === 'slicer') continue;
      for (const row of chart.results_snapshot.rows) {
        if (row[slicerConfig.column] != null) values.add(String(row[slicerConfig.column]));
      }
    }
    return [...values].sort();
  }, [allCharts, slicerConfig.column]);

  const selectedValues = new Set((currentFilter?.values || []).map(String));
  const hasSelection = selectedValues.size > 0 || currentFilter?.from || currentFilter?.to;

  const handlePillClick = (val: string) => {
    const current = currentFilter?.values?.map(String) || [];
    const next = selectedValues.has(val)
      ? current.filter(v => v !== val)
      : [...current, val];
    onFilterChange(slicerConfig.column, { type: 'select', values: next });
  };

  const handleClear = () => {
    if (slicerConfig.filterType === 'date_range') {
      onFilterChange(slicerConfig.column, { type: 'date_range', from: undefined, to: undefined });
    } else {
      onFilterChange(slicerConfig.column, { type: 'select', values: [] });
    }
  };

  const handleSelectAll = () => {
    onFilterChange(slicerConfig.column, { type: 'select', values: uniqueValues });
  };

  return (
    <div className={`group h-full border rounded-xl overflow-hidden flex flex-col ${
      hasSelection ? 'ring-1 ring-purple-500/30 dark:border-purple-500/30 border-purple-200' : 'dark:border-[#2a2b2d] border-gray-200'
    } dark:bg-[#111213] bg-white`}>
      {/* Header */}
      <div className="drag-handle flex items-center gap-2 px-3 py-1.5 cursor-grab active:cursor-grabbing border-b dark:border-[#2a2b2d]/50 border-gray-100 flex-shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 dark:text-gray-600 text-gray-300 flex-shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />
        </svg>
        <h3 className="text-xs font-medium dark:text-gray-300 text-gray-700 truncate flex-1">
          {slicerConfig.column.replace(/_/g, ' ')}
        </h3>

        {hasSelection && (
          <button
            onClick={handleClear}
            className="text-[9px] px-1.5 py-0.5 rounded dark:text-purple-300 text-purple-600 dark:hover:bg-purple-500/10 hover:bg-purple-50 transition-colors cursor-pointer"
            title="Clear filter"
          >
            Clear
          </button>
        )}

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-0.5 rounded dark:text-gray-600 text-gray-300 dark:hover:text-gray-300 hover:text-gray-600 transition-colors cursor-pointer flex-shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-3 h-3 transition-transform ${collapsed ? '-rotate-90' : ''}`}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>

        <button
          onClick={() => onUnpin(pin.id)}
          className="p-0.5 rounded dark:text-gray-600 text-gray-300 dark:hover:text-red-400 hover:text-red-500 transition-colors cursor-pointer opacity-0 group-hover:opacity-100 flex-shrink-0"
          title="Remove slicer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto p-2">
          {slicerConfig.filterType === 'multi_select' ? (
            <div className="flex flex-col gap-1">
              {/* Select All / Clear All */}
              {uniqueValues.length > 3 && (
                <div className="flex gap-1.5 mb-1">
                  <button
                    onClick={handleSelectAll}
                    className="text-[9px] dark:text-gray-500 text-gray-400 hover:dark:text-gray-300 hover:text-gray-600 cursor-pointer transition-colors"
                  >
                    Select all
                  </button>
                  {hasSelection && (
                    <button
                      onClick={handleClear}
                      className="text-[9px] dark:text-gray-500 text-gray-400 hover:dark:text-gray-300 hover:text-gray-600 cursor-pointer transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                {uniqueValues.map(val => (
                  <button
                    key={val}
                    onClick={() => handlePillClick(val)}
                    className={`px-2 py-0.5 text-[10px] rounded-full transition-colors cursor-pointer ${
                      selectedValues.has(val)
                        ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                        : 'dark:bg-[#1e1f20] bg-gray-100 dark:text-gray-400 text-gray-500 border dark:border-[#2a2b2d] border-gray-200 hover:dark:border-gray-500 hover:border-gray-400'
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
              {uniqueValues.length === 0 && (
                <p className="text-[10px] dark:text-gray-600 text-gray-400 italic">No values found</p>
              )}
            </div>
          ) : (
            /* Date range */
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] uppercase tracking-wide dark:text-gray-500 text-gray-400 font-medium">From</label>
                <input
                  type="date"
                  value={currentFilter?.from || ''}
                  onChange={e => onFilterChange(slicerConfig.column, { type: 'date_range', from: e.target.value, to: currentFilter?.to })}
                  className="text-xs px-2 py-1 rounded dark:bg-[#1e1f20] bg-gray-50 border dark:border-[#2a2b2d] border-gray-200 dark:text-gray-300 text-gray-600 outline-none focus:border-purple-500 transition-colors w-full"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] uppercase tracking-wide dark:text-gray-500 text-gray-400 font-medium">To</label>
                <input
                  type="date"
                  value={currentFilter?.to || ''}
                  onChange={e => onFilterChange(slicerConfig.column, { type: 'date_range', from: currentFilter?.from, to: e.target.value })}
                  className="text-xs px-2 py-1 rounded dark:bg-[#1e1f20] bg-gray-50 border dark:border-[#2a2b2d] border-gray-200 dark:text-gray-300 text-gray-600 outline-none focus:border-purple-500 transition-colors w-full"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
