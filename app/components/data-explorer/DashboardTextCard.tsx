'use client';

import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { PinnedChart } from './Dashboard';

interface DashboardTextCardProps {
  pin: PinnedChart;
  darkMode: boolean;
  onUnpin: (id: string) => void;
  onUpdateContent?: (id: string, content: string) => void;
}

export default function DashboardTextCard({ pin, darkMode, onUnpin, onUpdateContent }: DashboardTextCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  // Text content is stored in source_question or chart_config title
  const content = (pin as any).text_content || pin.source_question || pin.title || '';

  const handleDoubleClick = useCallback(() => {
    if (!onUpdateContent) return;
    setDraft(content);
    setEditing(true);
  }, [content, onUpdateContent]);

  const handleSave = useCallback(() => {
    setEditing(false);
    if (draft.trim() !== content && onUpdateContent) {
      onUpdateContent(pin.id, draft.trim());
    }
  }, [draft, content, pin.id, onUpdateContent]);

  return (
    <div className="group h-full border rounded-xl overflow-hidden flex flex-col dark:border-[#2a2b2d] border-gray-200 dark:bg-[#111213] bg-white">
      {/* Header */}
      <div className="drag-handle flex items-center gap-2 px-3 py-1.5 cursor-grab active:cursor-grabbing border-b dark:border-[#2a2b2d]/50 border-gray-100 flex-shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 dark:text-gray-600 text-gray-300 flex-shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
        </svg>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 dark:text-gray-500 text-gray-400 flex-shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
        <h3 className="text-xs font-medium dark:text-gray-400 text-gray-500 truncate flex-1">
          Text
        </h3>
        <button
          onClick={() => onUnpin(pin.id)}
          className="p-0.5 rounded dark:text-gray-600 text-gray-300 dark:hover:text-red-400 hover:text-red-500 transition-colors cursor-pointer opacity-0 group-hover:opacity-100 flex-shrink-0"
          title="Remove"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {editing ? (
          <div className="h-full flex flex-col">
            <textarea
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') { setEditing(false); }
                if (e.key === 'Enter' && e.metaKey) handleSave();
              }}
              className="flex-1 text-xs dark:bg-[#111213] bg-white dark:text-gray-200 text-gray-700 border dark:border-[#2a2b2d] border-gray-200 rounded-md p-2 outline-none focus:border-purple-500 resize-none transition-colors font-mono"
              placeholder="Write markdown here..."
            />
            <div className="flex items-center gap-1.5 mt-2">
              <button
                onClick={handleSave}
                className="px-2 py-1 text-[11px] font-medium rounded-md bg-purple-500 hover:bg-purple-600 text-white cursor-pointer transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-2 py-1 text-[11px] rounded-md dark:text-gray-400 text-gray-500 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <span className="text-[9px] dark:text-gray-600 text-gray-400 ml-auto">Cmd+Enter to save</span>
            </div>
          </div>
        ) : (
          <div
            onDoubleClick={handleDoubleClick}
            className={`text-xs dark:text-gray-300 text-gray-600 prose prose-xs dark:prose-invert max-w-none ${
              onUpdateContent ? 'cursor-text' : ''
            } [&_h1]:text-sm [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-xs [&_h2]:font-semibold [&_h2]:mb-1.5 [&_p]:mb-1.5 [&_ul]:mb-1.5 [&_li]:mb-0.5`}
            title={onUpdateContent ? 'Double-click to edit' : undefined}
          >
            {content ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            ) : (
              <span className="dark:text-gray-600 text-gray-400 italic">
                {onUpdateContent ? 'Double-click to add text...' : 'No content'}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
