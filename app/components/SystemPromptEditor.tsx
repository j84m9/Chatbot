'use client';

import { useState } from 'react';

interface ActiveAgent {
  id: string;
  name: string;
  logo_url?: string;
  system_prompt: string;
}

interface SystemPromptEditorProps {
  currentPrompt: string | null;
  onSave: (prompt: string | null) => void;
  onClose: () => void;
  activeAgent?: ActiveAgent | null;
  onDetachAgent?: () => void;
}

const PRESETS = [
  { label: 'Concise', prompt: 'Be very concise. Respond with short, direct answers. Avoid unnecessary elaboration.' },
  { label: 'Detailed', prompt: 'Provide thorough, detailed explanations. Include examples and context where helpful.' },
  { label: 'Code-focused', prompt: 'Focus on code. Provide working code examples with minimal prose. Use comments in code instead of explanations.' },
  { label: 'Creative', prompt: 'Be creative and engaging. Use analogies, storytelling, and vivid language to explain concepts.' },
];

export default function SystemPromptEditor({ currentPrompt, onSave, onClose, activeAgent, onDetachAgent }: SystemPromptEditorProps) {
  const [value, setValue] = useState(currentPrompt || '');

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-backdrop-in" />
      <div
        className="relative w-full max-w-lg dark:bg-[#1a1b1c] bg-white rounded-2xl shadow-2xl border dark:border-[#2a2b2d] border-gray-200 overflow-hidden animate-modal-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b dark:border-[#2a2b2d] border-gray-200">
          <h3 className="text-sm font-semibold dark:text-gray-200 text-gray-800">System Prompt</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg dark:hover:bg-[#2a2b2d] hover:bg-gray-100 dark:text-gray-400 text-gray-500 transition-colors cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {activeAgent ? (
          <>
            {/* Agent info banner */}
            <div className="px-4 pt-3 pb-2 flex items-center gap-3">
              {activeAgent.logo_url ? (
                <img src={activeAgent.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 dark:text-emerald-400 text-emerald-500">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                  </svg>
                </div>
              )}
              <div>
                <div className="text-sm font-medium dark:text-gray-200 text-gray-800">{activeAgent.name}</div>
                <div className="text-[11px] dark:text-emerald-400/70 text-emerald-600">Agent prompt active</div>
              </div>
            </div>

            {/* Read-only textarea */}
            <div className="px-4 py-3">
              <textarea
                value={activeAgent.system_prompt}
                readOnly
                rows={5}
                className="w-full text-sm dark:bg-[#111213] bg-gray-50 dark:text-gray-400 text-gray-500 border dark:border-[#2a2b2d] border-gray-200 rounded-xl px-3 py-2.5 outline-none resize-none cursor-default"
              />
            </div>

            {/* Agent actions */}
            <div className="px-4 pb-4 flex items-center justify-end gap-2">
              {onDetachAgent && (
                <button
                  onClick={onDetachAgent}
                  className="px-3 py-1.5 text-sm dark:text-amber-400 text-amber-600 dark:hover:bg-amber-500/10 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer border dark:border-amber-500/20 border-amber-200"
                >
                  Detach Agent
                </button>
              )}
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors cursor-pointer font-medium"
              >
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Presets */}
            <div className="px-4 pt-3 flex flex-wrap gap-1.5">
              {PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => setValue(p.prompt)}
                  className="px-2.5 py-1 text-xs rounded-lg dark:bg-white/[0.04] bg-gray-100 dark:text-gray-400 text-gray-500 dark:hover:bg-white/[0.08] hover:bg-gray-200 dark:hover:text-gray-200 hover:text-gray-700 transition-all cursor-pointer border dark:border-white/[0.06] border-gray-200"
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Textarea */}
            <div className="px-4 py-3">
              <textarea
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder="Enter a custom system prompt... (leave empty for default)"
                rows={5}
                className="w-full text-sm dark:bg-[#111213] bg-gray-50 dark:text-gray-200 text-gray-800 border dark:border-[#2a2b2d] border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 resize-none transition-colors"
              />
            </div>

            {/* Actions */}
            <div className="px-4 pb-4 flex items-center justify-between">
              <button
                onClick={() => { setValue(''); onSave(null); }}
                className="text-xs dark:text-gray-500 text-gray-400 dark:hover:text-gray-300 hover:text-gray-600 transition-colors cursor-pointer"
              >
                Use Default
              </button>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 text-sm rounded-lg dark:text-gray-400 text-gray-600 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => onSave(value.trim() || null)}
                  className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors cursor-pointer font-medium"
                >
                  Save
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
