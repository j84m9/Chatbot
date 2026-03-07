'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { ChartConfig } from './PlotlyChart';
import AgentStepsTimeline, { AgentStepEvent } from './AgentStepsTimeline';
import MarkdownRenderer from '@/app/components/MarkdownRenderer';

/** Strip markdown formatting to plain text for button labels */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')   // **bold**
    .replace(/\*(.+?)\*/g, '$1')       // *italic*
    .replace(/__(.+?)__/g, '$1')       // __bold__
    .replace(/_(.+?)_/g, '$1')         // _italic_
    .replace(/`(.+?)`/g, '$1')         // `code`
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // [link](url)
}

/** Parse [SUGGESTIONS] block from agent explanation text */
function parseSuggestions(text: string): { cleanText: string; suggestions: string[] } {
  const match = text.match(/\[SUGGESTIONS\]\s*\n([\s\S]*?)\n?\[\/SUGGESTIONS\]/);
  if (!match) return { cleanText: text, suggestions: [] };
  const suggestions = match[1]
    .split('\n')
    .map(line => stripMarkdown(line.replace(/^[-*\d.]\s*/, '').trim()))
    .filter(Boolean);
  const cleanText = text.replace(/\[SUGGESTIONS\]\s*\n[\s\S]*?\n?\[\/SUGGESTIONS\]/, '').trim();
  return { cleanText, suggestions };
}

export interface Exchange {
  id: string;
  question: string;
  sql: string | null;
  explanation: string | null;
  results: {
    rows: Record<string, any>[];
    columns: string[];
    types: Record<string, string>;
    rowCount: number;
    executionTimeMs: number;
  } | null;
  chartConfig: any;
  chartConfigs: ChartConfig[] | null;
  error: string | null;
  errorSuggestion?: string | null;
  isLoading: boolean;
  messageType?: string;
  parentMessageId?: string | null;
  insights?: string | null;
  insightsLoading?: boolean;
  statusMessage?: string;
  agentSteps?: AgentStepEvent[];
  isAgentMode?: boolean;
}

interface RefineContext {
  exchangeIndex: number;
  type: 'chart' | 'sql';
  chartIndex?: number;
}

interface QueryChatProps {
  exchanges: Exchange[];
  selectedIndex: number;
  onSelectExchange: (index: number) => void;
  onSubmitQuestion: (question: string) => void;
  onSubmitAgentFollowUp?: (question: string) => void;
  onEditQuestion?: (index: number, newQuestion: string) => void;
  isQuerying: boolean;
  onStop?: () => void;
  hasConnection: boolean;
  refineContext?: RefineContext | null;
  onCancelRefine?: () => void;
  onRefineSubmit?: (instruction: string) => void;
  // Controlled input (optional — falls back to internal state)
  inputValue?: string;
  onInputChange?: (value: string) => void;
  // Fire effect (controlled by parent for full-page overlay)
  fireEffect?: boolean;
  onTriggerFire?: () => void;
  // Dark mode (needed for gradient overlay)
  darkMode?: boolean;
  // Insights
  onRequestInsights?: (exchangeIndex: number) => void;
  // Model selector
  selectedProvider?: string;
  selectedModel?: string;
  modelCatalog?: Record<string, { id: string; label: string }[]>;
  providerNames?: Record<string, string>;
  savedApiKeys?: Record<string, string | null>;
  onQuickModelSwitch?: (provider: string, model: string) => void;
  queryMode?: 'quick' | 'agent';
}

