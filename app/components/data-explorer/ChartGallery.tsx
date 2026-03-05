'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { ChartConfig } from './PlotlyChart';
import ChartTypeSwitcher from './ChartTypeSwitcher';

const PlotlyChart = dynamic(() => import('./PlotlyChart'), { ssr: false });

interface ChartGalleryProps {
  chartConfigs: ChartConfig[];
  rows: Record<string, any>[];
  darkMode: boolean;
  onRefineSubmit?: (chartIndex: number, instruction: string) => Promise<void>;
  onChangeChartType?: (chartIndex: number, newType: string) => void;
  onAddAnnotation?: (chartIndex: number, x: number | string, y: number | string, text: string) => void;
  onToggleAnnotations?: (chartIndex: number) => void;
  onPinChart?: (index: number) => void;
  onUnpinChart?: (pinnedId: string) => void;
  pinnedSourceMap?: Map<string, string>;
  exchangeId?: string;
}

export default function ChartGallery({ chartConfigs, rows, darkMode, onRefineSubmit, onChangeChartType, onAddAnnotation, onToggleAnnotations, onPinChart, onUnpinChart, pinnedSourceMap, exchangeId }: ChartGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [annotatingChart, setAnnotatingChart] = useState<number | null>(null);
  const [pendingAnnotation, setPendingAnnotation] = useState<{ chartIndex: number; x: number | string; y: number | string } | null>(null);
  const [annotationText, setAnnotationText] = useState('');

  // Refine state
  const [refiningChart, setRefiningChart] = useState<number | null>(null);
  const [refineInstruction, setRefineInstruction] = useState('');
  const [isRefineLoading, setIsRefineLoading] = useState(false);

  // Pin feedback
  const [pinFeedback, setPinFeedback] = useState<number | null>(null);
  const pinFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Chart transition state
  const [chartVisible, setChartVisible] = useState(true);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (pinFeedbackTimer.current) clearTimeout(pinFeedbackTimer.current);
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
    };
  }, []);

  if (chartConfigs.length === 0) return null;

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const config = chartConfigs[activeIndex];
  const hasMultiple = chartConfigs.length > 1;

  // Helper to reset modes when switching charts with smooth fade
  const switchChart = useCallback((newIndex: number) => {
    if (newIndex === activeIndex) return;
    setChartVisible(false);
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    transitionTimer.current = setTimeout(() => {
      setActiveIndex(newIndex);
      setAnnotatingChart(null);
      setPendingAnnotation(null);
      setAnnotationText('');
      setRefiningChart(null);
      setRefineInstruction('');
      // Small delay to let React render the new chart before fading in
      requestAnimationFrame(() => setChartVisible(true));
    }, 150);
  }, [activeIndex]);

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

  const handlePinClick = (index: number) => {
    if (!onPinChart) return;
    onPinChart(index);
    setPinFeedback(index);
    if (pinFeedbackTimer.current) clearTimeout(pinFeedbackTimer.current);
    pinFeedbackTimer.current = setTimeout(() => setPinFeedback(null), 2000);
  };

  const handleAnnotateToggle = () => {
    if (annotatingChart === activeIndex) {
      setAnnotatingChart(null);
      setPendingAnnotation(null);
      setAnnotationText('');
    } else {
      setAnnotatingChart(activeIndex);
      // Exit refine mode
      setRefiningChart(null);
      setRefineInstruction('');
    }
  };

  const handleRefineToggle = () => {
    if (refiningChart === activeIndex) {
      setRefiningChart(null);
      setRefineInstruction('');
    } else {
      setRefiningChart(activeIndex);
      setRefineInstruction('');
      // Exit annotate mode
      setAnnotatingChart(null);
      setPendingAnnotation(null);
      setAnnotationText('');
    }
  };

  const handleRefineSubmitInternal = async () => {
    if (!refineInstruction.trim() || !onRefineSubmit || isRefineLoading) return;
    setIsRefineLoading(true);
    try {
      await onRefineSubmit(activeIndex, refineInstruction.trim());
      setRefiningChart(null);
      setRefineInstruction('');
    } finally {
      setIsRefineLoading(false);
    }
  };

  const goLeft = () => switchChart((activeIndex - 1 + chartConfigs.length) % chartConfigs.length);
  const goRight = () => switchChart((activeIndex + 1) % chartConfigs.length);

  const sourceKey = exchangeId ? `${exchangeId}:${activeIndex}` : '';
  const pinnedId = pinnedSourceMap?.get(sourceKey) ?? null;
  const alreadyPinned = pinnedId !== null;

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
            <div className="relative">
              <button
                onClick={() => alreadyPinned && pinnedId ? onUnpinChart?.(pinnedId) : handlePinClick(activeIndex)}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors cursor-pointer shadow-sm ${
                  alreadyPinned
                    ? 'bg-red-500/10 border-red-500/20 dark:text-red-300 text-red-600 hover:bg-red-500/20'
                    : 'bg-purple-500/10 border-purple-500/20 dark:text-purple-300 text-purple-600 hover:bg-purple-500/20'
                }`}
                title={alreadyPinned ? 'Unpin from dashboard' : 'Pin to dashboard'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-3.5 h-3.5 ${alreadyPinned ? 'text-red-400' : 'text-red-400'}`}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                </svg>
                {alreadyPinned ? 'Unpin' : 'Pin'}
              </button>
              {pinFeedback === activeIndex && (
                <span className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 text-[10px] font-medium rounded-md bg-emerald-500 text-white whitespace-nowrap animate-copy-feedback shadow-lg">
                  Pinned!
                </span>
              )}
            </div>
          )}
          {onAddAnnotation && (
            <>
              <button
                onClick={handleAnnotateToggle}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors cursor-pointer shadow-sm ${
                  annotatingChart === activeIndex
                    ? 'bg-purple-500/20 border-purple-500/40 dark:text-purple-200 text-purple-700'
                    : 'bg-purple-500/10 border-purple-500/20 dark:text-purple-300 text-purple-600 hover:bg-purple-500/20'
                }`}
                title={annotatingChart === activeIndex ? 'Exit annotate mode' : 'Annotate chart'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 text-sky-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                </svg>
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
          {onRefineSubmit && (
            <button
              onClick={handleRefineToggle}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors cursor-pointer shadow-sm ${
                refiningChart === activeIndex
                  ? 'bg-purple-500/20 border-purple-500/40 dark:text-purple-200 text-purple-700'
                  : 'bg-purple-500/10 border-purple-500/20 dark:text-purple-300 text-purple-600 hover:bg-purple-500/20'
              }`}
              title="Refine this chart"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 text-amber-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
              </svg>
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

      {/* Annotate mode hint bar */}
      {annotatingChart === activeIndex && !pendingAnnotation && (
        <div className="flex items-center gap-2 px-2 py-1.5 mb-1 mx-1 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-purple-500" />
          </span>
          <span className="text-xs dark:text-purple-300 text-purple-600">Click on a data point to add an annotation</span>
        </div>
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

      {/* Inline refine input */}
      {refiningChart === activeIndex && (
        <div className="flex items-center gap-1 px-1 mb-1">
          <input
            autoFocus
            value={refineInstruction}
            onChange={e => setRefineInstruction(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && refineInstruction.trim()) handleRefineSubmitInternal();
              if (e.key === 'Escape') {
                setRefiningChart(null);
                setRefineInstruction('');
              }
            }}
            placeholder="Describe how to change this chart..."
            className="text-xs flex-1 dark:bg-[#111213] bg-gray-50 dark:text-gray-200 text-gray-800 border dark:border-purple-500/30 border-purple-300 rounded-md px-2 py-1 outline-none focus:border-purple-500 transition-colors"
            disabled={isRefineLoading}
          />
          <button
            onClick={handleRefineSubmitInternal}
            disabled={!refineInstruction.trim() || isRefineLoading}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-30 cursor-pointer transition-colors"
          >
            {isRefineLoading ? (
              <>
                <svg className="animate-spin w-3 h-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Refining…
              </>
            ) : (
              'Refine'
            )}
          </button>
          <button
            onClick={() => { setRefiningChart(null); setRefineInstruction(''); }}
            className="px-2 py-1 text-xs rounded-md dark:text-gray-400 text-gray-500 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 cursor-pointer transition-colors"
            disabled={isRefineLoading}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Chart area with navigation arrows */}
      <div className="flex-1 relative min-h-0 overflow-hidden">
        {/* Left arrow */}
        {hasMultiple && (
          <button
            onClick={goLeft}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-20 p-1.5 rounded-full dark:bg-[#1e1f20]/95 bg-white/95 border dark:border-[#2a2b2d] border-gray-200 dark:text-gray-300 text-gray-600 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 transition-colors cursor-pointer shadow-lg backdrop-blur-sm"
            title="Previous chart"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
        )}

        {/* Chart with fade transition */}
        <div
          className="w-full h-full transition-opacity duration-150 ease-in-out"
          style={{ opacity: chartVisible ? 1 : 0 }}
        >
          <PlotlyChart
            chartConfig={config}
            rows={rows}
            darkMode={darkMode}
            annotationMode={annotatingChart === activeIndex}
            onChartClick={handleChartClick}
            hideTitle
          />
        </div>

        {/* Right arrow */}
        {hasMultiple && (
          <button
            onClick={goRight}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-20 p-1.5 rounded-full dark:bg-[#1e1f20]/95 bg-white/95 border dark:border-[#2a2b2d] border-gray-200 dark:text-gray-300 text-gray-600 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 transition-colors cursor-pointer shadow-lg backdrop-blur-sm"
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
              onClick={() => switchChart(i)}
              className={`rounded-full transition-all cursor-pointer ${
                i === activeIndex
                  ? 'w-5 h-2 bg-purple-500'
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
