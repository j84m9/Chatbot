'use client';

import { useState, useEffect } from 'react';
import CodeBlock from '@/app/components/CodeBlock';
import dynamic from 'next/dynamic';
import type { ChartConfig } from '@/app/components/data-explorer/PlotlyChart';
import KPICards from '@/app/components/data-explorer/KPICards';
import DataTable from '@/app/components/data-explorer/DataTable';

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
  insights: string | null;
}

export default function ReportPage() {
  const [exchange, setExchange] = useState<ExchangeData | null>(null);
  const [darkMode, setDarkMode] = useState(true);
  const [showSql, setShowSql] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const isDark = saved ? saved === 'dark' : true;
    setDarkMode(isDark);
    document.documentElement.classList.toggle('dark', isDark);

    const raw = sessionStorage.getItem('report-exchange');
    if (raw) {
      try {
        const data: ExchangeData = JSON.parse(raw);
        setExchange(data);
        document.title = data.question || 'Query Report';
      } catch {
        // Invalid data
      }
    }
  }, []);

  if (!exchange) {
    return (
      <div className="flex items-center justify-center h-screen dark:bg-[#0d0d0e] bg-gray-50">
        <p className="dark:text-gray-500 text-gray-400 text-sm">No report data available.</p>
      </div>
    );
  }

  const resolvedChartConfigs: ChartConfig[] = exchange.chartConfigs
    ? exchange.chartConfigs
    : exchange.chartConfig
      ? [exchange.chartConfig]
      : [];

  const hasCharts = resolvedChartConfigs.length > 0 && !!exchange.results;

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
    const blob = new Blob([header + '\n' + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query-results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen dark:bg-[#0d0d0e] bg-gray-50 dark:text-gray-100 text-gray-900 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-8 py-4 border-b dark:border-white/[0.06] border-gray-200/80 dark:bg-[#0d0d0e]/90 bg-gray-50/90 backdrop-blur-xl no-print">
        <div className="flex items-center gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-indigo-400">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5" />
          </svg>
          <span className="text-base font-semibold dark:text-gray-100 text-gray-800">Query Report</span>
        </div>
        <div className="flex items-center gap-2">
          {exchange.results && (
            <button
              onClick={handleCsvExport}
              className="px-3 py-1.5 text-xs rounded-lg dark:bg-[#1e1f20] bg-white border dark:border-[#2a2b2d] border-gray-200 dark:text-gray-300 text-gray-600 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 transition-colors cursor-pointer"
            >
              Export CSV
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 transition-colors cursor-pointer"
          >
            Print
          </button>
        </div>
      </header>

      {/* Dashboard content */}
      <div className="max-w-6xl mx-auto px-8 py-8 space-y-8">
        {/* Question / Title */}
        <div>
          <h1 className="text-2xl font-bold dark:text-gray-100 text-gray-800 mb-2">{exchange.question}</h1>
          {exchange.explanation && (
            <p className="text-sm dark:text-gray-400 text-gray-500">{exchange.explanation}</p>
          )}
          <div className="flex items-center gap-3 mt-3 text-xs dark:text-gray-500 text-gray-400">
            {exchange.results && (
              <>
                <span>{exchange.results.rowCount.toLocaleString()} rows</span>
                <span>{exchange.results.executionTimeMs}ms</span>
              </>
            )}
            <span>{new Date().toLocaleDateString()}</span>
          </div>
        </div>

        {/* KPI Cards */}
        {exchange.results && (
          <KPICards results={exchange.results} darkMode={darkMode} />
        )}

        {/* Charts */}
        {hasCharts && exchange.results && (
          <div className="min-h-[350px]">
            <ChartGallery
              chartConfigs={resolvedChartConfigs}
              rows={exchange.results.rows}
              darkMode={darkMode}
            />
          </div>
        )}

        {/* Data Table */}
        {exchange.results && (
          <div className="print-break">
            <h2 className="text-lg font-semibold dark:text-gray-200 text-gray-700 mb-3">Data</h2>
            <DataTable
              columns={exchange.results.columns}
              rows={exchange.results.rows}
              types={exchange.results.types}
              rowCount={exchange.results.rowCount}
              executionTimeMs={exchange.results.executionTimeMs}
              darkMode={darkMode}
            />
          </div>
        )}

        {/* Insights */}
        {exchange.insights && exchange.insights !== 'Generating insights...' && (
          <div className="print-break">
            <h2 className="text-lg font-semibold dark:text-gray-200 text-gray-700 mb-3">Insights</h2>
            <div className="dark:bg-[#161718] bg-white rounded-xl border dark:border-[#2a2b2d] border-gray-200 p-5">
              <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap dark:text-gray-300 text-gray-600">
                {exchange.insights}
              </div>
            </div>
          </div>
        )}

        {/* SQL (collapsible) */}
        {exchange.sql && (
          <div className="print-break">
            <button
              onClick={() => setShowSql(!showSql)}
              className="flex items-center gap-2 text-sm font-semibold dark:text-gray-300 text-gray-600 mb-3 cursor-pointer hover:text-indigo-400 transition-colors no-print"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-4 h-4 transition-transform ${showSql ? 'rotate-90' : ''}`}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
              SQL Query
            </button>
            {showSql && <CodeBlock code={exchange.sql} language="sql" />}
          </div>
        )}

        {exchange.error && (
          <div className="p-4 rounded-xl border dark:border-red-500/20 border-red-200 dark:bg-red-500/5 bg-red-50">
            <p className="text-sm text-red-400">{exchange.error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
