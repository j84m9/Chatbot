'use client';

import { useState, useEffect, useCallback } from 'react';
import type { PinnedChart } from '@/app/components/data-explorer/Dashboard';
import DashboardChartCard from '@/app/components/data-explorer/DashboardChartCard';
import FullscreenChartModal from '@/app/components/data-explorer/FullscreenChartModal';

export default function DashboardPage() {
  const [pinnedCharts, setPinnedCharts] = useState<PinnedChart[]>([]);
  const [connectionName, setConnectionName] = useState<string>('');
  const [dashboardTitle, setDashboardTitle] = useState<string>('Dashboard');
  const [darkMode, setDarkMode] = useState(true);
  const [fullscreenChart, setFullscreenChart] = useState<PinnedChart | null>(null);

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
        setDashboardTitle(data.dashboardTitle || 'Dashboard');
        document.title = `${data.dashboardTitle || 'Dashboard'} — ${data.connectionName || 'Data Explorer'}`;
      } catch {
        // Invalid data
      }
    }
  }, []);

  const handleDelete = useCallback((id: string) => {
    setPinnedCharts(prev => prev.filter(p => p.id !== id));
  }, []);

  const handleChangeChartType = useCallback((id: string, newType: string) => {
    setPinnedCharts(prev => prev.map(p =>
      p.id === id
        ? { ...p, chart_config: { ...p.chart_config, chartType: newType as any } }
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
          <span className="text-base font-semibold dark:text-gray-100 text-gray-800">{dashboardTitle}</span>
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
          {pinnedCharts.map((pin) => (
            <div key={pin.id} className="h-[380px]">
              <DashboardChartCard
                pin={pin}
                darkMode={darkMode}
                filteredRows={pin.results_snapshot.rows}
                isRefreshing={false}
                crossFilter={null}
                onUnpin={handleDelete}
                onChangeChartType={handleChangeChartType}
                onAddAnnotation={handleAddAnnotation}
                onToggleAnnotations={handleToggleAnnotations}
                onExpand={setFullscreenChart}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Fullscreen modal */}
      {fullscreenChart && (
        <FullscreenChartModal
          pin={fullscreenChart}
          darkMode={darkMode}
          rows={fullscreenChart.results_snapshot.rows}
          onClose={() => setFullscreenChart(null)}
        />
      )}
    </div>
  );
}
