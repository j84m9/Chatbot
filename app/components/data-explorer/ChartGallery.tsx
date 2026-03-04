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
  onAddAnnotation?: (chartIndex: number, x: number | string, y: number | string, text: string) => void;
  onToggleAnnotations?: (chartIndex: number) => void;
  onPinChart?: (index: number) => void;
}

export default function ChartGallery({ chartConfigs, rows, darkMode, onRefineChart, onChangeChartType, onAddAnnotation, onToggleAnnotations, onPinChart }: ChartGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [annotatingChart, setAnnotatingChart] = useState<number | null>(null);
  const [pendingAnnotation, setPendingAnnotation] = useState<{ chartIndex: number; x: number | string; y: number | string } | null>(null);
  const [annotationText, setAnnotationText] = useState('');

  if (chartConfigs.length === 0) return null;

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const config = chartConfigs[activeIndex];
  const hasMultiple = chartConfigs.length > 1;

  const handleChartClick = (x: number | string, y: number | string) => {
    if (annotatingChart !== activeIndex) return;
    setPendingAnnotation({ chartIndex: activeIndex, x, y });
    setAnnotationText('');
  };

  const handleAnnotationSave = () => {
    if (!pendingAnnotation || !annotationText.trim() || !onAddAnnotation) return;
    onAddAnnotation(pendingAnnotation.chartIndex, pendingAnnotation.x, pendingAnnotation.y, annotationText.trim());
    setPendingAnnotation(null);
    setAnnotationText('');
  };

  const handleAnnotationCancel = () => {
    setPendingAnnotation(null);
    setAnnotationText('');
  };

  const goLeft = () => setActiveIndex(i => (i - 1 + chartConfigs.length) % chartConfigs.length);
  const goRight = () => setActiveIndex(i => (i + 1) % chartConfigs.length);

  return (
    <div className="h-full flex flex-col animate-chart-enter">
      {/* Header row: title + action buttons */}
      <div className="flex items-center justify-between px-1 mb-1 min-h-[32px]">
        {/* Chart title */}
        <h3 className="text-sm font-medium dark:text-gray-200 text-gray-700 truncate flex-1 mr-2">
          {config?.title}
        </h3>

        {/* Action buttons — always visible, compact */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {onPinChart && (
            <button
              onClick={() => onPinChart(activeIndex)}
              className="px-2 py-1 text-xs rounded-lg dark:bg-[#1e1f20] bg-white border dark:border-[#2a2b2d] border-gray-200 dark:text-gray-300 text-gray-600 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 transition-colors cursor-pointer shadow-sm"
              title="Pin to dashboard"
            >
              Pin
            </button>
          )}
          {onAddAnnotation && (
            <>
              <button
                onClick={() => setAnnotatingChart(annotatingChart === activeIndex ? null : activeIndex)}
                className={`px-2 py-1 text-xs rounded-lg border transition-colors cursor-pointer shadow-sm ${
                  annotatingChart === activeIndex
                    ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400'
                    : 'dark:bg-[#1e1f20] bg-white dark:border-[#2a2b2d] border-gray-200 dark:text-gray-300 text-gray-600 dark:hover:bg-[#2a2b2d] hover:bg-gray-100'
                }`}
                title={annotatingChart === activeIndex ? 'Exit annotate mode' : 'Annotate chart'}
              >
                Annotate
              </button>
              {config?.annotations && config.annotations.length > 0 && (
                <button
                  onClick={() => onToggleAnnotations?.(activeIndex)}
                  className="px-1.5 py-1 text-xs rounded-lg dark:bg-[#1e1f20] bg-white border dark:border-[#2a2b2d] border-gray-200 dark:text-gray-300 text-gray-600 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 transition-colors cursor-pointer shadow-sm"
                  title={config.showAnnotations === false ? 'Show annotations' : 'Hide annotations'}
                >
                  {config.showAnnotations === false ? (
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
            </>
          )}
          {onRefineChart && (
            <button
              onClick={() => onRefineChart(activeIndex)}
              className="px-2 py-1 text-xs rounded-lg dark:bg-[#1e1f20] bg-white border dark:border-[#2a2b2d] border-gray-200 dark:text-gray-300 text-gray-600 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 transition-colors cursor-pointer shadow-sm"
              title="Refine this chart"
            >
              Refine
            </button>
          )}
        </div>
      </div>

      {/* Chart type switcher */}
      {onChangeChartType && (
        <ChartTypeSwitcher
          currentType={config.chartType}
          rows={rows}
          columns={columns}
          onChangeType={(t) => onChangeChartType(activeIndex, t)}
        />
      )}

      {/* Annotation input */}
      {pendingAnnotation && pendingAnnotation.chartIndex === activeIndex && (
        <div className="flex items-center gap-1 px-1 mb-1">
          <input
            autoFocus
            value={annotationText}
            onChange={e => setAnnotationText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && annotationText.trim()) handleAnnotationSave();
              if (e.key === 'Escape') handleAnnotationCancel();
            }}
            placeholder="Annotation text..."
            className="text-xs flex-1 dark:bg-[#111213] bg-gray-50 dark:text-gray-200 text-gray-800 border dark:border-[#2a2b2d] border-gray-200 rounded-md px-2 py-1 outline-none focus:border-indigo-500 transition-colors"
          />
          <button
            onClick={handleAnnotationSave}
            disabled={!annotationText.trim()}
            className="px-2 py-1 text-xs rounded-md bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-30 cursor-pointer transition-colors"
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

      {/* Chart area with navigation arrows */}
      <div className="flex-1 relative min-h-0">
        {/* Left arrow */}
        {hasMultiple && (
          <button
            onClick={goLeft}
            className="absolute left-1 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-full dark:bg-[#1e1f20]/90 bg-white/90 border dark:border-[#2a2b2d] border-gray-200 dark:text-gray-300 text-gray-600 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 transition-colors cursor-pointer shadow-md backdrop-blur-sm"
            title="Previous chart"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
        )}

        {/* Chart */}
        <PlotlyChart
          chartConfig={config}
          rows={rows}
          darkMode={darkMode}
          annotationMode={annotatingChart === activeIndex}
          onChartClick={handleChartClick}
          hideTitle
        />

        {/* Right arrow */}
        {hasMultiple && (
          <button
            onClick={goRight}
            className="absolute right-1 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-full dark:bg-[#1e1f20]/90 bg-white/90 border dark:border-[#2a2b2d] border-gray-200 dark:text-gray-300 text-gray-600 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 transition-colors cursor-pointer shadow-md backdrop-blur-sm"
            title="Next chart"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        )}
      </div>

      {/* Dot indicators */}
      {hasMultiple && (
        <div className="flex items-center justify-center gap-1.5 py-2">
          {chartConfigs.map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveIndex(i)}
              className={`rounded-full transition-all cursor-pointer ${
                i === activeIndex
                  ? 'w-5 h-2 bg-indigo-500'
                  : 'w-2 h-2 dark:bg-gray-600 bg-gray-300 hover:dark:bg-gray-500 hover:bg-gray-400'
              }`}
              title={`Chart ${i + 1}: ${chartConfigs[i].title}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
