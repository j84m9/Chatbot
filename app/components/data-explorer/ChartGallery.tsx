'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { ChartConfig } from './PlotlyChart';
import ChartTypeSwitcher from './ChartTypeSwitcher';

const PlotlyChart = dynamic(() => import('./PlotlyChart'), { ssr: false });

interface ChartGalleryProps {
  chartConfigs: ChartConfig[];
  rows: Record<string, any>[];
  darkMode: boolean;
  onRefineChart?: (index: number) => void;
  onChangeChartType?: (chartIndex: number, newType: string) => void;
}

export default function ChartGallery({ chartConfigs, rows, darkMode, onRefineChart, onChangeChartType }: ChartGalleryProps) {
  const [gridView, setGridView] = useState(chartConfigs.length >= 2);

  if (chartConfigs.length === 0) return null;

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  // Single chart — render full-size
  if (chartConfigs.length === 1) {
    return (
      <div className="h-full relative group/chart animate-chart-enter">
        {onChangeChartType && (
          <ChartTypeSwitcher
            currentType={chartConfigs[0].chartType}
            rows={rows}
            columns={columns}
            onChangeType={(t) => onChangeChartType(0, t)}
          />
        )}
        <PlotlyChart chartConfig={chartConfigs[0]} rows={rows} darkMode={darkMode} />
        {onRefineChart && (
          <div className="absolute top-2 right-2 opacity-0 group-hover/chart:opacity-100 transition-opacity">
            <button
              onClick={() => onRefineChart(0)}
              className="px-2 py-1 text-xs rounded-lg dark:bg-[#1e1f20] bg-white border dark:border-[#2a2b2d] border-gray-200 dark:text-gray-300 text-gray-600 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 transition-colors cursor-pointer shadow-sm"
              title="Refine this chart"
            >
              Refine
            </button>
          </div>
        )}
      </div>
    );
  }

  // Grid layout classes
  const gridClass = gridView
    ? chartConfigs.length === 2
      ? 'grid grid-cols-2 gap-4'
      : 'grid grid-cols-2 gap-4'  // 3+ charts: 2-col grid, last stretches
    : 'space-y-4';

  return (
    <div className="h-full overflow-y-auto">
      {/* Layout toggle */}
      <div className="flex justify-end mb-2">
        <button
          onClick={() => setGridView(!gridView)}
          className="p-1.5 rounded-lg dark:text-gray-400 text-gray-500 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 transition-colors cursor-pointer"
          title={gridView ? 'List view' : 'Grid view'}
        >
          {gridView ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
            </svg>
          )}
        </button>
      </div>

      <div className={gridClass}>
        {chartConfigs.map((config, i) => {
          // In grid view with 3 charts, last chart spans full width
          const isLastOdd = gridView && chartConfigs.length === 3 && i === 2;

          return (
            <div
              key={`${config.chartType}-${config.xColumn}-${config.yColumn}-${i}`}
              className={`relative group/chart border dark:border-[#2a2b2d] border-gray-200 rounded-xl overflow-hidden animate-chart-enter ${
                isLastOdd ? 'col-span-2' : ''
              }`}
              style={{ animationDelay: `${i * 150}ms` }}
            >
              <div className="p-2 pb-0">
                {onChangeChartType && (
                  <ChartTypeSwitcher
                    currentType={config.chartType}
                    rows={rows}
                    columns={columns}
                    onChangeType={(t) => onChangeChartType(i, t)}
                  />
                )}
              </div>
              <div className={gridView ? 'h-[300px]' : 'h-[350px]'}>
                <PlotlyChart chartConfig={config} rows={rows} darkMode={darkMode} />
              </div>
              {onRefineChart && (
                <div className="absolute top-2 right-2 opacity-0 group-hover/chart:opacity-100 transition-opacity flex gap-1">
                  <button
                    onClick={() => onRefineChart(i)}
                    className="px-2 py-1 text-xs rounded-lg dark:bg-[#1e1f20] bg-white border dark:border-[#2a2b2d] border-gray-200 dark:text-gray-300 text-gray-600 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 transition-colors cursor-pointer shadow-sm"
                    title="Refine this chart"
                  >
                    Refine
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
