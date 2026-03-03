'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface SearchResult {
  sessionId: string;
  sessionTitle: string;
  role: string;
  matchSnippet: string;
  createdAt: string;
}

interface SearchModalProps {
  onClose: () => void;
  onSelectResult: (sessionId: string) => void;
}

export default function SearchModal({ onClose, onSelectResult }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
        setSelectedIdx(0);
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
  };

  // Deduplicate results by sessionId for display
  const grouped = results.reduce<Map<string, SearchResult[]>>((acc, r) => {
    const list = acc.get(r.sessionId) || [];
    list.push(r);
    acc.set(r.sessionId, list);
    return acc;
  }, new Map());

  const sessionIds = Array.from(grouped.keys());

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, sessionIds.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const id = sessionIds[selectedIdx];
      if (id) onSelectResult(id);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg dark:bg-[#1a1b1c] bg-white rounded-2xl shadow-2xl border dark:border-[#2a2b2d] border-gray-200 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b dark:border-[#2a2b2d] border-gray-200">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 dark:text-gray-400 text-gray-500 flex-shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search messages..."
            className="flex-1 bg-transparent outline-none dark:text-gray-100 text-gray-800 dark:placeholder-gray-500 placeholder-gray-400 text-sm"
          />
          {loading && (
            <div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          )}
          <kbd className="hidden sm:inline text-[10px] dark:bg-[#2a2b2d] bg-gray-100 dark:text-gray-500 text-gray-400 px-1.5 py-0.5 rounded font-mono">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {query.length >= 2 && results.length === 0 && !loading && (
            <div className="px-4 py-8 text-center dark:text-gray-500 text-gray-400 text-sm">
              No results found
            </div>
          )}

          {sessionIds.map((sessionId, idx) => {
            const items = grouped.get(sessionId)!;
            const first = items[0];
            return (
              <button
                key={sessionId}
                onClick={() => onSelectResult(sessionId)}
                className={`w-full text-left px-4 py-3 border-b dark:border-[#2a2b2d]/50 border-gray-100 transition-colors cursor-pointer ${
                  idx === selectedIdx
                    ? 'dark:bg-indigo-500/10 bg-indigo-50'
                    : 'dark:hover:bg-[#1e1f20] hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium dark:text-gray-200 text-gray-800 truncate">
                    {first.sessionTitle}
                  </span>
                  <span className="text-[10px] dark:text-gray-600 text-gray-400">
                    {items.length} match{items.length > 1 ? 'es' : ''}
                  </span>
                </div>
                <p className="text-xs dark:text-gray-400 text-gray-500 truncate">
                  <span className={`inline-block px-1 py-0.5 rounded text-[10px] mr-1 ${first.role === 'user' ? 'bg-indigo-500/15 text-indigo-400' : 'dark:bg-white/5 bg-gray-100 dark:text-gray-400 text-gray-500'}`}>
                    {first.role}
                  </span>
                  {first.matchSnippet}
                </p>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t dark:border-[#2a2b2d] border-gray-200 flex items-center gap-3 text-[10px] dark:text-gray-600 text-gray-400">
          <span><kbd className="dark:bg-[#2a2b2d] bg-gray-100 px-1 py-0.5 rounded font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="dark:bg-[#2a2b2d] bg-gray-100 px-1 py-0.5 rounded font-mono">↵</kbd> open</span>
          <span><kbd className="dark:bg-[#2a2b2d] bg-gray-100 px-1 py-0.5 rounded font-mono">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
