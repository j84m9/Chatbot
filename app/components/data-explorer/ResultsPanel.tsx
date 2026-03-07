'use client';

import { useState, useEffect, useRef } from 'react';
import CodeBlock from '@/app/components/CodeBlock';
import type { Exchange } from './QueryChat';
import type { ChartConfig } from './PlotlyChart';

interface ResultsPanelProps {
  exchange: Exchange | null;
  darkMode: boolean;
  onClose?: () => void;
  onRefineSubmit?: (chartIndex: number, instruction: string) => Promise<void>;
  onRefineSql?: () => void;
  onRequestInsights?: () => void;
  onSaveQuery?: (data: { question: string; sql: string; explanation: string | null; chartConfigs: any }) => void;
  onOpenInEditor?: (sql: string) => void;
  onChangeChartType?: (chartIndex: number, newType: string) => void;
  onAddAnnotation?: (chartIndex: number, x: number | string, y: number | string, text: string) => void;
  onToggleAnnotations?: (chartIndex: number) => void;
  onPinChart?: (chartIndex: number) => void;
  onUnpinChart?: (pinnedId: string) => void;
  pinnedSourceMap?: Map<string, string>;
}

// Lazy load chart components since they're heavy
import dynamic from 'next/dynamic';
const ChartGallery = dynamic(() => import('./ChartGallery'), { ssr: false });
const InsightsPanel = dynamic(() => import('./InsightsPanel'), { ssr: false });
import KPICards from './KPICards';
import DataTable from './DataTable';

