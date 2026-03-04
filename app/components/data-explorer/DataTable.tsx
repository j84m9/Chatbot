'use client';

import { useState, useMemo } from 'react';

interface DataTableProps {
  columns: string[];
  rows: Record<string, any>[];
  types: Record<string, string>;
  rowCount: number;
  executionTimeMs: number;
  darkMode: boolean;
}

const CURRENCY_PATTERNS = /revenue|salary|cost|price|amount|total_sales|income|profit|budget|payment|fee|spend/i;

type SortDir = 'asc' | 'desc' | null;

export default function DataTable({ columns, rows, types, rowCount, executionTimeMs, darkMode }: DataTableProps) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());

  const numericCols = useMemo(() => {
    const set = new Set<string>();
    for (const col of columns) {
      const sample = rows.find(r => r[col] != null);
      if (sample && typeof sample[col] === 'number') set.add(col);
    }
    return set;
  }, [columns, rows]);

  // Compute min/max for numeric columns (for conditional formatting)
  const numericRanges = useMemo(() => {
    const ranges: Record<string, { min: number; max: number }> = {};
    for (const col of numericCols) {
      const values = rows.map(r => r[col]).filter((v): v is number => typeof v === 'number');
      if (values.length > 0) {
        ranges[col] = { min: Math.min(...values), max: Math.max(...values) };
      }
    }
    return ranges;
  }, [numericCols, rows]);

  const sortedRows = useMemo(() => {
    if (!sortCol || !sortDir) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [rows, sortCol, sortDir]);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      if (sortDir === 'asc') setSortDir('desc');
      else if (sortDir === 'desc') { setSortCol(null); setSortDir(null); }
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const formatCell = (col: string, value: any): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') {
      if (CURRENCY_PATTERNS.test(col)) {
        return '$' + value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      return value.toLocaleString();
    }
    return String(value);
  };

  const getCellBg = (col: string, value: any): string | undefined => {
    if (!numericCols.has(col) || typeof value !== 'number') return undefined;
    const range = numericRanges[col];
    if (!range || range.max === range.min) return undefined;
    const intensity = (value - range.min) / (range.max - range.min);
    const opacity = 0.05 + intensity * 0.12;
    return `rgba(99, 102, 241, ${opacity})`;
  };

  const toggleExpand = (key: string) => {
    setExpandedCells(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs dark:text-gray-400 text-gray-500 font-medium">
            {rowCount.toLocaleString()} rows
          </span>
          <span className="text-xs dark:text-gray-500 text-gray-400">
            in {executionTimeMs}ms
          </span>
        </div>
        <span className="text-xs dark:text-gray-500 text-gray-400">
          Showing {Math.min(sortedRows.length, rows.length).toLocaleString()} of {rowCount.toLocaleString()} rows
        </span>
      </div>

      <div className="overflow-x-auto border dark:border-[#2a2b2d] border-gray-200 rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="dark:bg-[#1e1f20] bg-gray-50">
              {columns.map(col => (
                <th
                  key={col}
                  onClick={() => handleSort(col)}
                  className="px-4 py-2.5 text-left text-xs font-semibold dark:text-gray-300 text-gray-600 border-b dark:border-[#2a2b2d] border-gray-200 whitespace-nowrap cursor-pointer select-none hover:bg-indigo-500/5 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    {col}
                    {sortCol === col && (
                      <span className="text-indigo-400">
                        {sortDir === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, i) => (
              <tr key={i} className={`${i % 2 === 0 ? 'dark:bg-[#161718] bg-white' : 'dark:bg-[#1a1b1c] bg-gray-50/50'} dark:hover:bg-[#1e1f20] hover:bg-gray-100 transition-colors`}>
                {columns.map(col => {
                  const value = row[col];
                  const isNumeric = numericCols.has(col);
                  const formatted = formatCell(col, value);
                  const cellBg = getCellBg(col, value);
                  const cellKey = `${i}-${col}`;
                  const isLong = formatted.length > 100;
                  const isExpanded = expandedCells.has(cellKey);

                  return (
                    <td
                      key={col}
                      className={`px-4 py-2 dark:text-gray-300 text-gray-700 border-b dark:border-[#2a2b2d]/50 border-gray-100 ${
                        isNumeric ? 'text-right tabular-nums' : ''
                      } ${!isLong ? 'whitespace-nowrap' : ''} max-w-[300px]`}
                      style={cellBg ? { backgroundColor: cellBg } : undefined}
                    >
                      {value === null ? (
                        <span className="text-gray-500 italic">null</span>
                      ) : isLong && !isExpanded ? (
                        <span>
                          {formatted.slice(0, 100)}
                          <button
                            onClick={() => toggleExpand(cellKey)}
                            className="ml-1 text-indigo-400 hover:text-indigo-300 text-xs cursor-pointer"
                          >
                            more
                          </button>
                        </span>
                      ) : (
                        <span className={isLong ? 'whitespace-pre-wrap break-words' : 'truncate block'}>
                          {formatted}
                          {isLong && isExpanded && (
                            <button
                              onClick={() => toggleExpand(cellKey)}
                              className="ml-1 text-indigo-400 hover:text-indigo-300 text-xs cursor-pointer"
                            >
                              less
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
