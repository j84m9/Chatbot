'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { ChartConfig } from '@/app/components/data-explorer/PlotlyChart';
import ChartTypeSwitcher from '@/app/components/data-explorer/ChartTypeSwitcher';

const PlotlyChart = dynamic(() => import('@/app/components/data-explorer/PlotlyChart'), { ssr: false });

interface PinnedChart {
  id: string;
  title: string;
  chart_config: ChartConfig;
  results_snapshot: { rows: Record<string, any>[]; columns: string[]; types?: Record<string, string> };
}

export default function DashboardPage() {
  const [pinnedCharts, setPinnedCharts] = useState<PinnedChart[]>([]);
  const [connectionName, setConnectionName] = useState<string>('');
  const [darkMode, setDarkMode] = useState(true);

  // Per-card UI state
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [annotatingCard, setAnnotatingCard] = useState<string | null>(null);
  const [pendingAnnotation, setPendingAnnotation] = useState<{ cardId: string; x: number | string; y: number | string } | null>(null);
  const [annotationText, setAnnotationText] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const isDark = saved ? saved === 'dark' : true;
    setDarkMode(isDark);
    document.documentElement.classList.toggle('dark', isDark);

    const raw = sessionStorage.getItem('dashboard-charts');
    if (raw) {
      try {
        const data = JSON.parse(raw);
        setPinnedCharts(data.pinnedCharts || []);
        setConnectionName(data.connectionName || '');
        document.title = `Dashboard — ${data.connectionName || 'Data Explorer'}`;
      } catch {
        // Invalid data
      }
    }
  }, []);

  const handleDelete = useCallback((id: string) => {
    setPinnedCharts(prev => prev.filter(p => p.id !== id));
    if (expandedCard === id) setExpandedCard(null);
    if (annotatingCard === id) {
      setAnnotatingCard(null);
      setPendingAnnotation(null);
    }
  }, [expandedCard, annotatingCard]);

  const handleChangeChartType = useCallback((id: string, newType: string) => {
    setPinnedCharts(prev => prev.map(p =>
      p.id === id
        ? { ...p, chart_config: { ...p.chart_config, chartType: newType as ChartConfig['chartType'] } }
        : p
    ));
  }, []);

  const handleToggleAnnotations = useCallback((id: string) => {
    setPinnedCharts(prev => prev.map(p =>
      p.id === id
        ? { ...p, chart_config: { ...p.chart_config, showAnnotations: p.chart_config.showAnnotations === false ? true : false } }
        : p
    ));
  }, []);

  const handleAddAnnotation = useCallback((id: string, x: number | string, y: number | string, text: string) => {
    setPinnedCharts(prev => prev.map(p => {
      if (p.id !== id) return p;
      const existing = p.chart_config.annotations || [];
      return {
        ...p,
        chart_config: {
          ...p.chart_config,
          annotations: [...existing, { id: crypto.randomUUID(), x, y, text }],
          showAnnotations: true,
        },
      };
    }));
  }, []);

  const handleChartClick = (cardId: string, x: number | string, y: number | string) => {
    if (annotatingCard !== cardId) return;
    setPendingAnnotation({ cardId, x, y });
    setAnnotationText('');
  };

  const handleAnnotationSave = () => {
    if (!pendingAnnotation || !annotationText.trim()) return;
    handleAddAnnotation(pendingAnnotation.cardId, pendingAnnotation.x, pendingAnnotation.y, annotationText.trim());
    setPendingAnnotation(null);
    setAnnotationText('');
  };

  const handleAnnotationCancel = () => {
    setPendingAnnotation(null);
    setAnnotationText('');
  };

  if (pinnedCharts.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen dark:bg-[#0d0d0e] bg-gray-50">
        <p className="dark:text-gray-500 text-gray-400 text-sm">No dashboard data available.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen dark:bg-[#0d0d0e] bg-gray-50 dark:text-gray-100 text-gray-900 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-8 py-4 border-b dark:border-white/[0.06] border-gray-200/80 dark:bg-[#0d0d0e]/90 bg-gray-50/90 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-purple-400">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5" />
          </svg>
          <span className="text-base font-semibold dark:text-gray-100 text-gray-800">Dashboard</span>
          {connectionName && (
            <span className="text-xs dark:text-gray-500 text-gray-400">— {connectionName}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs dark:text-gray-500 text-gray-400">{pinnedCharts.length} chart{pinnedCharts.length !== 1 ? 's' : ''}</span>
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 text-xs rounded-lg bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 transition-colors cursor-pointer"
          >
            Print
          </button>
        </div>
      </header>

      {/* Chart grid */}
      <div className="max-w-7xl mx-auto px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {pinnedCharts.map((pin) => {
            const columns = pin.results_snapshot.rows.length > 0 ? Object.keys(pin.results_snapshot.rows[0]) : [];
            const isAnnotating = annotatingCard === pin.id;
            const hasPending = pendingAnnotation?.cardId === pin.id;
            const hasAnnotations = pin.chart_config.annotations && pin.chart_config.annotations.length > 0;

            return (
              <div
                key={pin.id}
                className="group border dark:border-[#2a2b2d] border-gray-200 rounded-xl overflow-hidden dark:bg-[#111213] bg-white flex flex-col"
              >
                {/* Card header */}
                <div className="flex items-center gap-2 px-3 py-2 border-b dark:border-[#2a2b2d]/50 border-gray-100 flex-shrink-0">
                  <h3 className="text-xs font-medium dark:text-gray-200 text-gray-700 truncate flex-1">{pin.title}</h3>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Chart type toggle */}
                    <button
                      onClick={() => setExpandedCard(expandedCard === pin.id ? null : pin.id)}
                      className={`p-1 rounded-md transition-colors cursor-pointer ${
                        expandedCard === pin.id
                          ? 'bg-purple-500/20 text-purple-400'
                          : 'dark:text-gray-500 text-gray-400 hover:dark:text-gray-300 hover:text-gray-600'
                      }`}
                      title="Change chart type"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13h2v8H3zm6-4h2v12H9zm6-6h2v18h-2zm6 10h2v8h-2z" />
                      </svg>
                    </button>

                    {/* Annotate */}
                    <button
                      onClick={() => {
                        if (isAnnotating) {
                          setAnnotatingCard(null);
                          setPendingAnnotation(null);
                          setAnnotationText('');
                        } else {
                          setAnnotatingCard(pin.id);
                        }
                      }}
                      className={`p-1 rounded-md transition-colors cursor-pointer ${
                        isAnnotating
                          ? 'bg-purple-500/20 text-purple-400'
                          : 'dark:text-gray-500 text-gray-400 hover:dark:text-gray-300 hover:text-gray-600'
                      }`}
                      title={isAnnotating ? 'Exit annotate mode' : 'Annotate chart'}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                      </svg>
                    </button>

                    {/* Toggle annotations visibility */}
                    {hasAnnotations && (
                      <button
                        onClick={() => handleToggleAnnotations(pin.id)}
                        className="p-1 rounded-md dark:text-gray-500 text-gray-400 hover:dark:text-gray-300 hover:text-gray-600 transition-colors cursor-pointer"
                        title={pin.chart_config.showAnnotations === false ? 'Show annotations' : 'Hide annotations'}
                      >
                        {pin.chart_config.showAnnotations === false ? (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                          </svg>
                        )}
                      </button>
                    )}

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(pin.id)}
                      className="p-1 rounded-md dark:text-gray-500 text-gray-400 dark:hover:text-red-400 hover:text-red-500 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                      title="Remove chart"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Chart type switcher (expandable) */}
                {expandedCard === pin.id && (
                  <div className="px-3 py-1.5 border-b dark:border-[#2a2b2d]/50 border-gray-100">
                    <ChartTypeSwitcher
                      currentType={pin.chart_config.chartType}
                      rows={pin.results_snapshot.rows}
                      columns={columns}
                      onChangeType={(t) => handleChangeChartType(pin.id, t)}
                    />
                  </div>
                )}

                {/* Annotate hint */}
                {isAnnotating && !hasPending && (
                  <div className="flex items-center gap-2 px-3 py-1.5 border-b dark:border-[#2a2b2d]/50 border-gray-100 bg-purple-500/10">
                    <span className="relative flex h-2 w-2 flex-shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500" />
                    </span>
                    <span className="text-[11px] dark:text-purple-300 text-purple-600">Click a data point to annotate</span>
                  </div>
                )}

                {/* Annotation text input */}
                {hasPending && (
                  <div className="flex items-center gap-1 px-3 py-1.5 border-b dark:border-[#2a2b2d]/50 border-gray-100">
                    <input
                      autoFocus
                      value={annotationText}
                      onChange={e => setAnnotationText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && annotationText.trim()) handleAnnotationSave();
                        if (e.key === 'Escape') handleAnnotationCancel();
                      }}
                      placeholder="Annotation text..."
                      className="text-xs flex-1 dark:bg-[#111213] bg-gray-50 dark:text-gray-200 text-gray-800 border dark:border-[#2a2b2d] border-gray-200 rounded-md px-2 py-1 outline-none focus:border-purple-500 transition-colors"
                    />
                    <button
                      onClick={handleAnnotationSave}
                      disabled={!annotationText.trim()}
                      className="px-2 py-1 text-xs rounded-md bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-30 cursor-pointer transition-colors"
                    >
                      Add
                    </button>
                    <button
                      onClick={handleAnnotationCancel}
                      className="px-2 py-1 text-xs rounded-md dark:text-gray-400 text-gray-500 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 cursor-pointer transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* Chart */}
                <div className="h-[320px]">
                  <PlotlyChart
                    chartConfig={pin.chart_config}
                    rows={pin.results_snapshot.rows}
                    darkMode={darkMode}
                    hideTitle
                    annotationMode={isAnnotating}
                    onChartClick={(x, y) => handleChartClick(pin.id, x, y)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
