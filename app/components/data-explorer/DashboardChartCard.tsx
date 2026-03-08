'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { PinnedChart } from './Dashboard';
import type { CrossFilter } from '@/types/dashboard';
import ChartTypeSwitcher from './ChartTypeSwitcher';
import DashboardKPICard from './DashboardKPICard';

const PlotlyChart = dynamic(() => import('./PlotlyChart'), { ssr: false });

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

/** Format relative time */
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const AUTO_REFRESH_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '5m', value: 300 },
  { label: '15m', value: 900 },
];

interface DashboardChartCardProps {
  pin: PinnedChart;
  darkMode: boolean;
  filteredRows: Record<string, any>[];
  isRefreshing: boolean;
  crossFilter: CrossFilter | null;
  onUnpin: (id: string) => void;
  onChangeChartType?: (id: string, newType: string) => void;
  onAddAnnotation?: (id: string, x: number | string, y: number | string, text: string) => void;
  onToggleAnnotations?: (id: string) => void;
  onRefresh?: (id: string) => void;
  onAutoRefreshChange?: (id: string, interval: number) => void;
  onCrossFilter?: (sourceChartId: string, column: string, value: string | number) => void;
  onExpand?: (pin: PinnedChart) => void;
  onTitleChange?: (id: string, title: string) => void;
  onUpdateSql?: (id: string, sql: string) => void;
}

