'use client';

import { useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { ChartConfig } from './PlotlyChart';
// CSS imported in globals.css
type Layout = { i: string; x: number; y: number; w: number; h: number; minW?: number; minH?: number };

const PlotlyChart = dynamic(() => import('./PlotlyChart'), { ssr: false });
// Dynamic import for react-grid-layout since it's a client-only component
const GridLayout = dynamic(
  () => import('react-grid-layout').then(mod => {
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
  connectionName?: string;
}

export default function Dashboard({ pinnedCharts, darkMode, onUnpin, onLayoutChange, connectionName }: DashboardProps) {
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  return (
    <div className="h-full w-full overflow-y-auto p-4">
      {connectionName && (
        <div className="mb-4">
          <h2 className="text-lg font-semibold dark:text-gray-100 text-gray-800">Dashboard</h2>
          <p className="text-xs dark:text-gray-500 text-gray-400">{connectionName} — {pinnedCharts.length} pinned chart{pinnedCharts.length !== 1 ? 's' : ''} · Drag to rearrange, resize from corners</p>
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
        {pinnedCharts.map((pin) => (
          <div
            key={pin.id}
            className="group border dark:border-[#2a2b2d] border-gray-200 rounded-xl overflow-hidden dark:bg-[#111213] bg-white flex flex-col"
          >
            {/* Card header — drag handle + title + unpin */}
            <div className="drag-handle flex items-center gap-2 px-3 py-1.5 cursor-grab active:cursor-grabbing border-b dark:border-[#2a2b2d]/50 border-gray-100 flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 dark:text-gray-600 text-gray-300 flex-shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
              </svg>
              <h3 className="text-xs font-medium dark:text-gray-300 text-gray-700 truncate flex-1">{pin.title}</h3>
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
            {/* Chart fills remaining space */}
            <div className="flex-1 min-h-0">
              <PlotlyChart
                chartConfig={pin.chart_config}
                rows={pin.results_snapshot.rows}
                darkMode={darkMode}
                hideTitle
              />
            </div>
          </div>
        ))}
      </GridLayout>
    </div>
  );
}
