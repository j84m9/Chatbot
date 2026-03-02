'use client';

import { useState, useEffect } from 'react';
import CodeBlock from '@/app/components/CodeBlock';
import dynamic from 'next/dynamic';
import type { ChartConfig } from '@/app/components/data-explorer/PlotlyChart';

const ChartGallery = dynamic(() => import('@/app/components/data-explorer/ChartGallery'), { ssr: false });

interface ExchangeData {
  question: string;
  sql: string | null;
  explanation: string | null;
  results: {
    rows: Record<string, any>[];
    columns: string[];
    types: Record<string, string>;
    rowCount: number;
    executionTimeMs: number;
  } | null;
  chartConfig: ChartConfig | null;
  chartConfigs: ChartConfig[] | null;
  error: string | null;
}

export default function ReportPage() {
  const [exchange, setExchange] = useState<ExchangeData | null>(null);
  const [activeTab, setActiveTab] = useState<'sql' | 'table' | 'chart'>('chart');
  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => {
    // Read dark mode preference
    const saved = localStorage.getItem('theme');
    const isDark = saved ? saved === 'dark' : true;
    setDarkMode(isDark);
    document.documentElement.classList.toggle('dark', isDark);

    // Read exchange data from sessionStorage
    const raw = sessionStorage.getItem('report-exchange');
    if (raw) {
      try {
        const data: ExchangeData = JSON.parse(raw);
        setExchange(data);

        // Resolve charts
        const charts = data.chartConfigs || (data.chartConfig ? [data.chartConfig] : []);

        // Default to chart tab if chart is available, otherwise table, then sql
        if (charts.length > 0 && data.results) {
          setActiveTab('chart');
        } else if (data.results) {
          setActiveTab('table');
        } else {
          setActiveTab('sql');
        }

        // Set window title
        document.title = data.question || 'Query Report';
      } catch {
        // Invalid data
      }
    }
  }, []);

  const handleCsvExport = () => {
    if (!exchange?.results) return;
    const { columns, rows } = exchange.results;

    const escapeCell = (val: unknown): string => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const header = columns.map(escapeCell).join(',');
    const body = rows.map(row => columns.map(col => escapeCell(row[col])).join(',')).join('\n');
    const csv = header + '\n' + body;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `query-results-${ts}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!exchange) {
    return (
      <div className="flex items-center justify-center h-screen dark:bg-[#0d0d0e] bg-gray-50">
        <p className="dark:text-gray-500 text-gray-400 text-sm">No report data available.</p>
      </div>
    );
  }

  // Resolve chart configs: prefer array, fall back to single
  const resolvedChartConfigs: ChartConfig[] = exchange.chartConfigs
    ? exchange.chartConfigs
    : exchange.chartConfig
      ? [exchange.chartConfig]
      : [];

  const chartCount = resolvedChartConfigs.length;
  const hasCharts = chartCount > 0 && !!exchange.results;

  const tabs: { key: 'sql' | 'table' | 'chart'; label: string; available: boolean }[] = [
    { key: 'sql', label: 'SQL', available: !!exchange.sql },
    { key: 'table', label: 'Table', available: !!exchange.results },
    { key: 'chart', label: chartCount > 1 ? `Charts (${chartCount})` : 'Chart', available: hasCharts },
  ];

  return (
    <div className="flex flex-col h-screen dark:bg-[#0d0d0e] bg-gray-50 dark:text-gray-100 text-gray-900 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b dark:border-white/[0.06] border-gray-200/80 dark:bg-[#0d0d0e]/80 bg-gray-50/80 backdrop-blur-xl flex-shrink-0">
        <div className="flex items-center gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-indigo-400">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5" />
          </svg>
          <span className="text-base font-semibold dark:text-gray-100 text-gray-800">Query Report</span>
        </div>
        <span className="text-sm dark:text-gray-400 text-gray-500 truncate max-w-[50vw]" title={exchange.question}>
          {exchange.question}
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-6 py-2 border-b dark:border-[#2a2b2d] border-gray-200 flex-shrink-0">
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

        <div className="ml-auto flex items-center gap-2">
          {exchange.error && (
            <span className="text-xs text-red-400 truncate max-w-[200px]" title={exchange.error}>
              {exchange.error}
            </span>
          )}

          {activeTab === 'table' && exchange.results && exchange.results.rows.length > 0 && (
            <button
              onClick={handleCsvExport}
              className="p-1.5 rounded-lg dark:text-gray-400 text-gray-500 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 transition-colors cursor-pointer"
              title="Download CSV"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-6">
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

        {activeTab === 'chart' && hasCharts && exchange.results && (
          <div className="h-full">
            <ChartGallery
              chartConfigs={resolvedChartConfigs}
              rows={exchange.results.rows}
              darkMode={darkMode}
            />
          </div>
        )}
      </div>
    </div>
  );
}
