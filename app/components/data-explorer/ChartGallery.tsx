'use client';

import dynamic from 'next/dynamic';
import type { ChartConfig } from './PlotlyChart';

const PlotlyChart = dynamic(() => import('./PlotlyChart'), { ssr: false });

interface ChartGalleryProps {
  chartConfigs: ChartConfig[];
  rows: Record<string, any>[];
  darkMode: boolean;
  onRefineChart?: (index: number) => void;
}

export default function ChartGallery({ chartConfigs, rows, darkMode, onRefineChart }: ChartGalleryProps) {
  if (chartConfigs.length === 0) return null;

  // Single chart — render full-size
  if (chartConfigs.length === 1) {
    return (
      <div className="h-full relative group/chart">
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

  // Multiple charts — scrollable gallery
  return (
    <div className="space-y-4 h-full overflow-y-auto">
      {chartConfigs.map((config, i) => (
        <div
          key={`${config.chartType}-${config.xColumn}-${config.yColumn}-${i}`}
          className="relative group/chart border dark:border-[#2a2b2d] border-gray-200 rounded-xl overflow-hidden"
        >
          <div className="h-[350px]">
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
      ))}
    </div>
  );
}
