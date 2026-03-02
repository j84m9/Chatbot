'use client';

import { useState, useRef, useEffect } from 'react';
import type { ChartConfig } from './PlotlyChart';

export interface Exchange {
  id: string;
  question: string;
  sql: string | null;
  explanation: string | null;
  results: {
    rows: Record<string, any>[];
    columns: string[];
    types: Record<string, string>;
    rowCount: number;
    executionTimeMs: number;
  } | null;
  chartConfig: any;
  chartConfigs: ChartConfig[] | null;
  error: string | null;
  isLoading: boolean;
  messageType?: string;
  parentMessageId?: string | null;
  insights?: string | null;
}

interface RefineContext {
  exchangeIndex: number;
  type: 'chart' | 'sql';
  chartIndex?: number;
}

interface QueryChatProps {
  exchanges: Exchange[];
  selectedIndex: number;
  onSelectExchange: (index: number) => void;
  onSubmitQuestion: (question: string) => void;
  isQuerying: boolean;
  hasConnection: boolean;
  refineContext?: RefineContext | null;
  onCancelRefine?: () => void;
  onRefineSubmit?: (instruction: string) => void;
}

export default function QueryChat({
  exchanges, selectedIndex, onSelectExchange, onSubmitQuestion,
  isQuerying, hasConnection, refineContext, onCancelRefine, onRefineSubmit,
}: QueryChatProps) {
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [exchanges]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isQuerying) return;

    if (refineContext && onRefineSubmit) {
      onRefineSubmit(input);
    } else {
      onSubmitQuestion(input);
    }
    setInput('');
  };

  const suggestions = [
    'Show me all tables',
    'Total rows per table',
    'Top 10 largest tables by row count',
    'List all columns with data types',
  ];

  const refineLabel = refineContext
    ? refineContext.type === 'chart'
      ? 'Refining chart'
      : 'Refining SQL'
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {exchanges.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center mt-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="w-14 h-14 dark:bg-[#1a1b1c] bg-white rounded-2xl border dark:border-[#2a2b2d] border-gray-200 shadow-lg flex items-center justify-center mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7 text-indigo-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold dark:text-gray-100 text-gray-800">Ask your database</h3>
            <p className="dark:text-gray-500 text-gray-400 mt-2 text-sm max-w-xs">Type a question in plain English and get SQL + charts.</p>

            {hasConnection && (
              <div className="flex flex-wrap justify-center gap-2 mt-6 max-w-sm">
                {suggestions.map(s => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="px-3 py-1.5 text-xs dark:bg-white/[0.04] bg-white dark:text-gray-400 text-gray-500 rounded-lg border dark:border-white/[0.08] border-gray-200 dark:hover:bg-white/[0.08] hover:bg-gray-100 dark:hover:text-gray-200 hover:text-gray-700 transition-all cursor-pointer"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {exchanges.map((ex, i) => (
          <div key={ex.id} className="space-y-2">
            {/* User question */}
            <div className="flex justify-end">
              <button
                onClick={() => onSelectExchange(i)}
                className={`px-4 py-2.5 max-w-[85%] text-sm text-left rounded-2xl rounded-br-sm transition-all cursor-pointer ${
                  selectedIndex === i
                    ? 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'bg-gradient-to-br from-indigo-500/80 to-indigo-600/80 text-white/90 hover:from-indigo-500 hover:to-indigo-600'
                }`}
              >
                <span className="whitespace-pre-wrap">{ex.question}</span>
              </button>
            </div>

            {/* Assistant response */}
            <div className="flex justify-start">
              <div
                onClick={() => onSelectExchange(i)}
                className={`px-4 py-2.5 max-w-[85%] text-sm rounded-2xl rounded-bl-sm border transition-all cursor-pointer ${
                  selectedIndex === i
                    ? 'dark:bg-[#1e1f20] bg-white dark:border-indigo-500/30 border-indigo-300'
                    : 'dark:bg-[#161718] bg-gray-50 dark:border-white/[0.06] border-gray-200/80 hover:dark:border-white/[0.12]'
                }`}
              >
                {ex.isLoading ? (
                  <div className="flex items-center gap-1.5 py-1">
                    <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                ) : ex.error && !ex.sql ? (
                  <span className="text-red-400">{ex.error}</span>
                ) : (
                  <div className="space-y-1.5">
                    <p className="dark:text-gray-300 text-gray-700">{ex.explanation || 'Query executed.'}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {ex.sql && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 font-medium">SQL</span>
                      )}
                      {ex.results && (
                        <>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">
                            {ex.results.rowCount} rows
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 font-medium">
                            {ex.results.executionTimeMs}ms
                          </span>
                        </>
                      )}
                      {(ex.chartConfigs && ex.chartConfigs.length > 0) ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-medium">
                          {ex.chartConfigs.length === 1 ? 'Chart' : `${ex.chartConfigs.length} Charts`}
                        </span>
                      ) : ex.chartConfig ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-medium">Chart</span>
                      ) : null}
                      {ex.error && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 font-medium">Error</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        <div ref={endRef} />
      </div>

      {/* Refine context indicator */}
      {refineContext && (
        <div className="px-4 py-2 border-t dark:border-[#2a2b2d] border-gray-200 flex items-center gap-2">
          <span className="text-xs px-2 py-1 rounded-full bg-amber-500/15 text-amber-400 font-medium">
            {refineLabel}
          </span>
          <span className="text-xs dark:text-gray-500 text-gray-400 truncate flex-1">
            Query #{refineContext.exchangeIndex + 1}
          </span>
          {onCancelRefine && (
            <button
              onClick={onCancelRefine}
              className="text-xs dark:text-gray-500 text-gray-400 dark:hover:text-gray-300 hover:text-gray-600 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          )}
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t dark:border-[#2a2b2d] border-gray-200">
        <form onSubmit={handleSubmit} className="relative flex items-center dark:bg-[#161718] bg-white rounded-xl border dark:border-white/[0.08] border-gray-200 shadow-lg focus-within:border-indigo-500/40 focus-within:ring-2 focus-within:ring-indigo-500/10 transition-all">
          <input
            className="w-full py-3 pl-4 pr-12 outline-none dark:text-gray-100 text-gray-800 bg-transparent dark:placeholder-gray-500 placeholder-gray-400 text-sm"
            value={input}
            placeholder={
              refineContext
                ? refineContext.type === 'chart'
                  ? 'Describe how to change the chart (e.g., "make it a pie chart")...'
                  : 'Describe how to modify the SQL (e.g., "add WHERE salary > 50000")...'
                : hasConnection
                  ? 'Ask a question about your data...'
                  : 'Add a connection first...'
            }
            onChange={e => setInput(e.target.value)}
            disabled={isQuerying || !hasConnection}
          />
          <button
            type="submit"
            disabled={!input.trim() || isQuerying || !hasConnection}
            className={`absolute right-2 p-2 rounded-lg transition-all cursor-pointer ${input.trim() ? 'text-indigo-500 hover:text-indigo-400 hover:bg-indigo-500/10' : 'text-gray-500'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
