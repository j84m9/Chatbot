'use client';

import MarkdownRenderer from '@/app/components/MarkdownRenderer';

interface InsightsPanelProps {
  insights: string | null;
  isLoading?: boolean;
  onGenerate?: () => void;
}

export default function InsightsPanel({ insights, isLoading, onGenerate }: InsightsPanelProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-4 h-4 animate-orb" style={{ animationDelay: '0ms' }} />
          <div className="w-3 h-3 animate-orb" style={{ animationDelay: '300ms' }} />
          <div className="w-2.5 h-2.5 animate-orb" style={{ animationDelay: '600ms' }} />
        </div>
        <span className="text-sm dark:text-gray-400 text-gray-500 animate-pulse">Generating insights</span>
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-10 h-10 dark:text-gray-600 text-gray-300">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
        </svg>
        <p className="text-sm dark:text-gray-500 text-gray-400">AI-powered insights about your query results</p>
        {onGenerate && (
          <button
            onClick={onGenerate}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors cursor-pointer font-medium"
          >
            Generate Insights
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold dark:text-gray-200 text-gray-700">Data Insights</h3>
        {onGenerate && (
          <button
            onClick={onGenerate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
            Regenerate
          </button>
        )}
      </div>
      <MarkdownRenderer content={insights} />
    </div>
  );
}
