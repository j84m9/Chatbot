'use client';

import { useState, useRef, useEffect } from 'react';
import { exportChatAsText, exportChatAsPdf } from '@/utils/chat-export';

interface ExportMenuProps {
  messages: Array<{ role: string; parts?: Array<{ type: string; text?: string }> }>;
  sessionTitle: string;
}

export default function ExportMenu({ messages, sessionTitle }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg dark:text-gray-500 text-gray-400 dark:hover:bg-[#2a2b2d] hover:bg-gray-200 dark:hover:text-gray-300 hover:text-gray-600 transition-colors cursor-pointer"
        title="Export chat"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 dark:bg-[#1e1f20] bg-white border dark:border-[#333537] border-gray-200 rounded-xl shadow-xl z-30 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          <button
            onClick={() => { exportChatAsText(messages, sessionTitle); setOpen(false); }}
            className="flex items-center gap-2 px-4 py-2.5 text-sm dark:text-gray-300 text-gray-700 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 w-full text-left cursor-pointer transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            Export as Text
          </button>
          <button
            onClick={() => { exportChatAsPdf(messages, sessionTitle); setOpen(false); }}
            className="flex items-center gap-2 px-4 py-2.5 text-sm dark:text-gray-300 text-gray-700 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 w-full text-left cursor-pointer transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            Export as PDF
          </button>
        </div>
      )}
    </div>
  );
}
