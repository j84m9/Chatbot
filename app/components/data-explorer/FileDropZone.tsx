'use client';

import { useState, useRef, useCallback } from 'react';

interface FileDropZoneProps {
  onFileLoad: (content: string) => void;
  label?: string;
  darkMode: boolean;
}

export default function FileDropZone({ onFileLoad, label = 'Drop a .yaml file here or click to browse', darkMode }: FileDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [loadedFile, setLoadedFile] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.yaml') && !file.name.endsWith('.yml')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        setLoadedFile(file.name);
        onFileLoad(content);
      }
    };
    reader.readAsText(file);
  }, [onFileLoad]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so the same file can be selected again
    e.target.value = '';
  }, [handleFile]);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={handleClick}
      className={`
        mx-3 mt-2 px-3 py-2 rounded-lg border-2 border-dashed cursor-pointer transition-colors text-xs
        ${isDragOver
          ? 'border-indigo-400 bg-indigo-500/10'
          : loadedFile
            ? (darkMode ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-emerald-400/40 bg-emerald-50')
            : (darkMode ? 'border-[#3a3b3d] hover:border-gray-500 bg-transparent' : 'border-gray-300 hover:border-gray-400 bg-transparent')
        }
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".yaml,.yml"
        onChange={handleChange}
        className="hidden"
      />
      <div className="flex items-center gap-2">
        {loadedFile ? (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-emerald-500 flex-shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            <span className={darkMode ? 'text-emerald-400' : 'text-emerald-600'}>
              Loaded: {loadedFile}
            </span>
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-4 h-4 flex-shrink-0 ${isDragOver ? 'text-indigo-400' : (darkMode ? 'text-gray-500' : 'text-gray-400')}`}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            <span className={darkMode ? 'text-gray-500' : 'text-gray-400'}>
              {label}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
