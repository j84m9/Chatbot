'use client';

import { useCallback, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { ChartConfig } from './PlotlyChart';
import ChartTypeSwitcher from './ChartTypeSwitcher';
// CSS imported in globals.css
type Layout = { i: string; x: number; y: number; w: number; h: number; minW?: number; minH?: number };

const PlotlyChart = dynamic(() => import('./PlotlyChart'), { ssr: false });
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
  created_at: string;
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
}

export default function Dashboard({ pinnedCharts, darkMode, onUnpin, onLayoutChange, onChangeChartType, onAddAnnotation, onToggleAnnotations, connectionName }: DashboardProps) {
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [annotatingCard, setAnnotatingCard] = useState<string | null>(null);
  const [pendingAnnotation, setPendingAnnotation] = useState<{ cardId: string; x: number | string; y: number | string } | null>(null);
  const [annotationText, setAnnotationText] = useState('');

  const handleLayoutChange = useCallback((layout: Layout[], _allLayouts: any) => {
    // Debounce — save after user stops dragging
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      for (const item of layout) {
        const pin = pinnedCharts.find(p => p.id === item.i);
        if (!pin) continue;
        const saved = pin.layout;
        // Only persist if something actually changed
        if (!saved || saved.x !== item.x || saved.y !== item.y || saved.w !== item.w || saved.h !== item.h) {
          onLayoutChange(item.i, { x: item.x, y: item.y, w: item.w, h: item.h });
        }
      }
    }, 500);
  }, [pinnedCharts, onLayoutChange]);

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
      if (pin.layout) {
        return { i: pin.id, x: pin.layout.x, y: pin.layout.y, w: pin.layout.w, h: pin.layout.h, minW: 2, minH: 2 };
      }
      // Default: 2 columns, each 6 wide out of 12
      return { i: pin.id, x: (i % 2) * 6, y: Math.floor(i / 2) * 4, w: 6, h: 4, minW: 2, minH: 2 };
    });
  };

  return (
    <div className="h-full w-full overflow-y-auto p-4">
      {connectionName && (
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold dark:text-gray-100 text-gray-800">Dashboard</h2>
            <p className="text-xs dark:text-gray-500 text-gray-400">{connectionName} — {pinnedCharts.length} pinned chart{pinnedCharts.length !== 1 ? 's' : ''} · Drag to rearrange, resize from corners</p>
          </div>
          <button
            onClick={() => {
              sessionStorage.setItem('dashboard-charts', JSON.stringify({
                pinnedCharts,
                connectionName,
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
              {/* Card header — drag handle + title + actions */}
              <div className="drag-handle flex items-center gap-2 px-3 py-1.5 cursor-grab active:cursor-grabbing border-b dark:border-[#2a2b2d]/50 border-gray-100 flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 dark:text-gray-600 text-gray-300 flex-shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
                </svg>
                <h3 className="text-xs font-medium dark:text-gray-300 text-gray-700 truncate flex-1">{pin.title}</h3>
                {onChangeChartType && (
                  <button
                    onClick={() => setExpandedCard(expandedCard === pin.id ? null : pin.id)}
                    className={`p-0.5 rounded transition-colors cursor-pointer flex-shrink-0 ${
                      expandedCard === pin.id
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
                {onAddAnnotation && (
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
                    className={`p-0.5 rounded transition-colors cursor-pointer flex-shrink-0 ${
                      isAnnotating
                        ? 'bg-purple-500/20 text-purple-400'
                        : 'dark:text-gray-600 text-gray-300 dark:hover:text-gray-300 hover:text-gray-600'
                    }`}
                    title={isAnnotating ? 'Exit annotate mode' : 'Annotate chart'}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                    </svg>
                  </button>
                )}
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
              {expandedCard === pin.id && onChangeChartType && (
                <div className="px-3 py-1.5 border-b dark:border-[#2a2b2d]/50 border-gray-100">
                  <ChartTypeSwitcher
                    currentType={pin.chart_config.chartType}
                    rows={pin.results_snapshot.rows}
                    columns={columns}
                    onChangeType={(t) => onChangeChartType(pin.id, t)}
                  />
                </div>
              )}
              {/* Annotate hint bar */}
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
                      if (e.key === 'Enter' && annotationText.trim()) {
                        onAddAnnotation!(pendingAnnotation!.cardId, pendingAnnotation!.x, pendingAnnotation!.y, annotationText.trim());
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
                        onAddAnnotation!(pendingAnnotation!.cardId, pendingAnnotation!.x, pendingAnnotation!.y, annotationText.trim());
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
              {/* Chart fills remaining space */}
              <div className="flex-1 min-h-0">
                <PlotlyChart
                  chartConfig={pin.chart_config}
                  rows={pin.results_snapshot.rows}
                  darkMode={darkMode}
                  hideTitle
                  annotationMode={isAnnotating}
                  onChartClick={(x, y) => {
                    if (annotatingCard !== pin.id) return;
                    setPendingAnnotation({ cardId: pin.id, x, y });
                    setAnnotationText('');
                  }}
                />
              </div>
            </div>
          );
        })}
      </GridLayout>
    </div>
  );
}
