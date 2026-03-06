'use client';

interface SearchResult {
  title: string;
  url: string;
  content: string;
}

interface SearchData {
  query: string;
  results: SearchResult[];
  searchedAt: string;
  error?: string;
}

interface SearchResultsCardProps {
  jsonString: string;
}

export default function SearchResultsCard({ jsonString }: SearchResultsCardProps) {
  let data: SearchData;
  try {
    data = JSON.parse(jsonString);
  } catch {
    return (
      <pre className="overflow-x-auto rounded-xl p-4 text-sm dark:bg-[#0d0d0e] bg-gray-50 dark:text-gray-300 text-gray-700 border dark:border-white/[0.06] border-gray-200">
        <code>{jsonString}</code>
      </pre>
    );
  }

  if (data.error) {
    return (
      <div className="rounded-xl border dark:border-white/[0.06] border-gray-200 p-4 my-2 dark:bg-[#0d0d0e] bg-gray-50">
        <p className="text-sm dark:text-gray-400 text-gray-600">Search unavailable: {data.error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border dark:border-white/[0.06] border-gray-200 overflow-hidden my-2 max-w-lg">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 dark:from-indigo-600 dark:to-indigo-900 px-4 py-3 text-white">
        <p className="text-sm font-medium opacity-90">Web Search</p>
        <p className="text-xs opacity-70 mt-0.5 truncate">&ldquo;{data.query}&rdquo;</p>
      </div>

      {/* Results */}
      <div className="divide-y dark:divide-white/[0.06] divide-gray-200 dark:bg-[#0d0d0e] bg-white">
        {data.results.map((result, i) => (
          <a
            key={i}
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
          >
            <p className="text-sm font-medium dark:text-indigo-400 text-indigo-600 line-clamp-1">
              {result.title}
            </p>
            <p className="text-xs dark:text-gray-500 text-gray-400 truncate mt-0.5">
              {result.url}
            </p>
            <p className="text-sm dark:text-gray-300 text-gray-600 mt-1 line-clamp-2">
              {result.content}
            </p>
          </a>
        ))}
        {data.results.length === 0 && (
          <div className="px-4 py-3">
            <p className="text-sm dark:text-gray-400 text-gray-600">No results found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
