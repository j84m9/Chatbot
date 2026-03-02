'use client';

interface InsightsPanelProps {
  insights: string | null;
  onGenerate?: () => void;
}

export default function InsightsPanel({ insights, onGenerate }: InsightsPanelProps) {
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
            className="text-xs dark:text-gray-500 text-gray-400 dark:hover:text-gray-300 hover:text-gray-600 transition-colors cursor-pointer"
          >
            Regenerate
          </button>
        )}
      </div>
      <div className="prose prose-sm dark:prose-invert max-w-none dark:text-gray-300 text-gray-700 leading-relaxed">
        {insights.split('\n').map((line, i) => {
          const trimmed = line.trim();
          if (!trimmed) return null;
          // Render bullet points
          if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            return (
              <div key={i} className="flex gap-2 py-1">
                <span className="text-indigo-400 flex-shrink-0 mt-0.5">&#8226;</span>
                <span>{trimmed.slice(2)}</span>
              </div>
            );
          }
          return <p key={i} className="py-1">{trimmed}</p>;
        })}
      </div>
    </div>
  );
}
