'use client';

import { useMemo, useState } from 'react';
import type { PinnedChart } from './Dashboard';
import type { GlobalFilter } from '@/types/dashboard';
import { detectFilterableColumns } from '@/utils/dashboard-filters';

interface DashboardFilterBarProps {
  pinnedCharts: PinnedChart[];
  darkMode: boolean;
  filters: GlobalFilter[];
  onFiltersChange: (filters: GlobalFilter[]) => void;
  onApplyAndRefresh?: (filters: GlobalFilter[]) => void;
}

export default function DashboardFilterBar({ pinnedCharts, darkMode, filters, onFiltersChange, onApplyAndRefresh }: DashboardFilterBarProps) {
  const [expanded, setExpanded] = useState(false);

  const { dateColumns, categoricalColumns } = useMemo(
    () => detectFilterableColumns(pinnedCharts),
    [pinnedCharts]
  );

  // Collect unique values for categorical columns
  const categoricalValues = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const col of categoricalColumns) {
      const values = new Set<string>();
      for (const chart of pinnedCharts) {
        for (const row of chart.results_snapshot.rows) {
          if (row[col] != null) values.add(String(row[col]));
        }
      }
      map.set(col, values);
    }
    return map;
  }, [pinnedCharts, categoricalColumns]);

  const hasFilterableColumns = dateColumns.length > 0 || categoricalColumns.length > 0;

  if (!hasFilterableColumns) return null;

  const hasActiveFilters = filters.some(f => {
    if (f.type === 'date_range') return f.from || f.to;
    if (f.type === 'select') return f.values && f.values.length > 0;
    return false;
  });

  const updateFilter = (column: string, update: Partial<GlobalFilter>) => {
    const existing = filters.find(f => f.column === column);
    if (existing) {
      onFiltersChange(filters.map(f => f.column === column ? { ...f, ...update } : f));
    } else {
      onFiltersChange([...filters, { column, type: 'select', ...update } as GlobalFilter]);
    }
  };

  const clearFilters = () => {
    onFiltersChange([]);
  };

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors cursor-pointer ${
            hasActiveFilters
              ? 'bg-purple-500/15 text-purple-400 hover:bg-purple-500/25'
              : 'dark:bg-[#1e1f20] bg-white border dark:border-[#2a2b2d] border-gray-200 dark:text-gray-400 text-gray-500 dark:hover:bg-[#2a2b2d] hover:bg-gray-100'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />
          </svg>
          Filters
          {hasActiveFilters && (
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
          )}
        </button>

        {hasActiveFilters && (
          <>
            <button
              onClick={clearFilters}
              className="text-xs dark:text-gray-500 text-gray-400 hover:dark:text-gray-300 hover:text-gray-600 cursor-pointer transition-colors"
            >
              Clear all
            </button>
            {onApplyAndRefresh && (
              <button
                onClick={() => onApplyAndRefresh(filters)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-colors cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                </svg>
                Apply & Refresh
              </button>
            )}
          </>
        )}
      </div>

      {expanded && (
        <div className="mt-2 p-3 rounded-lg dark:bg-[#111213] bg-white border dark:border-[#2a2b2d] border-gray-200">
          <div className="flex flex-wrap gap-4">
            {/* Date range filters */}
            {dateColumns.map(col => {
              const filter = filters.find(f => f.column === col);
              return (
                <div key={col} className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase tracking-wide dark:text-gray-500 text-gray-400 font-medium">
                    {col.replace(/_/g, ' ')}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={filter?.from || ''}
                      onChange={e => updateFilter(col, { type: 'date_range', from: e.target.value, to: filter?.to })}
                      className="text-xs px-2 py-1 rounded dark:bg-[#1e1f20] bg-gray-50 border dark:border-[#2a2b2d] border-gray-200 dark:text-gray-300 text-gray-600 outline-none focus:border-purple-500 transition-colors"
                    />
                    <span className="text-[10px] dark:text-gray-600 text-gray-400">to</span>
                    <input
                      type="date"
                      value={filter?.to || ''}
                      onChange={e => updateFilter(col, { type: 'date_range', from: filter?.from, to: e.target.value })}
                      className="text-xs px-2 py-1 rounded dark:bg-[#1e1f20] bg-gray-50 border dark:border-[#2a2b2d] border-gray-200 dark:text-gray-300 text-gray-600 outline-none focus:border-purple-500 transition-colors"
                    />
                  </div>
                </div>
              );
            })}

            {/* Categorical filters */}
            {categoricalColumns.map(col => {
              const filter = filters.find(f => f.column === col);
              const values = categoricalValues.get(col) || new Set();
              const selectedValues = new Set((filter?.values || []).map(String));

              return (
                <div key={col} className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase tracking-wide dark:text-gray-500 text-gray-400 font-medium">
                    {col.replace(/_/g, ' ')}
                  </label>
                  <div className="flex flex-wrap gap-1 max-w-[300px]">
                    {[...values].sort().map(val => (
                      <button
                        key={val}
                        onClick={() => {
                          const current = filter?.values?.map(String) || [];
                          const next = selectedValues.has(val)
                            ? current.filter(v => v !== val)
                            : [...current, val];
                          updateFilter(col, { type: 'select', values: next });
                        }}
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
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