export default function DashboardChartCard({
  pin, darkMode, filteredRows, isRefreshing, crossFilter,
  onUnpin, onChangeChartType, onAddAnnotation, onToggleAnnotations,
  onRefresh, onAutoRefreshChange, onCrossFilter, onExpand, onTitleChange, onUpdateSql,
}: DashboardChartCardProps) {
  const [expandedCard, setExpandedCard] = useState(false);
  const [annotatingCard, setAnnotatingCard] = useState(false);
  const [pendingAnnotation, setPendingAnnotation] = useState<{ x: number | string; y: number | string } | null>(null);
  const [annotationText, setAnnotationText] = useState('');
  const [showRefreshMenu, setShowRefreshMenu] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [justRefreshed, setJustRefreshed] = useState(false);
  const [showSqlEditor, setShowSqlEditor] = useState(false);
  const [sqlDraft, setSqlDraft] = useState('');
  const sqlContainerRef = useRef<HTMLDivElement>(null);
  const sqlViewRef = useRef<any>(null);
  const wasRefreshing = useRef(false);

  // Glow on refresh completion
  useEffect(() => {
    if (wasRefreshing.current && !isRefreshing) {
      setJustRefreshed(true);
      const timer = setTimeout(() => setJustRefreshed(false), 1500);
      return () => clearTimeout(timer);
    }
    wasRefreshing.current = isRefreshing;
  }, [isRefreshing]);

  const columns = filteredRows.length > 0 ? Object.keys(filteredRows[0]) : (pin.results_snapshot.columns || []);
  const hasAnnotations = pin.chart_config.annotations && pin.chart_config.annotations.length > 0;
  const isKPI = isKPIChart(pin);
  const isSourceChart = crossFilter?.sourceChartId === pin.id;
  const isFiltered = crossFilter && !isSourceChart && filteredRows.length < pin.results_snapshot.rows.length;
  const canRefresh = !!pin.source_sql;

  // Click handler: annotate mode or cross-filter
  const handleChartClick = useCallback((x: number | string, y: number | string) => {
    if (annotatingCard) {
      setPendingAnnotation({ x, y });
      setAnnotationText('');
      return;
    }

    // Default: cross-filter
    if (onCrossFilter) {
      const col = pin.chart_config.xColumn;
      onCrossFilter(pin.id, col, x);
    }
  }, [annotatingCard, pin, onCrossFilter]);

  const handleTitleDoubleClick = () => {
    if (!onTitleChange) return;
    setTitleDraft(pin.title);
    setEditingTitle(true);
  };

  const handleTitleSave = () => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== pin.title && onTitleChange) {
      onTitleChange(pin.id, trimmed);
    }
  };

  return (
    <div className={`group h-full border rounded-xl overflow-hidden flex flex-col ${
      isSourceChart ? 'ring-2 ring-purple-500 dark:border-purple-500/50 border-purple-300' : 'dark:border-[#2a2b2d] border-gray-200'
    } dark:bg-[#111213] bg-white ${justRefreshed ? 'animate-refresh-glow' : ''}`}>
      {/* Loading overlay */}
      {isRefreshing && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 backdrop-blur-[1px] rounded-xl">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg dark:bg-[#1e1f20] bg-white shadow-lg">
            <svg className="animate-spin w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-xs dark:text-gray-300 text-gray-600">Refreshing...</span>
          </div>
        </div>
      )}

      {/* Card header */}
      <div className="drag-handle flex items-center gap-2 px-3 py-1.5 cursor-grab active:cursor-grabbing border-b dark:border-[#2a2b2d]/50 border-gray-100 flex-shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 dark:text-gray-600 text-gray-300 flex-shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
        </svg>

        {/* Green pulse dot for auto-refresh */}
        {pin.auto_refresh_interval && pin.auto_refresh_interval > 0 && (
          <span className="relative flex h-2 w-2 flex-shrink-0" title={`Auto-refreshing every ${pin.auto_refresh_interval}s`}>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
        )}

        {/* Editable title */}
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
            onClick={e => e.stopPropagation()}
            className="text-xs font-medium dark:text-gray-300 text-gray-700 flex-1 dark:bg-[#1e1f20] bg-gray-100 border dark:border-[#2a2b2d] border-gray-300 rounded px-1.5 py-0.5 outline-none focus:border-purple-500 transition-colors"
          />
        ) : (
          <h3
            className="text-xs font-medium dark:text-gray-300 text-gray-700 truncate flex-1 cursor-pointer"
            onDoubleClick={handleTitleDoubleClick}
            title={onTitleChange ? 'Double-click to edit' : pin.title}
          >
            {pin.title}
          </h3>
        )}

        {/* Last refreshed timestamp */}
        {pin.last_refreshed_at && (
          <span className="text-[9px] dark:text-gray-600 text-gray-400 flex-shrink-0" title={new Date(pin.last_refreshed_at).toLocaleString()}>
            {timeAgo(pin.last_refreshed_at)}
          </span>
        )}

        {/* Refresh button */}
        {onRefresh && canRefresh && (
          <div className="relative flex-shrink-0">
            <button
              onClick={() => onRefresh(pin.id)}
              className="p-0.5 rounded dark:text-gray-600 text-gray-300 dark:hover:text-gray-300 hover:text-gray-600 transition-colors cursor-pointer"
              title="Refresh data"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
              </svg>
            </button>
          </div>
        )}

        {/* Auto-refresh dropdown */}
        {onAutoRefreshChange && canRefresh && (
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setShowRefreshMenu(!showRefreshMenu)}
              className={`p-0.5 rounded transition-colors cursor-pointer flex-shrink-0 ${
                pin.auto_refresh_interval ? 'text-green-400' : 'dark:text-gray-600 text-gray-300 dark:hover:text-gray-300 hover:text-gray-600'
              }`}
              title={pin.auto_refresh_interval ? `Auto-refresh: ${AUTO_REFRESH_OPTIONS.find(o => o.value === pin.auto_refresh_interval)?.label}` : 'Set auto-refresh'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </button>
            {showRefreshMenu && (
              <div className="absolute right-0 top-full mt-1 z-30 dark:bg-[#1e1f20] bg-white border dark:border-[#2a2b2d] border-gray-200 rounded-lg shadow-lg py-1 min-w-[80px]">
                {AUTO_REFRESH_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      onAutoRefreshChange(pin.id, opt.value);
                      setShowRefreshMenu(false);
                    }}
                    className={`w-full text-left px-3 py-1 text-xs hover:dark:bg-[#2a2b2d] hover:bg-gray-100 transition-colors cursor-pointer ${
                      pin.auto_refresh_interval === opt.value ? 'text-purple-400 font-medium' : 'dark:text-gray-300 text-gray-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* View/Edit SQL */}
        {canRefresh && onUpdateSql && (
          <button
            onClick={() => { setShowSqlEditor(!showSqlEditor); if (!showSqlEditor) setSqlDraft(pin.source_sql || ''); }}
            className={`p-0.5 rounded transition-colors cursor-pointer flex-shrink-0 ${
              showSqlEditor
                ? 'bg-purple-500/20 text-purple-400'
                : 'dark:text-gray-600 text-gray-300 dark:hover:text-gray-300 hover:text-gray-600'
            }`}
            title="View/Edit SQL"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
            </svg>
          </button>
        )}

        {/* Chart type switcher */}
        {onChangeChartType && (
          <button
            onClick={() => setExpandedCard(!expandedCard)}
            className={`p-0.5 rounded transition-colors cursor-pointer flex-shrink-0 ${
              expandedCard
                ? 'bg-purple-500/20 text-purple-400'
                : 'dark:text-gray-600 text-gray-300 dark:hover:text-gray-300 hover:text-gray-600'
            }`}
            title="Change chart type"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13h2v8H3zm6-4h2v12H9zm6-6h2v18h-2zm6 10h2v8h-2z" />
            </svg>
          </button>
        )}

        {/* Annotate */}
        {onAddAnnotation && (
          <button
            onClick={() => {
              if (annotatingCard) {
                setAnnotatingCard(false);
                setPendingAnnotation(null);
                setAnnotationText('');
              } else {
                setAnnotatingCard(true);
              }
            }}
            className={`p-0.5 rounded transition-colors cursor-pointer flex-shrink-0 ${
              annotatingCard
                ? 'bg-purple-500/20 text-purple-400'
                : 'dark:text-gray-600 text-gray-300 dark:hover:text-gray-300 hover:text-gray-600'
            }`}
            title={annotatingCard ? 'Exit annotate mode' : 'Annotate chart'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
            </svg>
          </button>
        )}

        {/* Toggle annotations */}
        {hasAnnotations && onToggleAnnotations && (
          <button
            onClick={() => onToggleAnnotations(pin.id)}
            className="p-0.5 rounded dark:text-gray-600 text-gray-300 dark:hover:text-gray-300 hover:text-gray-600 transition-colors cursor-pointer flex-shrink-0"
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

        {/* Fullscreen expand */}
        {onExpand && (
          <button
            onClick={() => onExpand(pin)}
            className="p-0.5 rounded dark:text-gray-600 text-gray-300 dark:hover:text-gray-300 hover:text-gray-600 transition-colors cursor-pointer flex-shrink-0"
            title="View fullscreen"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          </button>
        )}

        {/* Unpin */}
        <button
          onClick={() => onUnpin(pin.id)}
          className="p-0.5 rounded dark:text-gray-600 text-gray-300 dark:hover:text-red-400 hover:text-red-500 transition-colors cursor-pointer opacity-0 group-hover:opacity-100 flex-shrink-0"
          title="Unpin chart"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Chart type switcher (expandable) */}
      {expandedCard && onChangeChartType && (
        <div className="px-3 py-1.5 border-b dark:border-[#2a2b2d]/50 border-gray-100">
          <ChartTypeSwitcher
            currentType={pin.chart_config.chartType}
            rows={filteredRows}
            columns={columns}
            onChangeType={(t) => onChangeChartType(pin.id, t)}
          />
        </div>
      )}

      {/* SQL editor (expandable) */}
      {showSqlEditor && (
        <InlineSqlEditor
          sql={sqlDraft}
          darkMode={darkMode}
          containerRef={sqlContainerRef}
          viewRef={sqlViewRef}
          onChangeSql={setSqlDraft}
          onRun={() => { onUpdateSql!(pin.id, sqlDraft); setShowSqlEditor(false); }}
          onCancel={() => setShowSqlEditor(false)}
          canRun={!!sqlDraft.trim() && sqlDraft !== pin.source_sql}
        />
      )}

      {/* Cross-filter badge */}
      {isFiltered && (
        <div className="flex items-center gap-1.5 px-3 py-1 border-b dark:border-[#2a2b2d]/50 border-gray-100 bg-purple-500/5">
          <span className="text-[10px] dark:text-purple-300 text-purple-600">
            Filtered by: {crossFilter!.column} = {String(crossFilter!.value)}
          </span>
        </div>
      )}

      {/* Annotate hint bar */}
      {annotatingCard && !pendingAnnotation && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b dark:border-[#2a2b2d]/50 border-gray-100 bg-purple-500/10">
          <span className="relative flex h-2 w-2 flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500" />
          </span>
          <span className="text-[11px] dark:text-purple-300 text-purple-600">Click a data point to annotate</span>
        </div>
      )}

      {/* Annotation text input */}
      {pendingAnnotation && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b dark:border-[#2a2b2d]/50 border-gray-100">
          <input
            autoFocus
            value={annotationText}
            onChange={e => setAnnotationText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && annotationText.trim()) {
                onAddAnnotation!(pin.id, pendingAnnotation.x, pendingAnnotation.y, annotationText.trim());
                setPendingAnnotation(null);
                setAnnotationText('');
              }
              if (e.key === 'Escape') {
                setPendingAnnotation(null);
                setAnnotationText('');
              }
            }}
            placeholder="Annotation text..."
            className="text-xs flex-1 dark:bg-[#111213] bg-gray-50 dark:text-gray-200 text-gray-800 border dark:border-[#2a2b2d] border-gray-200 rounded-md px-2 py-1 outline-none focus:border-purple-500 transition-colors"
          />
          <button
            onClick={() => {
              if (annotationText.trim()) {
                onAddAnnotation!(pin.id, pendingAnnotation.x, pendingAnnotation.y, annotationText.trim());
                setPendingAnnotation(null);
                setAnnotationText('');
              }
            }}
            disabled={!annotationText.trim()}
            className="px-2 py-1 text-xs rounded-md bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-30 cursor-pointer transition-colors"
          >
            Add
          </button>
          <button
            onClick={() => { setPendingAnnotation(null); setAnnotationText(''); }}
            className="px-2 py-1 text-xs rounded-md dark:text-gray-400 text-gray-500 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 cursor-pointer transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Chart or KPI card */}
      <div className="flex-1 min-h-0 relative">
        {!canRefresh && (
          <div className="absolute top-1 right-1 z-10" title="Snapshot only — no source SQL stored">
            <span className="text-[9px] px-1.5 py-0.5 rounded dark:bg-[#1e1f20] bg-gray-100 dark:text-gray-500 text-gray-400">
              Snapshot
            </span>
          </div>
        )}
        {isKPI ? (
          <DashboardKPICard
            pin={pin}
            darkMode={darkMode}
            rows={filteredRows}
          />
        ) : (
          <PlotlyChart
            chartConfig={pin.chart_config}
            rows={filteredRows}
            darkMode={darkMode}
            hideTitle
            annotationMode={annotatingCard}
            onChartClick={handleChartClick}
          />
        )}
      </div>
    </div>
  );
}

/** Inline CodeMirror SQL editor for chart cards */
function InlineSqlEditor({
  sql, darkMode, containerRef, viewRef, onChangeSql, onRun, onCancel, canRun,
}: {
  sql: string;
  darkMode: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  viewRef: React.MutableRefObject<any>;
  onChangeSql: (sql: string) => void;
  onRun: () => void;
  onCancel: () => void;
  canRun: boolean;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    (async () => {
      const { EditorView, keymap, lineNumbers, drawSelection, highlightActiveLine } = await import('@codemirror/view');
      const { EditorState, Compartment } = await import('@codemirror/state');
      const { defaultKeymap, history, historyKeymap } = await import('@codemirror/commands');
      const { sql: sqlLang, SQLite } = await import('@codemirror/lang-sql');
      const { syntaxHighlighting, defaultHighlightStyle, bracketMatching } = await import('@codemirror/language');
      const { closeBrackets, closeBracketsKeymap } = await import('@codemirror/autocomplete');
      const { oneDark } = await import('@codemirror/theme-one-dark');

      if (destroyed || !containerRef.current) return;

      const themeCompartment = new Compartment();

      const lightTheme = EditorView.theme({
        '&': { backgroundColor: '#ffffff', color: '#1e293b', fontSize: '11px' },
        '.cm-gutters': { backgroundColor: '#f8fafc', color: '#94a3b8', borderRight: '1px solid #e2e8f0' },
        '.cm-activeLineGutter': { backgroundColor: '#f1f5f9' },
        '.cm-activeLine': { backgroundColor: '#f8fafc' },
        '.cm-cursor': { borderLeftColor: '#6366f1' },
        '.cm-selectionBackground': { backgroundColor: '#c7d2fe !important' },
        '&.cm-focused .cm-selectionBackground': { backgroundColor: '#c7d2fe !important' },
      });

      const darkThemeCustom = [
        oneDark,
        EditorView.theme({ '&': { fontSize: '11px' } }),
      ];

      const updateListener = EditorView.updateListener.of((update: any) => {
        if (update.docChanged) {
          onChangeSql(update.state.doc.toString());
        }
      });

      const state = EditorState.create({
        doc: sql,
        extensions: [
          lineNumbers(),
          drawSelection(),
          history(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          bracketMatching(),
          closeBrackets(),
          highlightActiveLine(),
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          sqlLang({ dialect: SQLite }),
          themeCompartment.of(darkMode ? darkThemeCustom : lightTheme),
          updateListener,
          EditorView.lineWrapping,
        ],
      });

      const view = new EditorView({
        state,
        parent: containerRef.current!,
      });

      viewRef.current = view;
      setReady(true);
    })();

    return () => {
      destroyed = true;
      viewRef.current?.destroy();
      viewRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="px-3 py-2 border-b dark:border-[#2a2b2d]/50 border-gray-100">
      <div
        ref={containerRef}
        className="h-24 overflow-auto rounded-md border dark:border-[#2a2b2d] border-gray-200 [&_.cm-editor]:h-full [&_.cm-editor]:outline-none [&_.cm-scroller]:overflow-auto"
      />
      <div className="flex items-center gap-1.5 mt-1.5">
        <button
          onClick={onRun}
          disabled={!canRun}
          className="px-2 py-1 text-[11px] font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-30 cursor-pointer transition-colors"
        >
          Run
        </button>
        <button
          onClick={onCancel}
          className="px-2 py-1 text-[11px] rounded-md dark:text-gray-400 text-gray-500 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 cursor-pointer transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
