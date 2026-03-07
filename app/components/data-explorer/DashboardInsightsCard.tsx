'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

interface DashboardInsightsCardProps {
  insightText: string | null;
  isLoading: boolean;
  darkMode: boolean;
  onRefresh: () => void;
  onUnpin: () => void;
}

export default function DashboardInsightsCard({
  insightText,
  isLoading,
  darkMode,
  onRefresh,
  onUnpin,
}: DashboardInsightsCardProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="group h-full border rounded-xl overflow-hidden flex flex-col dark:border-[#2a2b2d] border-gray-200 dark:bg-[#111213] bg-white">
      {/* Header */}
      <div className="drag-handle flex items-center gap-2 px-3 py-1.5 cursor-grab active:cursor-grabbing border-b dark:border-[#2a2b2d]/50 border-gray-100 flex-shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 dark:text-gray-600 text-gray-300 flex-shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
        </svg>

        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 text-amber-400 flex-shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
          </svg>
          <h3 className="text-xs font-medium dark:text-gray-300 text-gray-700 truncate">AI Insights</h3>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-0.5 rounded dark:text-gray-600 text-gray-300 dark:hover:text-gray-300 hover:text-gray-600 transition-colors cursor-pointer flex-shrink-0"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-3.5 h-3.5 transition-transform ${collapsed ? 'rotate-180' : ''}`}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>

        {/* Refresh */}
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-0.5 rounded dark:text-gray-600 text-gray-300 dark:hover:text-gray-300 hover:text-gray-600 transition-colors cursor-pointer flex-shrink-0 disabled:opacity-30"
          title="Refresh insights"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
          </svg>
        </button>

        {/* Remove */}
        <button
          onClick={onUnpin}
          className="p-0.5 rounded dark:text-gray-600 text-gray-300 dark:hover:text-red-400 hover:text-red-500 transition-colors cursor-pointer opacity-0 group-hover:opacity-100 flex-shrink-0"
          title="Remove insights card"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto p-3">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="flex gap-1.5">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-indigo-500/70 animate-orb"
                    style={{ animationDelay: `${i * 200}ms` }}
                  />
                ))}
              </div>
              <span className="text-xs dark:text-gray-500 text-gray-400">Analyzing charts...</span>
            </div>
          ) : insightText ? (
            <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed dark:text-gray-300 text-gray-600 [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_p]:text-xs [&_li]:text-xs [&_ul]:my-1 [&_ol]:my-1 [&_p]:my-1">
              <ReactMarkdown>{insightText}</ReactMarkdown>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full dark:text-gray-600 text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-8 h-8 mb-2 opacity-40">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
              </svg>
              <p className="text-xs">Click refresh to generate insights</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
