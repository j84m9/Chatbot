'use client';

import { useCallback, useRef, useState, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { ChartConfig } from './PlotlyChart';
import type { CrossFilter, CrossFilterSet, GlobalFilter, SlicerConfig, DashboardTab } from '@/types/dashboard';
import DashboardChartCard from './DashboardChartCard';
import DashboardSlicerCard from './DashboardSlicerCard';
import FullscreenChartModal from './FullscreenChartModal';
import DashboardInsightsCard from './DashboardInsightsCard';
import DashboardScorecard from './DashboardScorecard';
import DashboardTextCard from './DashboardTextCard';
import { applyClientFilters, detectFilterableColumns } from '@/utils/dashboard-filters';
// CSS imported in globals.css
type Layout = { i: string; x: number; y: number; w: number; h: number; minW?: number; minH?: number };

const ReactGridLayout = dynamic(
  () => import('react-grid-layout/legacy').then(mod => {
    return { default: (mod as any).default || mod };
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
  item_type?: string;
  slicer_config?: SlicerConfig | null;
  dashboard_id?: string | null;
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
  onUpdateSql?: (id: string, sql: string) => void;
  onRefreshAll?: () => void;
  refreshingCharts?: Set<string>;
  onAutoRefreshChange?: (id: string, interval: number) => void;
  onChartTitleChange?: (id: string, title: string) => void;
  globalFilters?: GlobalFilter[];
  onGlobalFiltersChange?: (filters: GlobalFilter[]) => void;
  onApplyAndRefresh?: (filters: GlobalFilter[]) => void;
  // Slicer
  onAddSlicer?: (column: string, filterType: 'multi_select' | 'date_range') => void;
  // Tabs
  dashboards?: DashboardTab[];
  activeDashboardId?: string | null;
  onSwitchTab?: (id: string) => void;
  onCreateTab?: (title: string) => void;
  onDeleteTab?: (id: string) => void;
  onRenameTab?: (id: string, title: string) => void;
  onAutoOrganize?: () => void;
  // New feature props
  onBuildDashboard?: (request: string) => void;
  isBuildingDashboard?: boolean;
  buildProgress?: string;
  onDetectAnomalies?: () => void;
  onExportPdf?: () => void;
  isExportingPdf?: boolean;
  onAddInsightsCard?: () => void;
  onRefreshInsights?: (id: string) => void;
  insightsData?: Map<string, { text: string | null; loading: boolean }>;
  onRefineChart?: (id: string, instruction: string) => Promise<void>;
}

export default function Dashboard({
  pinnedCharts, darkMode, onUnpin, onLayoutChange, onChangeChartType, onAddAnnotation,
  onToggleAnnotations, connectionName, dashboardTitle, dashboardId, onDashboardTitleChange,
  onRefreshChart, onUpdateSql, onRefreshAll, refreshingCharts, onAutoRefreshChange, onChartTitleChange,
  globalFilters, onGlobalFiltersChange, onApplyAndRefresh,
  onAddSlicer, dashboards, activeDashboardId, onSwitchTab, onCreateTab, onDeleteTab, onRenameTab, onAutoOrganize,
  onBuildDashboard, isBuildingDashboard, buildProgress,
  onDetectAnomalies, onExportPdf, isExportingPdf,
  onAddInsightsCard, onRefreshInsights, insightsData,
  onRefineChart,
}: DashboardProps) {
  const [gridWidth, setGridWidth] = useState(0);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const observerRef = useRef<ResizeObserver | null>(null);

  // Callback ref: measures width synchronously on commit, tracks resizes
  const gridContainerCallbackRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (node) {
      setGridWidth(node.clientWidth);
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setGridWidth(entry.contentRect.width);
        }
      });
      observer.observe(node);
      observerRef.current = observer;
    }
  }, []);

  // Animated intro: staggered fade+scale on first render
  const hasAnimated = useRef(false);
  useEffect(() => {
    if (pinnedCharts.length > 0 && !hasAnimated.current) {
      const timer = setTimeout(() => {
        hasAnimated.current = true;
      }, pinnedCharts.length * 80 + 400);
      return () => clearTimeout(timer);
    }
  }, [pinnedCharts.length]);

  // Cross-filter state — multi-dimensional (array of filters, AND logic)
  const [crossFilters, setCrossFilters] = useState<CrossFilterSet>([]);

  // Fullscreen state
  const [fullscreenChart, setFullscreenChart] = useState<PinnedChart | null>(null);

  // Slicer dropdown
  const [showSlicerMenu, setShowSlicerMenu] = useState(false);

  // Tab rename state
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [tabNameDraft, setTabNameDraft] = useState('');

  // Tab "+" menu
  const [showTabMenu, setShowTabMenu] = useState(false);

  // Build Dashboard input
  const [showBuildInput, setShowBuildInput] = useState(false);
  const [buildInputValue, setBuildInputValue] = useState('');

  // Separate charts and slicers
  const chartItems = useMemo(() => pinnedCharts.filter(p => p.item_type !== 'slicer'), [pinnedCharts]);
  const slicerItems = useMemo(() => pinnedCharts.filter(p => p.item_type === 'slicer'), [pinnedCharts]);

  // Detect filterable columns for "Add Slicer" menu
  const { dateColumns, categoricalColumns } = useMemo(
    () => detectFilterableColumns(chartItems),
    [chartItems]
  );
  const allFilterableColumns = useMemo(() => {
    const existing = new Set(slicerItems.map(s => s.slicer_config?.column));
    return [
      ...dateColumns.filter(c => !existing.has(c)).map(c => ({ column: c, type: 'date_range' as const })),
      ...categoricalColumns.filter(c => !existing.has(c)).map(c => ({ column: c, type: 'multi_select' as const })),
    ];
  }, [dateColumns, categoricalColumns, slicerItems]);

  // Save layout changes only on actual user drag/resize — never on mount
  const handleUserLayoutChange = useCallback((layout: Layout[]) => {
    for (const item of layout) {
      const pin = pinnedCharts.find(p => p.id === item.i);
      if (!pin) continue;
      const saved = pin.layout;
      if (!saved || saved.x !== item.x || saved.y !== item.y || saved.w !== item.w || saved.h !== item.h) {
        onLayoutChange(item.i, { x: item.x, y: item.y, w: item.w, h: item.h });
      }
    }
  }, [pinnedCharts, onLayoutChange]);

  // Cross-filter + global filters: filter rows client-side for each chart
  const getFilteredRows = useCallback((pin: PinnedChart): Record<string, any>[] => {
    let rows = pin.results_snapshot.rows;

    // Apply global filters client-side
    if (globalFilters && globalFilters.length > 0) {
      rows = applyClientFilters(rows, globalFilters);
    }

    // Apply multi-dimensional cross-filters (AND logic)
    for (const cf of crossFilters) {
      if (cf.sourceChartId === pin.id) continue; // Don't filter the source chart
      const col = cf.column;
      if (rows.length > 0 && col in rows[0]) {
        rows = rows.filter(r => String(r[col]) === String(cf.value));
      }
    }
    return rows;
  }, [crossFilters, globalFilters]);

  const handleCrossFilter = useCallback((sourceChartId: string, column: string, value: string | number) => {
    setCrossFilters(prev => {
      // Check if this exact filter already exists — if so, remove it (toggle off)
      const existingIdx = prev.findIndex(
        cf => cf.sourceChartId === sourceChartId && cf.column === column && String(cf.value) === String(value)
      );
      if (existingIdx >= 0) {
        return prev.filter((_, i) => i !== existingIdx);
      }
      // Replace any existing filter from the same chart+column with the new value
      const filtered = prev.filter(cf => !(cf.sourceChartId === sourceChartId && cf.column === column));
      return [...filtered, { sourceChartId, column, value }];
    });
  }, []);

  // Slicer filter changes -> update globalFilters
  const handleSlicerFilterChange = useCallback((column: string, update: Partial<GlobalFilter>) => {
    if (!onGlobalFiltersChange) return;
    const current = globalFilters || [];
    const existing = current.find(f => f.column === column);
    if (existing) {
      onGlobalFiltersChange(current.map(f => f.column === column ? { ...f, ...update } : f));
    } else {
      onGlobalFiltersChange([...current, { column, type: 'select', ...update } as GlobalFilter]);
    }
  }, [globalFilters, onGlobalFiltersChange]);

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

  // Tab handlers
  const handleTabDoubleClick = (tabId: string, currentTitle: string) => {
    setRenamingTabId(tabId);
    setTabNameDraft(currentTitle);
  };

  const handleTabRenameSave = () => {
    if (renamingTabId && tabNameDraft.trim() && onRenameTab) {
      onRenameTab(renamingTabId, tabNameDraft.trim());
    }
    setRenamingTabId(null);
  };

  // Compute charts with filtered rows
  const chartsWithFilteredRows = useMemo(() => {
    return chartItems.map(pin => ({
      pin,
      filteredRows: getFilteredRows(pin),
    }));
  }, [chartItems, getFilteredRows]);

  // Memoize layout so react-grid-layout sees a stable reference
  const layout = useMemo((): Layout[] => {
    // Count non-KPI, non-slicer charts for adaptive sizing
    const mainCharts = pinnedCharts.filter(p => p.item_type !== 'slicer' && !isKPIChart(p));
    const mainChartCount = mainCharts.length;

    let mainChartIndex = 0;

    return pinnedCharts.map((pin, i) => {
      const isSlicer = pin.item_type === 'slicer';
      const isKPI = !isSlicer && isKPIChart(pin);
      if (pin.layout) {
        return { i: pin.id, x: pin.layout.x, y: pin.layout.y, w: pin.layout.w, h: pin.layout.h, minW: 2, minH: 2 };
      }
      if (isSlicer) {
        return { i: pin.id, x: (i % 4) * 3, y: Math.floor(i / 4) * 3, w: 3, h: 3, minW: 2, minH: 2 };
      }
      if (isKPI) {
        return { i: pin.id, x: (i % 4) * 3, y: Math.floor(i / 4) * 2, w: 3, h: 2, minW: 2, minH: 2 };
      }

      // Adaptive layout for main charts
      let w: number;
      if (mainChartCount === 1) {
        w = 12; // Full width
      } else if (mainChartCount === 2) {
        w = 6; // Half width each
      } else {
        // 3+ charts: first 2 at half, rest at third
        w = mainChartIndex < 2 ? 6 : 4;
      }

      const x = mainChartIndex < 2
        ? (mainChartIndex % 2) * 6
        : ((mainChartIndex - 2) % 3) * 4;
      const y = mainChartIndex < 2
        ? Math.floor(mainChartIndex / 2) * 4
        : 4 + Math.floor((mainChartIndex - 2) / 3) * 4;

      mainChartIndex++;
      return { i: pin.id, x, y, w, h: 4, minW: 2, minH: 2 };
    });
  }, [pinnedCharts]);

  if (pinnedCharts.length === 0) {
    return (
      <div className="h-full w-full overflow-y-auto p-4">
        {/* Tab bar even when empty */}
        {dashboards && dashboards.length > 0 && (
          <TabBar
            dashboards={dashboards}
            activeDashboardId={activeDashboardId}
            renamingTabId={renamingTabId}
            tabNameDraft={tabNameDraft}
            showTabMenu={showTabMenu}
            onSwitchTab={onSwitchTab}
            onDoubleClick={handleTabDoubleClick}
            onRenameSave={handleTabRenameSave}
            onTabNameDraftChange={setTabNameDraft}
            setRenamingTabId={setRenamingTabId}
            onDeleteTab={onDeleteTab}
            onCreateTab={onCreateTab}
            onAutoOrganize={onAutoOrganize}
            setShowTabMenu={setShowTabMenu}
            chartCount={chartItems.length}
          />
        )}
        <div className="flex flex-col items-center justify-center h-full w-full dark:text-gray-500 text-gray-400">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-12 h-12 mx-auto mb-3 opacity-30">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5" />
          </svg>
          <p className="text-sm mb-1">No pinned charts yet</p>
          <p className="text-xs dark:text-gray-600 text-gray-400 mb-4">Pin charts from query results or let AI build a dashboard for you</p>
          {onBuildDashboard && (
            showBuildInput ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={buildInputValue}
                  onChange={e => setBuildInputValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && buildInputValue.trim()) {
                      onBuildDashboard(buildInputValue.trim());
                      setShowBuildInput(false);
                      setBuildInputValue('');
                    }
                    if (e.key === 'Escape') { setShowBuildInput(false); setBuildInputValue(''); }
                  }}
                  placeholder="e.g. Build me a sales dashboard..."
                  className="text-sm dark:bg-[#1e1f20] bg-gray-100 border dark:border-[#2a2b2d] border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-purple-500 dark:text-gray-200 text-gray-700 w-72 transition-colors"
                />
                <button
                  onClick={() => { if (buildInputValue.trim()) { onBuildDashboard(buildInputValue.trim()); setShowBuildInput(false); setBuildInputValue(''); } }}
                  disabled={!buildInputValue.trim()}
                  className="px-4 py-2 text-sm rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600 disabled:opacity-30 cursor-pointer transition-all shadow-md"
                >
                  Build
                </button>
                <button
                  onClick={() => { setShowBuildInput(false); setBuildInputValue(''); }}
                  className="px-3 py-2 text-sm rounded-lg dark:text-gray-400 text-gray-500 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 cursor-pointer transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowBuildInput(true)}
                disabled={isBuildingDashboard}
                className="flex items-center gap-2 px-5 py-2.5 text-sm rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600 transition-all cursor-pointer shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 disabled:opacity-50"
              >
                {isBuildingDashboard ? (
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
                  </svg>
                )}
                {isBuildingDashboard ? buildProgress || 'Building...' : 'Build Dashboard with AI'}
              </button>
            )
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={gridContainerCallbackRef} className="h-full w-full overflow-y-auto p-4">
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
            <p className="text-xs dark:text-gray-500 text-gray-400">{connectionName} — {chartItems.length} chart{chartItems.length !== 1 ? 's' : ''}{slicerItems.length > 0 ? `, ${slicerItems.length} slicer${slicerItems.length !== 1 ? 's' : ''}` : ''} · Drag to rearrange, resize from corners</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Cross-filter pills */}
            {crossFilters.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                {crossFilters.map((cf, i) => (
                  <button
                    key={`${cf.column}-${cf.value}-${i}`}
                    onClick={() => setCrossFilters(prev => prev.filter((_, idx) => idx !== i))}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-full bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 transition-colors cursor-pointer"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                    {cf.column} = {String(cf.value)}
                  </button>
                ))}
                {crossFilters.length > 1 && (
                  <button
                    onClick={() => setCrossFilters([])}
                    className="px-2 py-1 text-[10px] rounded-full dark:text-gray-500 text-gray-400 dark:hover:text-gray-300 hover:text-gray-600 transition-colors cursor-pointer"
                  >
                    Clear all
                  </button>
                )}
              </div>
            )}

            {/* Build Dashboard */}
            {onBuildDashboard && (
              showBuildInput ? (
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    value={buildInputValue}
                    onChange={e => setBuildInputValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && buildInputValue.trim()) {
                        onBuildDashboard(buildInputValue.trim());
                        setShowBuildInput(false);
                        setBuildInputValue('');
                      }
                      if (e.key === 'Escape') { setShowBuildInput(false); setBuildInputValue(''); }
                    }}
                    placeholder="e.g. Build me a sales dashboard..."
                    className="text-xs dark:bg-[#1e1f20] bg-gray-100 border dark:border-[#2a2b2d] border-gray-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-purple-500 dark:text-gray-200 text-gray-700 w-64 transition-colors"
                  />
                  <button
                    onClick={() => { if (buildInputValue.trim()) { onBuildDashboard(buildInputValue.trim()); setShowBuildInput(false); setBuildInputValue(''); } }}
                    disabled={!buildInputValue.trim()}
                    className="px-2.5 py-1.5 text-xs rounded-lg bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-30 cursor-pointer transition-colors"
                  >
                    Build
                  </button>
                  <button
                    onClick={() => { setShowBuildInput(false); setBuildInputValue(''); }}
                    className="px-2 py-1.5 text-xs rounded-lg dark:text-gray-400 text-gray-500 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowBuildInput(true)}
                  disabled={isBuildingDashboard}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600 transition-all cursor-pointer shadow-sm shadow-purple-500/20 hover:shadow-purple-500/30 flex-shrink-0 disabled:opacity-50"
                  title="Build a dashboard using AI"
                >
                  {isBuildingDashboard ? (
                    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
                    </svg>
                  )}
                  {isBuildingDashboard ? buildProgress || 'Building...' : 'Build Dashboard'}
                </button>
              )
            )}

            {/* Detect Anomalies */}
            {onDetectAnomalies && chartItems.length > 0 && (
              <button
                onClick={onDetectAnomalies}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg dark:bg-amber-500/10 bg-amber-50 border dark:border-amber-500/20 border-amber-200 dark:text-amber-300 text-amber-600 dark:hover:bg-amber-500/20 hover:bg-amber-100 transition-colors cursor-pointer shadow-sm flex-shrink-0"
                title="Detect statistical anomalies"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                Anomalies
              </button>
            )}

            {/* Export PDF */}
            {onExportPdf && chartItems.length > 0 && (
              <button
                onClick={onExportPdf}
                disabled={isExportingPdf}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg dark:bg-blue-500/10 bg-blue-50 border dark:border-blue-500/20 border-blue-200 dark:text-blue-300 text-blue-600 dark:hover:bg-blue-500/20 hover:bg-blue-100 transition-colors cursor-pointer shadow-sm flex-shrink-0 disabled:opacity-50"
                title="Export dashboard as PDF"
              >
                {isExportingPdf ? (
                  <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                )}
                {isExportingPdf ? 'Exporting...' : 'Export PDF'}
              </button>
            )}

            {/* Add Insights */}
            {onAddInsightsCard && chartItems.length > 0 && (
              <button
                onClick={onAddInsightsCard}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg dark:bg-emerald-500/10 bg-emerald-50 border dark:border-emerald-500/20 border-emerald-200 dark:text-emerald-300 text-emerald-600 dark:hover:bg-emerald-500/20 hover:bg-emerald-100 transition-colors cursor-pointer shadow-sm flex-shrink-0"
                title="Add AI insights card"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                </svg>
                Insights
              </button>
            )}

            {/* Add Slicer */}
            {onAddSlicer && allFilterableColumns.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowSlicerMenu(!showSlicerMenu)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg dark:bg-cyan-500/10 bg-cyan-50 border dark:border-cyan-500/20 border-cyan-200 dark:text-cyan-300 text-cyan-600 dark:hover:bg-cyan-500/20 hover:bg-cyan-100 transition-colors cursor-pointer shadow-sm flex-shrink-0"
                  title="Add a slicer filter widget"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />
                  </svg>
                  Add Slicer
                </button>
                {showSlicerMenu && (
                  <div className="absolute right-0 top-full mt-1 z-30 dark:bg-[#1e1f20] bg-white border dark:border-[#2a2b2d] border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px] max-h-[300px] overflow-y-auto">
                    {allFilterableColumns.map(({ column, type }) => (
                      <button
                        key={column}
                        onClick={() => {
                          onAddSlicer(column, type);
                          setShowSlicerMenu(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs hover:dark:bg-[#2a2b2d] hover:bg-gray-100 transition-colors cursor-pointer dark:text-gray-300 text-gray-600 flex items-center gap-2"
                      >
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${type === 'date_range' ? 'bg-blue-500/15 text-blue-400' : 'bg-purple-500/15 text-purple-400'}`}>
                          {type === 'date_range' ? 'Date' : 'Select'}
                        </span>
                        {column.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Refresh All */}
            {onRefreshAll && (
              <button
                onClick={onRefreshAll}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg dark:bg-teal-500/10 bg-teal-50 border dark:border-teal-500/20 border-teal-200 dark:text-teal-300 text-teal-600 dark:hover:bg-teal-500/20 hover:bg-teal-100 transition-colors cursor-pointer shadow-sm flex-shrink-0"
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

      {/* Tab bar */}
      {dashboards && dashboards.length > 0 && (
        <TabBar
          dashboards={dashboards}
          activeDashboardId={activeDashboardId}
          renamingTabId={renamingTabId}
          tabNameDraft={tabNameDraft}
          showTabMenu={showTabMenu}
          onSwitchTab={onSwitchTab}
          onDoubleClick={handleTabDoubleClick}
          onRenameSave={handleTabRenameSave}
          onTabNameDraftChange={setTabNameDraft}
          setRenamingTabId={setRenamingTabId}
          onDeleteTab={onDeleteTab}
          onCreateTab={onCreateTab}
          onAutoOrganize={onAutoOrganize}
          setShowTabMenu={setShowTabMenu}
          chartCount={chartItems.length}
        />
      )}

      {gridWidth > 0 && <ReactGridLayout
        className="layout"
        layout={layout}
        cols={12}
        width={gridWidth}
        rowHeight={80}
        onDragStop={(layout: Layout[]) => handleUserLayoutChange(layout)}
        onResizeStop={(layout: Layout[]) => handleUserLayoutChange(layout)}
        draggableHandle=".drag-handle"
        isResizable
        resizeHandles={['s', 'e', 'se']}
        isDraggable
        compactType="vertical"
        margin={[16, 16] as [number, number]}
      >
        {pinnedCharts.map((pin, i) => (
          <div key={pin.id} className={!hasAnimated.current ? 'animate-chart-enter' : ''} style={!hasAnimated.current ? { animationDelay: `${i * 80}ms` } : undefined}>
            {pin.item_type === 'slicer' && pin.slicer_config ? (
              <DashboardSlicerCard
                pin={pin}
                darkMode={darkMode}
                slicerConfig={pin.slicer_config}
                currentFilter={(globalFilters || []).find(f => f.column === pin.slicer_config!.column)}
                allCharts={chartItems}
                onFilterChange={handleSlicerFilterChange}
                onUnpin={onUnpin}
              />
            ) : pin.item_type === 'insights' ? (
              <DashboardInsightsCard
                insightText={insightsData?.get(pin.id)?.text ?? null}
                isLoading={insightsData?.get(pin.id)?.loading ?? false}
                darkMode={darkMode}
                onRefresh={() => onRefreshInsights?.(pin.id)}
                onUnpin={() => onUnpin(pin.id)}
              />
            ) : pin.item_type === 'scorecard' ? (
              <DashboardScorecard
                pin={pin}
                darkMode={darkMode}
                rows={chartsWithFilteredRows.find(c => c.pin.id === pin.id)?.filteredRows || pin.results_snapshot.rows}
                onUnpin={onUnpin}
              />
            ) : pin.item_type === 'text' ? (
              <DashboardTextCard
                pin={pin}
                darkMode={darkMode}
                onUnpin={onUnpin}
              />
            ) : (
              <DashboardChartCard
                pin={pin}
                darkMode={darkMode}
                filteredRows={chartsWithFilteredRows.find(c => c.pin.id === pin.id)?.filteredRows || pin.results_snapshot.rows}
                isRefreshing={refreshingCharts?.has(pin.id) || false}
                crossFilters={crossFilters}
                onUnpin={onUnpin}
                onChangeChartType={onChangeChartType}
                onAddAnnotation={onAddAnnotation}
                onToggleAnnotations={onToggleAnnotations}
                onRefresh={onRefreshChart}
                onUpdateSql={onUpdateSql}
                onAutoRefreshChange={onAutoRefreshChange}
                onCrossFilter={handleCrossFilter}
                onExpand={setFullscreenChart}
                onTitleChange={onChartTitleChange}
                onRefineChart={onRefineChart}
              />
            )}
          </div>
        ))}
      </ReactGridLayout>}

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

/** Tab bar sub-component */
function TabBar({
  dashboards, activeDashboardId, renamingTabId, tabNameDraft, showTabMenu,
  onSwitchTab, onDoubleClick, onRenameSave, onTabNameDraftChange, setRenamingTabId,
  onDeleteTab, onCreateTab, onAutoOrganize, setShowTabMenu, chartCount,
}: {
  dashboards: DashboardTab[];
  activeDashboardId?: string | null;
  renamingTabId: string | null;
  tabNameDraft: string;
  showTabMenu: boolean;
  onSwitchTab?: (id: string) => void;
  onDoubleClick: (id: string, title: string) => void;
  onRenameSave: () => void;
  onTabNameDraftChange: (v: string) => void;
  setRenamingTabId: (id: string | null) => void;
  onDeleteTab?: (id: string) => void;
  onCreateTab?: (title: string) => void;
  onAutoOrganize?: () => void;
  setShowTabMenu: (v: boolean) => void;
  chartCount: number;
}) {
  return (
    <div className="flex items-center gap-1 mb-3 border-b dark:border-[#2a2b2d] border-gray-200 pb-0">
      {dashboards.map(tab => (
        <div key={tab.id} className="relative group flex items-center">
          {renamingTabId === tab.id ? (
            <input
              autoFocus
              value={tabNameDraft}
              onChange={e => onTabNameDraftChange(e.target.value)}
              onBlur={onRenameSave}
              onKeyDown={e => {
                if (e.key === 'Enter') onRenameSave();
                if (e.key === 'Escape') setRenamingTabId(null);
              }}
              className="text-xs px-3 py-1.5 dark:bg-[#1e1f20] bg-gray-100 border dark:border-[#2a2b2d] border-gray-300 rounded-t-md outline-none focus:border-purple-500 dark:text-gray-200 text-gray-700 min-w-[60px]"
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <button
              onClick={() => onSwitchTab?.(tab.id)}
              onDoubleClick={() => onDoubleClick(tab.id, tab.title)}
              className={`text-xs px-3 py-1.5 rounded-t-md transition-colors cursor-pointer border-b-2 ${
                tab.id === activeDashboardId
                  ? 'dark:text-purple-300 text-purple-600 border-purple-500 dark:bg-purple-500/5 bg-purple-50'
                  : 'dark:text-gray-500 text-gray-400 border-transparent dark:hover:text-gray-300 hover:text-gray-600 dark:hover:bg-[#1e1f20] hover:bg-gray-50'
              }`}
              title="Double-click to rename"
            >
              {tab.title}
            </button>
          )}
          {/* Delete tab X */}
          {onDeleteTab && (
            <button
              onClick={() => onDeleteTab(tab.id)}
              className="p-0.5 rounded dark:text-gray-600 text-gray-300 dark:hover:text-red-400 hover:text-red-500 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
              title="Delete tab"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      ))}

      {/* "+" button with dropdown */}
      {onCreateTab && (
        <div className="relative">
          <button
            onClick={() => onCreateTab('New Tab')}
            className="p-1 rounded dark:text-gray-600 text-gray-300 dark:hover:text-gray-300 hover:text-gray-600 transition-colors cursor-pointer"
            title="New tab"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
          {showTabMenu && (
            <div className="absolute left-0 top-full mt-1 z-30 dark:bg-[#1e1f20] bg-white border dark:border-[#2a2b2d] border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px]">
              <button
                onClick={() => {
                  onCreateTab('New Tab');
                  setShowTabMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs hover:dark:bg-[#2a2b2d] hover:bg-gray-100 transition-colors cursor-pointer dark:text-gray-300 text-gray-600 flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                New Tab
              </button>
              {onAutoOrganize && chartCount > 2 && (
                <button
                  onClick={() => {
                    onAutoOrganize();
                    setShowTabMenu(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:dark:bg-[#2a2b2d] hover:bg-gray-100 transition-colors cursor-pointer dark:text-gray-300 text-gray-600 flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
                  </svg>
                  Auto-organize
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
