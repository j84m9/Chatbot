'use client';

import { useState } from 'react';

interface FilePreviewProps {
  url: string;
  mediaType: string;
  filename?: string;
}

export default function FilePreview({ url, mediaType, filename }: FilePreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const isImage = mediaType.startsWith('image/');
  const displayName = filename || url.split('/').pop() || 'file';

  if (isImage) {
    return (
      <>
        <img
          src={url}
          alt={displayName}
          onClick={() => setExpanded(true)}
          className="max-h-48 rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
        />
        {expanded && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-pointer animate-backdrop-in"
            onClick={() => setExpanded(false)}
          >
            <img src={url} alt={displayName} className="max-w-full max-h-full rounded-lg animate-modal-in" />
          </div>
        )}
      </>
    );
  }

  // Non-image files: icon + filename + download link
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 px-3 py-2 rounded-lg dark:bg-white/[0.04] bg-gray-50 border dark:border-white/[0.08] border-gray-200 dark:hover:bg-white/[0.08] hover:bg-gray-100 transition-colors text-sm max-w-xs"
    >
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 flex-shrink-0 dark:text-gray-400 text-gray-500">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
      <span className="truncate dark:text-gray-300 text-gray-700">{displayName}</span>
    </a>
  );
}