export default function QueryChat({
  exchanges, selectedIndex, onSelectExchange, onSubmitQuestion, onEditQuestion,
  isQuerying, onStop, hasConnection, refineContext, onCancelRefine, onRefineSubmit,
  inputValue: controlledInput, onInputChange,
  fireEffect, onTriggerFire,
  darkMode,
  onRequestInsights,
  selectedProvider, selectedModel, modelCatalog, providerNames, savedApiKeys, onQuickModelSwitch,
  queryMode = 'quick',
  onSubmitAgentFollowUp,
}: QueryChatProps) {
  const [internalInput, setInternalInput] = useState('');
  const input = controlledInput !== undefined ? controlledInput : internalInput;
  const setInput = onInputChange || setInternalInput;
  const endRef = useRef<HTMLDivElement>(null);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [openProviderDropdown, setOpenProviderDropdown] = useState<string | null>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedResponseIndex, setCopiedResponseIndex] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

  // Close model dropdown on outside click
  useEffect(() => {
    if (!modelDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (modelDropdownRef.current?.contains(e.target as Node)) return;
      setModelDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [modelDropdownOpen]);

  const [selectedSuggestions, setSelectedSuggestions] = useState<Record<string, Set<number>>>({});

  const currentModelLabel = modelCatalog && selectedProvider && selectedModel
    ? modelCatalog[selectedProvider]?.find(m => m.id === selectedModel)?.label || selectedModel
    : selectedModel || '';

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [exchanges]);

  const copyQuestion = useCallback((index: number) => {
    navigator.clipboard.writeText(exchanges[index].question);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }, [exchanges]);

  const copyResponse = useCallback((index: number) => {
    const ex = exchanges[index];
    const text = ex.explanation || ex.error || '';
    navigator.clipboard.writeText(text);
    setCopiedResponseIndex(index);
    setTimeout(() => setCopiedResponseIndex(null), 2000);
  }, [exchanges]);

  const startEditing = useCallback((index: number) => {
    setEditText(exchanges[index].question);
    setEditingIndex(index);
  }, [exchanges]);

  const cancelEditing = useCallback(() => {
    setEditingIndex(null);
    setEditText('');
  }, []);

  const submitEdit = useCallback(() => {
    if (editingIndex === null || !editText.trim()) return;
    if (onEditQuestion) {
      onEditQuestion(editingIndex, editText.trim());
    }
    setEditingIndex(null);
    setEditText('');
  }, [editingIndex, editText, onEditQuestion]);

  const resendQuestion = useCallback((index: number) => {
    if (onEditQuestion) {
      onEditQuestion(index, exchanges[index].question);
    }
  }, [exchanges, onEditQuestion]);

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitEdit();
    }
    if (e.key === 'Escape') {
      cancelEditing();
    }
  }, [submitEdit, cancelEditing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isQuerying) return;

    if (refineContext && onRefineSubmit) {
      onRefineSubmit(input);
    } else {
      onSubmitQuestion(input);
    }
    setInput('');
  };

  const suggestions = [
    { text: 'Show me all tables', icon: 'M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125m0 0h-7.5' },
    { text: 'Total rows per table', icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z' },
    { text: 'Top 10 largest tables', icon: 'M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0 1 16.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.04 6.04 0 0 1-2.27.853m-4.52 0a6.04 6.04 0 0 1-2.27-.853' },
    { text: 'List all columns with types', icon: 'M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z' },
  ];

  const refineLabel = refineContext
    ? refineContext.type === 'chart'
      ? 'Refining chart'
      : 'Refining SQL'
    : null;

  return (
    <div className="relative flex flex-col h-full">
      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden w-full scroll-smooth px-4">
        <div className="max-w-3xl mx-auto py-8 pb-44 space-y-6">
          {exchanges.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center mt-28">
              <button
                onClick={onTriggerFire}
                className="w-16 h-16 dark:bg-[#1a1b1c] bg-white rounded-2xl border dark:border-[#2a2b2d] border-gray-200 shadow-2xl shadow-indigo-500/5 flex items-center justify-center mb-8 cursor-pointer relative active:scale-95 transition-transform hover:shadow-indigo-500/15 hover:border-indigo-500/30"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-8 h-8 text-indigo-400 relative z-10 ${fireEffect ? 'animate-db-radar' : ''}`}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75" />
                </svg>
                {/* Radar pulse rings */}
                {fireEffect && (
                  <>
                    <span className="absolute inset-0 rounded-2xl border-2 border-indigo-400/50 animate-db-radar-ring" />
                    <span className="absolute inset-0 rounded-2xl border-2 border-indigo-400/40 animate-db-radar-ring" style={{ animationDelay: '0.15s' }} />
                    <span className="absolute inset-0 rounded-2xl border border-indigo-400/25 animate-db-radar-ring" style={{ animationDelay: '0.3s' }} />
                    <span className="absolute inset-0 rounded-2xl bg-indigo-400/10 animate-db-radar-glow" />
                  </>
                )}
              </button>
              <h3 className="text-3xl font-semibold dark:text-gray-100 text-gray-800 tracking-tight">
                {queryMode === 'agent' ? 'Agent Mode' : 'Ask your database'}
              </h3>
              <p className="dark:text-gray-500 text-gray-400 mt-3 text-sm max-w-sm leading-relaxed">
                {queryMode === 'agent'
                  ? 'Multi-step reasoning with self-correction. The agent will explore your schema, write SQL, and fix errors autonomously.'
                  : 'Type a question in plain English and get SQL, results, and charts instantly.'}
              </p>

              {hasConnection && (
                <div className="flex flex-wrap justify-center gap-2 mt-8 max-w-lg">
                  {suggestions.map(s => (
                    <button
                      key={s.text}
                      onClick={() => setInput(s.text)}
                      className="px-4 py-2 text-sm dark:bg-white/[0.04] bg-white dark:text-gray-400 text-gray-500 rounded-xl border dark:border-white/[0.08] border-gray-200 dark:hover:bg-white/[0.08] hover:bg-gray-100 dark:hover:text-gray-200 hover:text-gray-700 dark:hover:border-white/[0.12] hover:border-gray-300 transition-all cursor-pointer"
                    >
                      {s.text}
                    </button>
                  ))}
                </div>
              )}

              {!hasConnection && (
                <div className="mt-8 px-4 py-3 rounded-xl border dark:border-amber-500/20 border-amber-200 dark:bg-amber-500/5 bg-amber-50 max-w-sm">
                  <p className="text-xs dark:text-amber-400 text-amber-600 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 flex-shrink-0">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                    </svg>
                    Add a database connection in the sidebar to get started.
                  </p>
                </div>
              )}
            </div>
          )}

          {exchanges.map((ex, i) => (
            <div key={ex.id} className="space-y-2">
              {/* User question */}
              <div className="flex flex-col items-end group/q">
                {editingIndex === i ? (
                  <div className="max-w-[85%] w-full">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={handleEditKeyDown}
                      autoFocus
                      rows={3}
                      className="w-full px-4 py-3 text-sm dark:bg-[#1a1b1c] bg-white dark:text-gray-100 text-gray-800 border-2 border-indigo-500 rounded-2xl outline-none resize-none"
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <button
                        onClick={cancelEditing}
                        className="text-sm px-3 py-1.5 rounded-lg dark:text-gray-400 text-gray-600 dark:hover:bg-[#2a2b2d] hover:bg-gray-200 transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={submitEdit}
                        disabled={!editText.trim()}
                        className="text-sm px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-40 transition-colors cursor-pointer"
                      >
                        Send
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => onSelectExchange(i)}
                      className={`px-4 py-2.5 max-w-[85%] text-sm text-left rounded-2xl rounded-br-sm transition-all cursor-pointer ${
                        selectedIndex === i
                          ? 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                          : 'bg-gradient-to-br from-indigo-500/80 to-indigo-600/80 text-white/90 hover:from-indigo-500 hover:to-indigo-600'
                      }`}
                    >
                      <span className="whitespace-pre-wrap">{ex.question}</span>
                    </button>
                    {/* Action buttons — below bubble, visible on hover */}
                    <div className="flex items-center gap-0.5 mt-1 mr-1 opacity-0 group-hover/q:opacity-100 transition-all duration-200">
                      <button
                        onClick={() => copyQuestion(i)}
                        className="p-1.5 rounded-lg dark:hover:bg-white/[0.06] hover:bg-gray-100 dark:text-gray-500 text-gray-400 dark:hover:text-gray-300 hover:text-gray-600 transition-all cursor-pointer hover:scale-110 active:scale-95"
                        title="Copy"
                      >
                        {copiedIndex === i ? (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 text-emerald-400">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                          </svg>
                        )}
                      </button>
                      {!isQuerying && onEditQuestion && (
                        <button
                          onClick={() => startEditing(i)}
                          className="p-1.5 rounded-lg dark:hover:bg-white/[0.06] hover:bg-gray-100 dark:text-gray-500 text-gray-400 dark:hover:text-gray-300 hover:text-gray-600 transition-all cursor-pointer hover:scale-110 active:scale-95"
                          title="Edit & resend"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                          </svg>
                        </button>
                      )}
                      {!isQuerying && onEditQuestion && (
                        <button
                          onClick={() => resendQuestion(i)}
                          className="p-1.5 rounded-lg dark:hover:bg-white/[0.06] hover:bg-gray-100 dark:text-gray-500 text-gray-400 dark:hover:text-gray-300 hover:text-gray-600 transition-all cursor-pointer hover:scale-110 active:scale-95"
                          title="Resend"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                            <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Assistant response */}
              <div className="flex flex-col items-start group/a">
                <div
                  onClick={() => onSelectExchange(i)}
                  className={`px-4 py-2.5 max-w-[85%] text-sm rounded-2xl rounded-bl-sm border transition-all cursor-pointer ${
                    selectedIndex === i
                      ? 'dark:bg-[#1e1f20] bg-white dark:border-indigo-500/30 border-indigo-300 shadow-sm'
                      : 'dark:bg-[#161718] bg-gray-50 dark:border-white/[0.06] border-gray-200/80 hover:dark:border-white/[0.12] hover:shadow-sm'
                  }`}
                >
                  {ex.isLoading ? (
                    <div>
                      <div className="flex items-center gap-2 py-1">
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <div className="w-2.5 h-2.5 animate-orb" style={{ animationDelay: '0ms' }} />
                          <div className="w-2 h-2 animate-orb" style={{ animationDelay: '300ms' }} />
                          <div className="w-1.5 h-1.5 animate-orb" style={{ animationDelay: '600ms' }} />
                        </div>
                        <span className="text-xs dark:text-gray-400 text-gray-500 animate-pulse">
                          {ex.statusMessage || 'Processing...'}
                        </span>
                      </div>
                      {ex.isAgentMode && ex.agentSteps && ex.agentSteps.length > 0 && (
                        <AgentStepsTimeline steps={ex.agentSteps} isLoading />
                      )}
                    </div>
                  ) : ex.error && !ex.sql ? (
                    <div>
                      <span className="text-red-400 text-sm">{ex.error}</span>
                      {ex.errorSuggestion && (
                        <p className="text-xs dark:text-gray-400 text-gray-500 mt-1">{ex.errorSuggestion}</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {ex.isAgentMode && ex.agentSteps && ex.agentSteps.length > 0 && (
                        <AgentStepsTimeline steps={ex.agentSteps} />
                      )}
                      {(() => {
                        const { cleanText, suggestions } = parseSuggestions(ex.explanation || 'Query executed.');
                        const selected = selectedSuggestions[ex.id] || new Set<number>();
                        return (
                          <>
                            <div className="dark:text-gray-300 text-gray-700 leading-relaxed text-sm">
                              <MarkdownRenderer content={cleanText} />
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {ex.isAgentMode && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-medium">Agent</span>
                              )}
                              {ex.sql && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 font-medium">SQL</span>
                              )}
                              {ex.results && (
                                <>
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">
                                    {ex.results.rowCount.toLocaleString()} rows
                                  </span>
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 font-medium">
                                    {ex.results.executionTimeMs}ms
                                  </span>
                                </>
                              )}
                              {(ex.chartConfigs && ex.chartConfigs.length > 0) ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-medium">
                                  {ex.chartConfigs.length === 1 ? 'Chart' : `${ex.chartConfigs.length} Charts`}
                                </span>
                              ) : ex.chartConfig ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-medium">Chart</span>
                              ) : null}
                              {ex.error && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 font-medium">Error</span>
                              )}
                            </div>
                            {/* Agent follow-up suggestions */}
                            {suggestions.length > 0 && !ex.isLoading && (
                              <div className="mt-3 space-y-2">
                                <p className="text-[11px] font-medium dark:text-gray-500 text-gray-400 uppercase tracking-wider">Follow-up analyses</p>
                                <div className="flex flex-col gap-1.5">
                                  {suggestions.map((suggestion, si) => (
                                    <button
                                      key={si}
                                      onClick={() => {
                                        setSelectedSuggestions(prev => {
                                          const curr = new Set(prev[ex.id] || []);
                                          if (curr.has(si)) curr.delete(si); else curr.add(si);
                                          return { ...prev, [ex.id]: curr };
                                        });
                                      }}
                                      className={`flex items-center gap-2 text-left px-3 py-2 rounded-lg text-xs transition-all cursor-pointer ${
                                        selected.has(si)
                                          ? 'dark:bg-indigo-500/15 bg-indigo-50 dark:text-indigo-300 text-indigo-600 dark:border-indigo-500/30 border-indigo-300 border'
                                          : 'dark:bg-white/[0.03] bg-gray-50 dark:text-gray-400 text-gray-500 dark:border-white/[0.06] border-gray-200 border dark:hover:bg-white/[0.06] hover:bg-gray-100'
                                      }`}
                                    >
                                      <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                                        selected.has(si)
                                          ? 'bg-indigo-500 border-indigo-500'
                                          : 'dark:border-gray-600 border-gray-300'
                                      }`}>
                                        {selected.has(si) && (
                                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5 text-white">
                                            <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                                          </svg>
                                        )}
                                      </div>
                                      {suggestion}
                                    </button>
                                  ))}
                                </div>
                                {selected.size > 0 && (
                                  <button
                                    onClick={() => {
                                      const items = suggestions.filter((_, si) => selected.has(si));
                                      const prompt = items.length === 1
                                        ? items[0]
                                        : 'Please analyze the following:\n' + items.map(s => `- ${s}`).join('\n');
                                      // Always route through agent handler for full analysis with charts
                                      const submit = onSubmitAgentFollowUp || onSubmitQuestion;
                                      submit(prompt);
                                      setSelectedSuggestions(prev => {
                                        const next = { ...prev };
                                        delete next[ex.id];
                                        return next;
                                      });
                                    }}
                                    disabled={isQuerying}
                                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                      <path d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.344-5.891a1.5 1.5 0 0 0 0-2.538L6.3 2.841Z" />
                                    </svg>
                                    Run {selected.size} selected
                                  </button>
                                )}
                              </div>
                            )}
                            {ex.isAgentMode && ex.results && !ex.insights && !ex.insightsLoading && onRequestInsights && (
                              <button
                                onClick={() => onRequestInsights(i)}
                                className="mt-1 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium dark:text-indigo-400 text-indigo-600 dark:bg-indigo-500/10 bg-indigo-50 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 rounded-lg transition-colors cursor-pointer"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
                                </svg>
                                Generate deeper insights?
                              </button>
                            )}
                            {ex.insightsLoading && (
                              <div className="flex items-center gap-2 mt-1 text-xs dark:text-gray-400 text-gray-500">
                                <div className="w-3 h-3 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                                Generating insights...
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
                {/* Copy button for response */}
                {!ex.isLoading && (ex.explanation || ex.error) && (
                  <div className="flex items-center gap-0.5 mt-1 ml-1 opacity-0 group-hover/a:opacity-100 transition-all duration-200">
                    <button
                      onClick={() => copyResponse(i)}
                      className="p-1.5 rounded-lg dark:hover:bg-white/[0.06] hover:bg-gray-100 dark:text-gray-500 text-gray-400 dark:hover:text-gray-300 hover:text-gray-600 transition-all cursor-pointer hover:scale-110 active:scale-95"
                      title="Copy"
                    >
                      {copiedResponseIndex === i ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 text-emerald-400">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                        </svg>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          <div ref={endRef} />
        </div>
      </div>

      {/* Floating input area */}
      <div
        className="absolute bottom-0 left-0 w-full pb-6 pt-16 px-4 pointer-events-none"
        style={{ background: darkMode ? 'linear-gradient(to top, #0d0d0e 40%, transparent)' : 'linear-gradient(to top, #f9fafb 40%, transparent)' }}
      >
        <div className="max-w-3xl mx-auto w-full pointer-events-auto">
          {/* Refine context indicator */}
          {refineContext && (
            <div className="mb-2 py-2 px-3 rounded-xl dark:bg-[#161718] bg-white border dark:border-[#2a2b2d] border-gray-200 flex items-center gap-2">
              <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 font-medium">
                {refineLabel}
              </span>
              <span className="text-xs dark:text-gray-500 text-gray-400 truncate flex-1">
                Query #{refineContext.exchangeIndex + 1}
              </span>
              {onCancelRefine && (
                <button
                  onClick={onCancelRefine}
                  className="text-xs px-2 py-1 rounded-lg dark:text-gray-500 text-gray-400 dark:hover:text-gray-300 hover:text-gray-600 dark:hover:bg-white/[0.04] hover:bg-gray-100 transition-all cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
          )}
          <form onSubmit={handleSubmit} className={`dark:bg-[#161718] bg-white rounded-2xl border shadow-xl transition-all duration-300 ${queryMode === 'agent' ? 'dark:border-amber-500/20 border-amber-300/40 dark:shadow-amber-900/10 shadow-amber-200/30 focus-within:border-amber-500/40 focus-within:ring-2 focus-within:ring-amber-500/10' : 'dark:border-white/[0.08] border-gray-200 dark:shadow-black/30 shadow-gray-300/40 focus-within:border-indigo-500/40 focus-within:ring-2 focus-within:ring-indigo-500/10'}`}>
            {/* Textarea row */}
            <textarea
              className="w-full pt-4 pb-2 px-4 outline-none dark:text-gray-100 text-gray-800 bg-transparent dark:placeholder-gray-500 placeholder-gray-400 text-[15px] resize-none max-h-40 overflow-y-auto"
              rows={1}
              value={input}
              placeholder={
                refineContext
                  ? refineContext.type === 'chart'
                    ? 'Describe how to change the chart (e.g., "make it a pie chart")...'
                    : 'Describe how to modify the SQL (e.g., "add WHERE salary > 50000")...'
                  : !hasConnection
                    ? 'Add a connection first...'
                    : queryMode === 'agent'
                      ? 'Ask a complex question — the agent will reason step by step...'
                      : 'Ask a question about your data...'
              }
              onChange={e => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (input.trim() && !isQuerying && hasConnection) {
                    (e.target as HTMLTextAreaElement).form?.requestSubmit();
                  }
                }
              }}
              disabled={isQuerying || !hasConnection}
            />
            {/* Toolbar row */}
            <div className="flex items-center justify-between px-2 pb-2 pt-0.5">
              <div className="flex items-center gap-0.5">
                {/* Model selector */}
                {modelCatalog && providerNames && onQuickModelSwitch && (
                  <div ref={modelDropdownRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setModelDropdownOpen(prev => !prev)}
                      className="flex items-center gap-1.5 text-[11px] dark:text-gray-500 text-gray-400 dark:hover:text-gray-300 hover:text-gray-600 transition-colors cursor-pointer rounded-lg px-2 py-1.5 dark:hover:bg-white/[0.06] hover:bg-gray-100"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
                      </svg>
                      {currentModelLabel}
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5">
                        <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                      </svg>
                    </button>
                    {modelDropdownOpen && (
                      <div className="absolute bottom-full left-0 mb-1.5 w-64 dark:bg-[#1a1b1c] bg-white border dark:border-[#2a2b2d] border-gray-200 rounded-xl shadow-2xl shadow-black/8 dark:shadow-black/40 ring-1 ring-black/[0.03] dark:ring-white/[0.03] overflow-hidden z-50 animate-slide-up">
                        <div className="py-1 max-h-80 overflow-y-auto">
                          {Object.entries(modelCatalog).map(([provider, models]) => {
                            const hasKey = provider === 'ollama' || !!savedApiKeys?.[provider];
                            const isActiveProvider = selectedProvider === provider;
                            const isOpen = openProviderDropdown === provider;
                            const activeModel = isActiveProvider ? models.find(m => m.id === selectedModel) : null;
                            return (
                              <div key={provider}>
                                <button
                                  type="button"
                                  disabled={!hasKey}
                                  onClick={() => setOpenProviderDropdown(prev => prev === provider ? null : provider)}
                                  className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors ${
                                    hasKey ? 'cursor-pointer' : 'cursor-not-allowed'
                                  } ${
                                    isActiveProvider
                                      ? 'dark:bg-indigo-500/8 bg-indigo-50/50'
                                      : hasKey
                                        ? 'dark:hover:bg-white/[0.04] hover:bg-gray-50'
                                        : ''
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span className={`font-medium ${
                                      hasKey
                                        ? isActiveProvider
                                          ? 'dark:text-indigo-300 text-indigo-600'
                                          : 'dark:text-gray-300 text-gray-700'
                                        : 'dark:text-gray-600 text-gray-400'
                                    }`}>
                                      {providerNames?.[provider] || provider}
                                    </span>
                                    {!hasKey && (
                                      <span className="text-[9px] dark:text-gray-600 text-gray-400 dark:bg-white/[0.06] bg-gray-100 px-1 py-0.5 rounded">no key</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-[11px] ${
                                      isActiveProvider
                                        ? 'dark:text-indigo-300/70 text-indigo-500'
                                        : 'dark:text-gray-500 text-gray-400'
                                    }`}>
                                      {activeModel ? activeModel.label : hasKey ? 'Select...' : ''}
                                    </span>
                                    {hasKey && (
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`w-3 h-3 dark:text-gray-500 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                                        <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                                      </svg>
                                    )}
                                  </div>
                                </button>
                                {isOpen && hasKey && (
                                  <div className="dark:bg-white/[0.02] bg-gray-50/50">
                                    {models.map((m) => {
                                      const isActive = isActiveProvider && selectedModel === m.id;
                                      return (
                                        <button
                                          key={`${provider}-${m.id}`}
                                          type="button"
                                          onClick={() => {
                                            onQuickModelSwitch!(provider, m.id);
                                            setModelDropdownOpen(false);
                                            setOpenProviderDropdown(null);
                                          }}
                                          className={`w-full text-left pl-6 pr-3 py-1.5 text-xs transition-colors cursor-pointer ${
                                            isActive
                                              ? 'dark:bg-indigo-500/15 bg-indigo-50 dark:text-indigo-300 text-indigo-600 font-medium'
                                              : 'dark:text-gray-300 text-gray-700 dark:hover:bg-white/[0.06] hover:bg-gray-100'
                                          }`}
                                        >
                                          {m.label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {queryMode === 'agent' && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/15 dark:text-amber-400 text-amber-600 border dark:border-amber-500/20 border-amber-300/30">
                    Agent
                  </span>
                )}
                {isQuerying ? (
                  <button
                    type="button"
                    onClick={onStop}
                    className="p-2 rounded-xl transition-all duration-200 active:scale-90 cursor-pointer text-red-500 hover:text-red-400 hover:bg-red-500/10 hover:shadow-md hover:shadow-red-500/20"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim() || !hasConnection}
                    className={`p-2 rounded-xl transition-all duration-200 active:scale-90 cursor-pointer ${input.trim() ? 'text-indigo-500 hover:text-indigo-400 hover:bg-indigo-500/10 hover:shadow-md hover:shadow-indigo-500/20' : 'text-gray-500'}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                      <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </form>
          <div className="text-center mt-3 text-[11px] dark:text-gray-600 text-gray-400">
            AI-generated SQL may be imprecise. Always verify before running on production data.
          </div>
        </div>
      </div>
    </div>
  );
}