export default function ResultsPanel({ exchange, darkMode, onClose, onRefineSubmit, onRefineSql, onRequestInsights, onSaveQuery, onOpenInEditor, onChangeChartType, onAddAnnotation, onToggleAnnotations, onPinChart, onUnpinChart, pinnedSourceMap }: ResultsPanelProps) {
  const [activeTab, setActiveTab] = useState<'sql' | 'table' | 'chart' | 'insights'>('sql');
  const prevExchangeKey = useRef<string | null>(null);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveName, setSaveName] = useState('');

  // Auto-select the best tab when exchange changes or finishes loading
  useEffect(() => {
    if (!exchange || exchange.isLoading) return;
    // Track id + loading state so we catch both new exchanges and loading→loaded transitions
    const key = `${exchange.id}:loaded`;
    if (key === prevExchangeKey.current) return;
    prevExchangeKey.current = key;

    const hasCharts = (exchange.chartConfigs && exchange.chartConfigs.length > 0)
      || exchange.chartConfig;

    if (hasCharts && exchange.results) {
      setActiveTab('chart');
    } else if (exchange.results) {
      setActiveTab('table');
    } else {
      setActiveTab('sql');
    }
  }, [exchange]);

  const handlePopOut = () => {
    if (!exchange) return;
    sessionStorage.setItem('report-exchange', JSON.stringify({
      question: exchange.question,
      sql: exchange.sql,
      explanation: exchange.explanation,
      results: exchange.results,
      chartConfig: exchange.chartConfig,
      chartConfigs: exchange.chartConfigs,
      error: exchange.error,
      insights: exchange.insights,
    }));
    window.open(
      '/data-explorer/report',
      '_blank',
      'width=1200,height=800,menubar=no,toolbar=no,location=no,status=no'
    );
  };

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

  if (!exchange || exchange.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full dark:text-gray-500 text-gray-400">
        {exchange?.isLoading ? (
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-4 h-4 animate-orb" style={{ animationDelay: '0ms' }} />
              <div className="w-3 h-3 animate-orb" style={{ animationDelay: '300ms' }} />
              <div className="w-2.5 h-2.5 animate-orb" style={{ animationDelay: '600ms' }} />
            </div>
            <span className="text-sm animate-pulse">{exchange.statusMessage || 'Generating query...'}</span>
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

  // Resolve chart configs: prefer chartConfigs array, fall back to wrapping chartConfig
  const resolvedChartConfigs: ChartConfig[] = exchange.chartConfigs
    ? exchange.chartConfigs
    : exchange.chartConfig
      ? [exchange.chartConfig]
      : [];

  const chartCount = resolvedChartConfigs.length;
  const hasCharts = chartCount > 0 && !!exchange.results;
  const hasResults = !!exchange.results;

  const tabs: { key: 'sql' | 'table' | 'chart' | 'insights'; label: string; available: boolean }[] = [
    { key: 'sql', label: 'SQL', available: !!exchange.sql },
    { key: 'table', label: 'Table', available: hasResults },
    { key: 'chart', label: chartCount > 1 ? `Charts (${chartCount})` : 'Chart', available: hasCharts },
    { key: 'insights', label: 'Insights', available: hasResults },
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

        <div className="ml-auto flex items-center gap-2">
          {exchange.error && (
            <span className="text-xs text-red-400 truncate max-w-[200px]" title={exchange.error}>
              {exchange.error}
            </span>
          )}

          {/* Open in SQL Editor button */}
          {activeTab === 'sql' && exchange.sql && onOpenInEditor && (
            <button
              onClick={() => onOpenInEditor(exchange.sql!)}
              className="p-1.5 rounded-lg dark:text-gray-400 text-gray-500 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 transition-colors cursor-pointer"
              title="Open in SQL Editor"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
              </svg>
            </button>
          )}

          {/* Refine SQL button */}
          {activeTab === 'sql' && exchange.sql && onRefineSql && (
            <button
              onClick={onRefineSql}
              className="px-2 py-1 text-xs rounded-lg dark:text-amber-400 text-amber-600 dark:hover:bg-amber-500/10 hover:bg-amber-50 transition-colors cursor-pointer"
              title="Refine SQL"
            >
              Refine SQL
            </button>
          )}

          {/* CSV download button — visible on Table tab with rows */}
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

          {/* PDF download button */}
          {exchange.results && (
            <button
              onClick={async () => {
                const { exportDataExplorerPdf } = await import('@/utils/data-explorer-export');
                await exportDataExplorerPdf(exchange);
              }}
              className="p-1.5 rounded-lg dark:text-gray-400 text-gray-500 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 transition-colors cursor-pointer"
              title="Download PDF"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
            </button>
          )}

          {/* Save query button */}
          {onSaveQuery && exchange.sql && (
            showSaveInput ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && saveName.trim()) {
                      onSaveQuery({
                        question: exchange.question,
                        sql: exchange.sql!,
                        explanation: exchange.explanation,
                        chartConfigs: exchange.chartConfigs || (exchange.chartConfig ? [exchange.chartConfig] : null),
                      });
                      setShowSaveInput(false);
                      setSaveName('');
                    }
                    if (e.key === 'Escape') {
                      setShowSaveInput(false);
                      setSaveName('');
                    }
                  }}
                  placeholder="Query name..."
                  className="text-xs w-28 dark:bg-[#111213] bg-gray-50 dark:text-gray-200 text-gray-800 border dark:border-[#2a2b2d] border-gray-200 rounded-md px-2 py-1 outline-none focus:border-indigo-500 transition-colors"
                />
                <button
                  onClick={() => {
                    if (saveName.trim()) {
                      onSaveQuery({
                        question: exchange.question,
                        sql: exchange.sql!,
                        explanation: exchange.explanation,
                        chartConfigs: exchange.chartConfigs || (exchange.chartConfig ? [exchange.chartConfig] : null),
                      });
                      setShowSaveInput(false);
                      setSaveName('');
                    }
                  }}
                  disabled={!saveName.trim()}
                  className="p-1 rounded text-xs text-indigo-400 hover:bg-indigo-500/10 disabled:opacity-30 cursor-pointer transition-colors"
                >
                  Save
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSaveInput(true)}
                className="p-1.5 rounded-lg dark:text-amber-400 text-amber-500 dark:hover:bg-amber-500/10 hover:bg-amber-50 transition-colors cursor-pointer"
                title="Save query"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                </svg>
              </button>
            )
          )}

          {/* Pop out to new window */}
          <button
            onClick={handlePopOut}
            className="p-1.5 rounded-lg dark:text-gray-400 text-gray-500 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 transition-colors cursor-pointer"
            title="Open in new window"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </button>

          {/* Close results panel */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg dark:text-gray-400 text-gray-500 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 transition-colors cursor-pointer"
              title="Close results"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'sql' && exchange.sql && (
          <CodeBlock code={exchange.sql} language="sql" />
        )}

        {activeTab === 'table' && exchange.results && (
          <DataTable
            columns={exchange.results.columns}
            rows={exchange.results.rows}
            types={exchange.results.types}
            rowCount={exchange.results.rowCount}
            executionTimeMs={exchange.results.executionTimeMs}
            darkMode={darkMode}
          />
        )}

        {activeTab === 'chart' && hasCharts && exchange.results && (
          <div>
            <KPICards results={exchange.results} darkMode={darkMode} />
            <ChartGallery
              chartConfigs={resolvedChartConfigs}
              rows={exchange.results.rows}
              darkMode={darkMode}
              onRefineSubmit={onRefineSubmit}
              onChangeChartType={onChangeChartType}
              onAddAnnotation={onAddAnnotation}
              onToggleAnnotations={onToggleAnnotations}
              onPinChart={onPinChart}
              onUnpinChart={onUnpinChart}
              pinnedSourceMap={pinnedSourceMap}
              exchangeId={exchange.id}
            />
          </div>
        )}

        {activeTab === 'insights' && exchange.results && (
          <InsightsPanel
            insights={exchange.insights || null}
            isLoading={exchange.insightsLoading}
            onGenerate={onRequestInsights}
            statusMessage={exchange.statusMessage}
          />
        )}
      </div>
    </div>
  );
}
