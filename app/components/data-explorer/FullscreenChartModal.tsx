'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { PinnedChart } from './Dashboard';

const PlotlyChart = dynamic(() => import('./PlotlyChart'), { ssr: false });

interface FullscreenChartModalProps {
  pin: PinnedChart;
  darkMode: boolean;
  rows: Record<string, any>[];
  onClose: () => void;
}

export default function FullscreenChartModal({ pin, darkMode, rows, onClose }: FullscreenChartModalProps) {
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="fixed inset-0 z-50 flex flex-col" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Content */}
      <div className="relative flex flex-col flex-1 m-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 dark:bg-[#111213] bg-white rounded-t-xl border-b dark:border-[#2a2b2d] border-gray-200">
          <h2 className="text-sm font-semibold dark:text-gray-100 text-gray-800">{pin.title}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTable(!showTable)}
              className={`px-3 py-1 text-xs rounded-lg transition-colors cursor-pointer ${
                showTable
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'dark:text-gray-400 text-gray-500 dark:hover:bg-[#2a2b2d] hover:bg-gray-100'
              }`}
            >
              {showTable ? 'Hide Data' : 'Show Data'}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg dark:text-gray-400 text-gray-500 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 transition-colors cursor-pointer"
              title="Close (Esc)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Chart */}
        <div className={`flex-1 min-h-0 dark:bg-[#111213] bg-white ${showTable ? '' : 'rounded-b-xl'}`}>
          <PlotlyChart
            chartConfig={pin.chart_config}
            rows={rows}
            darkMode={darkMode}
            hideTitle
          />
        </div>

        {/* Data table */}
        {showTable && (
          <div className="max-h-[300px] overflow-auto dark:bg-[#0d0d0e] bg-gray-50 rounded-b-xl border-t dark:border-[#2a2b2d] border-gray-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 dark:bg-[#1e1f20] bg-gray-100">
                <tr>
                  {columns.map(col => (
                    <th key={col} className="text-left px-3 py-2 font-medium dark:text-gray-300 text-gray-600 border-b dark:border-[#2a2b2d] border-gray-200">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((row, i) => (
                  <tr key={i} className="dark:hover:bg-[#1e1f20] hover:bg-gray-100">
                    {columns.map(col => (
                      <td key={col} className="px-3 py-1.5 dark:text-gray-400 text-gray-600 border-b dark:border-[#2a2b2d]/30 border-gray-100 whitespace-nowrap">
                        {row[col] != null ? String(row[col]) : ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 200 && (
              <div className="text-center py-2 text-[10px] dark:text-gray-600 text-gray-400">
                Showing 200 of {rows.length} rows
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
