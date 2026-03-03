'use client';

import { useRef } from 'react';

interface FileUploadButtonProps {
  onFilesSelected: (files: FileList) => void;
  disabled?: boolean;
}

export default function FileUploadButton({ onFilesSelected, disabled }: FileUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf,.txt,.csv"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            onFilesSelected(e.target.files);
            e.target.value = '';
          }
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="p-2 rounded-xl dark:text-gray-500 text-gray-400 dark:hover:text-gray-300 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        title="Attach file"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
        </svg>
      </button>
    </>
  );
}
