'use client';

import { useState } from 'react';
import CodeBlock from '@/app/components/CodeBlock';
import type { Exchange } from './QueryChat';

interface ResultsPanelProps {
  exchange: Exchange | null;
  darkMode: boolean;
}

// Lazy load PlotlyChart since it's heavy
import dynamic from 'next/dynamic';
const PlotlyChart = dynamic(() => import('./PlotlyChart'), { ssr: false });

export default function ResultsPanel({ exchange, darkMode }: ResultsPanelProps) {
  const [activeTab, setActiveTab] = useState<'sql' | 'table' | 'chart'>('sql');

  if (!exchange || exchange.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full dark:text-gray-500 text-gray-400">
        {exchange?.isLoading ? (
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
            <span className="text-sm">Generating query...</span>
          </div>
        ) : (
          <div className="text-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-12 h-12 mx-auto mb-3 opacity-30">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5" />
            </svg>
            <p className="text-sm">Ask a question to see results here</p>
          </div>
        )}
      </div>
    );
  }

  const tabs: { key: 'sql' | 'table' | 'chart'; label: string; available: boolean }[] = [
    { key: 'sql', label: 'SQL', available: !!exchange.sql },
    { key: 'table', label: 'Table', available: !!exchange.results },
    { key: 'chart', label: 'Chart', available: !!exchange.chartConfig && !!exchange.results },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b dark:border-[#2a2b2d] border-gray-200 flex-shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => tab.available && setActiveTab(tab.key)}
            disabled={!tab.available}
            className={`px-3 py-1.5 text-sm rounded-lg transition-all cursor-pointer ${
              activeTab === tab.key
                ? 'bg-indigo-500/15 text-indigo-400 font-medium'
                : tab.available
                  ? 'dark:text-gray-400 text-gray-500 dark:hover:bg-[#2a2b2d] hover:bg-gray-100'
                  : 'dark:text-gray-600 text-gray-300 cursor-not-allowed'
            }`}
          >
            {tab.label}
          </button>
        ))}

        {exchange.error && (
          <span className="ml-auto text-xs text-red-400 truncate max-w-[200px]" title={exchange.error}>
            {exchange.error}
          </span>
        )}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'sql' && exchange.sql && (
          <CodeBlock code={exchange.sql} language="sql" />
        )}

        {activeTab === 'table' && exchange.results && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs dark:text-gray-400 text-gray-500 font-medium">
                {exchange.results.rowCount} rows
              </span>
              <span className="text-xs dark:text-gray-500 text-gray-400">
                in {exchange.results.executionTimeMs}ms
              </span>
            </div>

            <div className="overflow-x-auto border dark:border-[#2a2b2d] border-gray-200 rounded-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="dark:bg-[#1e1f20] bg-gray-50">
                    {exchange.results.columns.map(col => (
                      <th key={col} className="px-4 py-2.5 text-left text-xs font-semibold dark:text-gray-300 text-gray-600 border-b dark:border-[#2a2b2d] border-gray-200 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {exchange.results.rows.map((row, i) => (
                    <tr key={i} className={`${i % 2 === 0 ? 'dark:bg-[#161718] bg-white' : 'dark:bg-[#1a1b1c] bg-gray-50/50'} dark:hover:bg-[#1e1f20] hover:bg-gray-100 transition-colors`}>
                      {exchange.results!.columns.map(col => (
                        <td key={col} className="px-4 py-2 dark:text-gray-300 text-gray-700 border-b dark:border-[#2a2b2d]/50 border-gray-100 whitespace-nowrap max-w-[300px] truncate">
                          {row[col] === null ? <span className="text-gray-500 italic">null</span> : String(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'chart' && exchange.chartConfig && exchange.results && (
          <PlotlyChart
            chartConfig={exchange.chartConfig}
            rows={exchange.results.rows}
            darkMode={darkMode}
          />
        )}
      </div>
    </div>
  );
}
