'use client';

import { useCallback, useRef, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { ChartConfig } from './PlotlyChart';
import type { CrossFilter, GlobalFilter } from '@/types/dashboard';
import DashboardChartCard from './DashboardChartCard';
import DashboardFilterBar from './DashboardFilterBar';
import FullscreenChartModal from './FullscreenChartModal';
import { applyClientFilters } from '@/utils/dashboard-filters';
// CSS imported in globals.css
type Layout = { i: string; x: number; y: number; w: number; h: number; minW?: number; minH?: number };

const GridLayout = dynamic(
  () => import('react-grid-layout/legacy').then(mod => {
    const RGL = mod as any;
    return { default: RGL.WidthProvider(RGL.Responsive) };
  }),
  { ssr: false }
) as any;

export interface PinnedChart {
  id: string;
  connection_id: string;
  source_message_id: string | null;
  title: string;
  chart_config: ChartConfig;
  results_snapshot: { rows: Record<string, any>[]; columns: string[]; types?: Record<string, string> };
  display_order: number;
  layout?: { x: number; y: number; w: number; h: number } | null;
  source_sql?: string | null;
  source_question?: string | null;
  auto_refresh_interval?: number;
  last_refreshed_at?: string | null;
  created_at: string;
}

/** Detect if a chart is KPI-eligible: gauge type OR single row with 1-3 numeric columns */
function isKPIChart(pin: PinnedChart): boolean {
  if (pin.chart_config.chartType === 'gauge') return true;
  const rows = pin.results_snapshot.rows;
  if (rows.length !== 1) return false;
  const cols = Object.keys(rows[0]);
  if (cols.length < 1 || cols.length > 3) return false;
  const numericCount = cols.filter(c => typeof rows[0][c] === 'number').length;
  return numericCount >= 1;
}

interface DashboardProps {
  pinnedCharts: PinnedChart[];
  darkMode: boolean;
  onUnpin: (id: string) => void;
  onLayoutChange: (id: string, layout: { x: number; y: number; w: number; h: number }) => void;
  onChangeChartType?: (id: string, newType: string) => void;
  onAddAnnotation?: (id: string, x: number | string, y: number | string, text: string) => void;
  onToggleAnnotations?: (id: string) => void;
  connectionName?: string;
  dashboardTitle?: string;
  dashboardId?: string | null;
  onDashboardTitleChange?: (title: string) => void;
  onRefreshChart?: (id: string) => void;
  onRefreshAll?: () => void;
  refreshingCharts?: Set<string>;
  onAutoRefreshChange?: (id: string, interval: number) => void;
  onChartTitleChange?: (id: string, title: string) => void;
  globalFilters?: GlobalFilter[];
  onGlobalFiltersChange?: (filters: GlobalFilter[]) => void;
  onApplyAndRefresh?: (filters: GlobalFilter[]) => void;
}

export default function Dashboard({
  pinnedCharts, darkMode, onUnpin, onLayoutChange, onChangeChartType, onAddAnnotation,
  onToggleAnnotations, connectionName, dashboardTitle, dashboardId, onDashboardTitleChange,
  onRefreshChart, onRefreshAll, refreshingCharts, onAutoRefreshChange, onChartTitleChange,
  globalFilters, onGlobalFiltersChange, onApplyAndRefresh,
}: DashboardProps) {
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  // Cross-filter state
  const [crossFilter, setCrossFilter] = useState<CrossFilter | null>(null);

  // Fullscreen state
  const [fullscreenChart, setFullscreenChart] = useState<PinnedChart | null>(null);

  const handleLayoutChange = useCallback((layout: Layout[], _allLayouts: any) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      for (const item of layout) {
        const pin = pinnedCharts.find(p => p.id === item.i);
        if (!pin) continue;
        const saved = pin.layout;
        if (!saved || saved.x !== item.x || saved.y !== item.y || saved.w !== item.w || saved.h !== item.h) {
          onLayoutChange(item.i, { x: item.x, y: item.y, w: item.w, h: item.h });
        }
      }
    }, 500);
  }, [pinnedCharts, onLayoutChange]);

  // Cross-filter: filter rows client-side for each chart
  const getFilteredRows = useCallback((pin: PinnedChart): Record<string, any>[] => {
    let rows = pin.results_snapshot.rows;

    // Apply global filters client-side
    if (globalFilters && globalFilters.length > 0) {
      rows = applyClientFilters(rows, globalFilters);
    }

    // Apply cross-filter
    if (crossFilter && crossFilter.sourceChartId !== pin.id) {
      const col = crossFilter.column;
      if (rows.length > 0 && col in rows[0]) {
        rows = rows.filter(r => String(r[col]) === String(crossFilter.value));
      }
    }
    return rows;
  }, [crossFilter, globalFilters]);

  const handleCrossFilter = useCallback((sourceChartId: string, column: string, value: string | number) => {
    // Toggle off if clicking the same filter
    if (crossFilter && crossFilter.sourceChartId === sourceChartId && crossFilter.column === column && String(crossFilter.value) === String(value)) {
      setCrossFilter(null);
    } else {
      setCrossFilter({ sourceChartId, column, value });
    }
  }, [crossFilter]);

  // Dashboard title editing
  const handleTitleDoubleClick = () => {
    setTitleDraft(dashboardTitle || 'Dashboard');
    setEditingTitle(true);
  };

  const handleTitleSave = () => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== dashboardTitle && onDashboardTitleChange) {
      onDashboardTitleChange(trimmed);
    }
  };

  // Compute charts with filtered rows for cross-filter + global filters
  const chartsWithFilteredRows = useMemo(() => {
    return pinnedCharts.map(pin => ({
      pin,
      filteredRows: getFilteredRows(pin),
    }));
  }, [pinnedCharts, getFilteredRows]);

  if (pinnedCharts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full dark:text-gray-500 text-gray-400">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-12 h-12 mx-auto mb-3 opacity-30">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5" />
        </svg>
        <p className="text-sm mb-1">No pinned charts yet</p>
        <p className="text-xs dark:text-gray-600 text-gray-400">Pin charts from query results to build your dashboard</p>
      </div>
    );
  }

  // Build layout from saved positions or auto-arrange
  const buildLayout = (): Layout[] => {
    return pinnedCharts.map((pin, i) => {
      const isKPI = isKPIChart(pin);
      if (pin.layout) {
        return { i: pin.id, x: pin.layout.x, y: pin.layout.y, w: pin.layout.w, h: pin.layout.h, minW: 2, minH: 2 };
      }
      // KPI cards default smaller
      if (isKPI) {
        return { i: pin.id, x: (i % 4) * 3, y: Math.floor(i / 4) * 2, w: 3, h: 2, minW: 2, minH: 2 };
      }
      return { i: pin.id, x: (i % 2) * 6, y: Math.floor(i / 2) * 4, w: 6, h: 4, minW: 2, minH: 2 };
    });
  };

  return (
    <div className="h-full w-full overflow-y-auto p-4">
      {connectionName && (
        <div className="mb-4 flex items-start justify-between">
          <div>
            {editingTitle ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleTitleSave();
                  if (e.key === 'Escape') setEditingTitle(false);
                }}
                className="text-lg font-semibold dark:text-gray-100 text-gray-800 dark:bg-[#1e1f20] bg-gray-100 border dark:border-[#2a2b2d] border-gray-300 rounded-md px-2 py-0.5 outline-none focus:border-purple-500 transition-colors"
              />
            ) : (
              <h2
                className="text-lg font-semibold dark:text-gray-100 text-gray-800 cursor-pointer hover:dark:text-purple-300 hover:text-purple-600 transition-colors"
                onDoubleClick={handleTitleDoubleClick}
                title="Double-click to edit title"
              >
                {dashboardTitle || 'Dashboard'}
              </h2>
            )}
            <p className="text-xs dark:text-gray-500 text-gray-400">{connectionName} — {pinnedCharts.length} pinned chart{pinnedCharts.length !== 1 ? 's' : ''} · Drag to rearrange, resize from corners</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Cross-filter clear pill */}
            {crossFilter && (
              <button
                onClick={() => setCrossFilter(null)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-full bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 transition-colors cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
                Filter: {crossFilter.column} = {String(crossFilter.value)}
              </button>
            )}
            {/* Refresh All */}
            {onRefreshAll && (
              <button
                onClick={onRefreshAll}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg dark:bg-[#1e1f20] bg-white border dark:border-[#2a2b2d] border-gray-200 dark:text-gray-300 text-gray-600 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 transition-colors cursor-pointer shadow-sm flex-shrink-0"
                title="Refresh all charts"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                </svg>
                Refresh All
              </button>
            )}
            {/* Pop Out */}
            <button
              onClick={() => {
                sessionStorage.setItem('dashboard-charts', JSON.stringify({
                  pinnedCharts,
                  connectionName,
                  dashboardTitle: dashboardTitle || 'Dashboard',
                }));
                window.open(
                  '/data-explorer/dashboard',
                  '_blank',
                  'width=1400,height=900,menubar=no,toolbar=no,location=no,status=no'
                );
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg dark:bg-[#1e1f20] bg-white border dark:border-[#2a2b2d] border-gray-200 dark:text-gray-300 text-gray-600 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 transition-colors cursor-pointer shadow-sm flex-shrink-0"
              title="Open dashboard in new window"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              Pop Out
            </button>
          </div>
        </div>
      )}

      {/* Global filter bar */}
      {globalFilters !== undefined && onGlobalFiltersChange && (
        <DashboardFilterBar
          pinnedCharts={pinnedCharts}
          darkMode={darkMode}
          filters={globalFilters || []}
          onFiltersChange={onGlobalFiltersChange}
          onApplyAndRefresh={onApplyAndRefresh}
        />
      )}

      <GridLayout
        className="layout"
        layouts={{ lg: buildLayout() }}
        breakpoints={{ lg: 996, md: 768, sm: 480 }}
        cols={{ lg: 12, md: 8, sm: 4 }}
        rowHeight={80}
        onLayoutChange={handleLayoutChange}
        draggableHandle=".drag-handle"
        isResizable
        isDraggable
        compactType="vertical"
        margin={[16, 16]}
      >
        {chartsWithFilteredRows.map(({ pin, filteredRows }) => (
          <div key={pin.id}>
            <DashboardChartCard
              pin={pin}
              darkMode={darkMode}
              filteredRows={filteredRows}
              isRefreshing={refreshingCharts?.has(pin.id) || false}
              crossFilter={crossFilter}
              onUnpin={onUnpin}
              onChangeChartType={onChangeChartType}
              onAddAnnotation={onAddAnnotation}
              onToggleAnnotations={onToggleAnnotations}
              onRefresh={onRefreshChart}
              onAutoRefreshChange={onAutoRefreshChange}
              onCrossFilter={handleCrossFilter}
              onExpand={setFullscreenChart}
              onTitleChange={onChartTitleChange}
            />
          </div>
        ))}
      </GridLayout>

      {/* Fullscreen modal */}
      {fullscreenChart && (
        <FullscreenChartModal
          pin={fullscreenChart}
          darkMode={darkMode}
          rows={getFilteredRows(fullscreenChart)}
          onClose={() => setFullscreenChart(null)}
        />
      )}
    </div>
  );
}
