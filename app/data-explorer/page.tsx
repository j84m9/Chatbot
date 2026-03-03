'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import DataExplorerSidebar, { SavedQuery } from '@/app/components/data-explorer/DataExplorerSidebar';
import ConnectionManager from '@/app/components/data-explorer/ConnectionManager';
import QueryChat, { Exchange } from '@/app/components/data-explorer/QueryChat';
import ResultsPanel from '@/app/components/data-explorer/ResultsPanel';
import { useKeyboardShortcuts } from '@/app/hooks/useKeyboardShortcuts';

interface RefineContext {
  exchangeIndex: number;
  type: 'chart' | 'sql';
  chartIndex?: number;
}

export default function DataExplorer() {
  const supabase = createClient();

  // Auth & profile
  const [userProfile, setUserProfile] = useState<any>(null);

  // Dark mode
  const [darkMode, setDarkMode] = useState(true);

  // Sidebar
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Connections
  const [connections, setConnections] = useState<any[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [showConnectionModal, setShowConnectionModal] = useState(false);

  // Sessions
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Exchanges (query history for current session)
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [selectedExchangeIndex, setSelectedExchangeIndex] = useState(-1);
  const [isQuerying, setIsQuerying] = useState(false);

  // Refinement state
  const [refineContext, setRefineContext] = useState<RefineContext | null>(null);

  // BYOK settings state
  const [selectedProvider, setSelectedProvider] = useState('ollama');
  const [selectedModel, setSelectedModel] = useState('llama3.2:1b');
  const [modelCatalog, setModelCatalog] = useState<Record<string, { id: string; label: string }[]>>({});
  const [providerNames, setProviderNames] = useState<Record<string, string>>({});
  const [savedApiKeys, setSavedApiKeys] = useState<Record<string, string | null>>({});

  // Saved queries
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);

  // Lifted input state for QueryChat (allows schema browser to insert text)
  const [queryInput, setQueryInput] = useState('');

  // Draggable split pane
  const [splitPosition, setSplitPosition] = useState(45); // percentage
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load user profile
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .single()
          .then(({ data }) => {
            setUserProfile(data ? { ...data, email: user.email } : { email: user.email });
          });
      } else {
        window.location.href = '/login';
      }
    });
  }, [supabase.auth]);

  // Load dark mode preference
  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const isDark = saved ? saved === 'dark' : true;
    setDarkMode(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  // Fetch model catalog + user settings on mount
  useEffect(() => {
    fetch('/api/models').then(r => r.json()).then(data => {
      setModelCatalog(data.models);
      setProviderNames(data.providers);
    });
    fetch('/api/settings').then(r => r.json()).then(data => {
      if (data.selected_provider) setSelectedProvider(data.selected_provider);
      if (data.selected_model) setSelectedModel(data.selected_model);
      setSavedApiKeys({
        openai: data.openai_api_key,
        anthropic: data.anthropic_api_key,
        google: data.google_api_key,
      });
    });
  }, []);

  const saveSettings = async (updates: Record<string, any>) => {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const data = await res.json();
      setSavedApiKeys({
        openai: data.openai_api_key,
        anthropic: data.anthropic_api_key,
        google: data.google_api_key,
      });
    }
  };

  const handleProviderChange = (provider: string) => {
    setSelectedProvider(provider);
    const firstModel = modelCatalog[provider]?.[0]?.id || '';
    setSelectedModel(firstModel);
    saveSettings({ selected_provider: provider, selected_model: firstModel });
  };

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    saveSettings({ selected_model: model });
  };

  const handleSaveApiKey = (apiKey: string) => {
    const apiKeyField = `${selectedProvider}_api_key`;
    saveSettings({ [apiKeyField]: apiKey });
  };

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', next);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  // Keyboard shortcuts
  const shortcuts = useMemo(() => ({
    'meta+n': () => handleNewQuery(),
    'meta+/': () => setSidebarCollapsed(prev => !prev),
    'escape': () => {
      if (refineContext) setRefineContext(null);
    },
  }), [refineContext]);
  useKeyboardShortcuts(shortcuts);

  // Load saved queries
  const fetchSavedQueries = useCallback(async () => {
    const res = await fetch('/api/data-explorer/saved-queries');
    if (res.ok) {
      const data = await res.json();
      setSavedQueries(data);
    }
  }, []);

  useEffect(() => {
    fetchSavedQueries();
  }, [fetchSavedQueries]);

  const handleSaveQuery = async (data: { question: string; sql: string; explanation: string | null; chartConfigs: any }) => {
    if (!activeConnectionId) return;
    const name = prompt('Enter a name for this saved query:');
    if (!name?.trim()) return;

    const res = await fetch('/api/data-explorer/saved-queries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        question: data.question,
        sql_query: data.sql,
        explanation: data.explanation,
        chart_configs: data.chartConfigs,
        connection_id: activeConnectionId,
      }),
    });

    if (res.ok) {
      fetchSavedQueries();
    }
  };

  const handleDeleteSavedQuery = async (id: string) => {
    const res = await fetch(`/api/data-explorer/saved-queries?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      setSavedQueries(prev => prev.filter(q => q.id !== id));
    }
  };

  const handleRunSavedQuery = (query: SavedQuery) => {
    // Set the connection and submit the question
    if (query.connection_id !== activeConnectionId) {
      setActiveConnectionId(query.connection_id);
    }
    handleSubmitQuestion(query.question);
  };

  const handleInsertColumn = (text: string) => {
    setQueryInput(prev => prev ? prev + ' ' + text : text);
  };

  // Load connections
  const fetchConnections = useCallback(async () => {
    const res = await fetch('/api/data-explorer/connections');
    if (res.ok) {
      const data = await res.json();
      setConnections(data);
      if (data.length > 0 && !activeConnectionId) {
        setActiveConnectionId(data[0].id);
      }
    }
  }, [activeConnectionId]);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  // Load sessions
  const fetchSessions = useCallback(async () => {
    const res = await fetch('/api/data-explorer/sessions');
    if (res.ok) {
      const data = await res.json();
      setSessions(data);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleConnectionSave = (conn: any) => {
    setConnections(prev => [conn, ...prev]);
    if (!activeConnectionId) setActiveConnectionId(conn.id);
    setShowConnectionModal(false);
  };

  const handleNewQuery = () => {
    setSessionId(null);
    setExchanges([]);
    setSelectedExchangeIndex(-1);
    setRefineContext(null);
  };

  const handleSelectSession = async (id: string) => {
    setSessionId(id);
    setExchanges([]);
    setSelectedExchangeIndex(-1);
    setRefineContext(null);

    try {
      const res = await fetch(`/api/data-explorer/messages?sessionId=${id}`);
      if (!res.ok) return;
      const data = await res.json();

      // Switch to the session's connection so the user can continue querying
      if (data.connectionId) {
        setActiveConnectionId(data.connectionId);
      }

      const loaded: Exchange[] = (data.messages ?? []).map((msg: any) => {
        let results = null;
        if (msg.results && msg.results.columns) {
          // Infer column types from the first row of data
          const types: Record<string, string> = {};
          const firstRow = msg.results.rows?.[0];
          if (firstRow) {
            for (const col of msg.results.columns) {
              const val = firstRow[col];
              types[col] = val === null ? 'unknown'
                : typeof val === 'number' ? 'number'
                : typeof val === 'boolean' ? 'boolean'
                : 'string';
            }
          }
          results = {
            rows: msg.results.rows ?? [],
            columns: msg.results.columns,
            types,
            rowCount: msg.row_count ?? msg.results.rows?.length ?? 0,
            executionTimeMs: msg.execution_time_ms ?? 0,
          };
        }

        return {
          id: msg.id,
          question: msg.question,
          sql: msg.sql_query ?? null,
          explanation: msg.explanation ?? null,
          results,
          chartConfig: msg.chart_config ?? null,
          chartConfigs: msg.chart_configs ?? null,
          error: msg.error ?? null,
          isLoading: false,
          messageType: msg.message_type ?? 'query',
          parentMessageId: msg.parent_message_id ?? null,
        } satisfies Exchange;
      });

      setExchanges(loaded);
      if (loaded.length > 0) {
        setSelectedExchangeIndex(loaded.length - 1);
      }
    } catch {
      // If loading fails, session is selected but exchanges stay empty
    }
  };

  const handleDeleteSession = async (id: string) => {
    const res = await fetch(`/api/data-explorer/sessions?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      setSessions(prev => prev.filter(s => s.id !== id));
      if (sessionId === id) handleNewQuery();
    }
  };

  const handleSubmitQuestion = async (question: string) => {
    if (!activeConnectionId) return;

    const exchangeId = crypto.randomUUID();
    const newExchange: Exchange = {
      id: exchangeId,
      question,
      sql: null,
      explanation: null,
      results: null,
      chartConfig: null,
      chartConfigs: null,
      error: null,
      isLoading: true,
      statusMessage: 'Starting...',
    };

    setExchanges(prev => [...prev, newExchange]);
    setSelectedExchangeIndex(exchanges.length);
    setIsQuerying(true);

    try {
      const res = await fetch('/api/data-explorer/query-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          connectionId: activeConnectionId,
          sessionId,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error('Stream request failed');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const { stage, data } = JSON.parse(line.slice(6));

            setExchanges(prev =>
              prev.map(ex => {
                if (ex.id !== exchangeId) return ex;
                switch (stage) {
                  case 'status':
                    return { ...ex, statusMessage: data.message };
                  case 'sql':
                    return { ...ex, sql: data.sql };
                  case 'results':
                    return { ...ex, results: data.results };
                  case 'explanation':
                    return { ...ex, explanation: data.explanation };
                  case 'charts':
                    return {
                      ...ex,
                      chartConfig: data.chartConfig,
                      chartConfigs: data.chartConfigs,
                    };
                  case 'error':
                    return {
                      ...ex,
                      error: data.message,
                      sql: data.sql || ex.sql,
                      isLoading: false,
                    };
                  case 'complete':
                    if (data.sessionId && !sessionId) {
                      setSessionId(data.sessionId);
                      fetchSessions();
                    } else if (data.sessionId) {
                      fetchSessions();
                    }
                    return { ...ex, isLoading: false, statusMessage: undefined };
                  default:
                    return ex;
                }
              })
            );
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch (err: any) {
      setExchanges(prev =>
        prev.map(ex =>
          ex.id === exchangeId
            ? { ...ex, error: err.message || 'Request failed', isLoading: false }
            : ex
        )
      );
    } finally {
      setIsQuerying(false);
    }
  };

  // Chart refinement handler
  const handleRefineChart = (chartIndex: number) => {
    setRefineContext({
      exchangeIndex: selectedExchangeIndex,
      type: 'chart',
      chartIndex,
    });
  };

  // SQL refinement handler
  const handleRefineSql = () => {
    setRefineContext({
      exchangeIndex: selectedExchangeIndex,
      type: 'sql',
    });
  };

  const handleCancelRefine = () => {
    setRefineContext(null);
  };

  const handleRefineSubmit = async (instruction: string) => {
    if (!refineContext || !activeConnectionId) return;

    const targetExchange = exchanges[refineContext.exchangeIndex];
    if (!targetExchange) return;

    setIsQuerying(true);

    try {
      if (refineContext.type === 'chart') {
        // Chart refinement: update charts in place on the original exchange
        const currentConfigs = targetExchange.chartConfigs
          || (targetExchange.chartConfig ? [targetExchange.chartConfig] : []);

        const res = await fetch('/api/data-explorer/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: instruction,
            connectionId: activeConnectionId,
            sessionId,
            messageType: 'chart_refinement',
            parentMessageId: targetExchange.id,
            chartConfigs: currentConfigs,
            exchangeData: {
              results: targetExchange.results,
            },
          }),
        });

        const data = await res.json();

        if (data.chartConfigs) {
          setExchanges(prev =>
            prev.map((ex, i) =>
              i === refineContext.exchangeIndex
                ? {
                    ...ex,
                    chartConfig: data.chartConfig || data.chartConfigs?.[0] || ex.chartConfig,
                    chartConfigs: data.chartConfigs,
                  }
                : ex
            )
          );
        }
      } else {
        // SQL refinement: create a new exchange with modified SQL
        const exchangeId = crypto.randomUUID();
        const newExchange: Exchange = {
          id: exchangeId,
          question: instruction,
          sql: null,
          explanation: null,
          results: null,
          chartConfig: null,
          chartConfigs: null,
          error: null,
          isLoading: true,
          messageType: 'sql_refinement',
          parentMessageId: targetExchange.id,
        };

        setExchanges(prev => [...prev, newExchange]);
        setSelectedExchangeIndex(exchanges.length);

        const res = await fetch('/api/data-explorer/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: instruction,
            connectionId: activeConnectionId,
            sessionId,
            messageType: 'sql_refinement',
            parentMessageId: targetExchange.id,
            exchangeData: {
              sql: targetExchange.sql,
              question: targetExchange.question,
            },
          }),
        });

        const data = await res.json();

        if (data.sessionId) {
          fetchSessions();
        }

        setExchanges(prev =>
          prev.map(ex =>
            ex.id === exchangeId
              ? {
                  ...ex,
                  sql: data.sql,
                  explanation: data.explanation,
                  results: data.results,
                  chartConfig: data.chartConfig,
                  chartConfigs: data.chartConfigs,
                  error: data.error,
                  isLoading: false,
                }
              : ex
          )
        );
      }
    } catch (err: any) {
      // If chart refinement fails, don't create a broken exchange
      if (refineContext.type === 'sql') {
        setExchanges(prev =>
          prev.map(ex =>
            ex.isLoading
              ? { ...ex, error: err.message || 'Request failed', isLoading: false }
              : ex
          )
        );
      }
    } finally {
      setIsQuerying(false);
      setRefineContext(null);
    }
  };

  // Insight generation handler
  const handleRequestInsights = async () => {
    const exchange = exchanges[selectedExchangeIndex];
    if (!exchange || !activeConnectionId) return;

    // Set loading state on insights
    setExchanges(prev =>
      prev.map((ex, i) =>
        i === selectedExchangeIndex ? { ...ex, insights: 'Generating insights...' } : ex
      )
    );

    try {
      const res = await fetch('/api/data-explorer/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: exchange.question,
          connectionId: activeConnectionId,
          messageType: 'insight',
          exchangeData: {
            results: {
              columns: exchange.results?.columns,
              rows: exchange.results?.rows?.slice(0, 20),
              rowCount: exchange.results?.rowCount,
            },
          },
        }),
      });

      const data = await res.json();

      setExchanges(prev =>
        prev.map((ex, i) =>
          i === selectedExchangeIndex
            ? { ...ex, insights: data.insights || data.error || 'No insights available.' }
            : ex
        )
      );
    } catch {
      setExchanges(prev =>
        prev.map((ex, i) =>
          i === selectedExchangeIndex
            ? { ...ex, insights: 'Failed to generate insights.' }
            : ex
        )
      );
    }
  };

  // Drag handle for split pane
  const handleMouseDown = () => {
    isDragging.current = true;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = Math.min(Math.max((x / rect.width) * 100, 25), 75);
      setSplitPosition(pct);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const selectedExchange = selectedExchangeIndex >= 0 ? exchanges[selectedExchangeIndex] : null;
  const showResults = selectedExchange != null && (
    selectedExchange.isLoading || !!selectedExchange.sql || !!selectedExchange.results || !!selectedExchange.error
  );

  return (
    <div className="flex h-screen w-full dark:bg-[#0d0d0e] bg-gray-50 dark:text-gray-100 text-gray-900 font-sans overflow-hidden">
      {/* Sidebar */}
      <DataExplorerSidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        connections={connections}
        activeConnectionId={activeConnectionId}
        onSelectConnection={setActiveConnectionId}
        onManageConnections={() => setShowConnectionModal(true)}
        sessions={sessions}
        activeSessionId={sessionId}
        onSelectSession={handleSelectSession}
        onNewQuery={handleNewQuery}
        onDeleteSession={handleDeleteSession}
        userProfile={userProfile}
        onLogout={handleLogout}
        darkMode={darkMode}
        onToggleDarkMode={toggleDarkMode}
        selectedProvider={selectedProvider}
        selectedModel={selectedModel}
        modelCatalog={modelCatalog}
        providerNames={providerNames}
        savedApiKeys={savedApiKeys}
        onProviderChange={handleProviderChange}
        onModelChange={handleModelChange}
        onSaveApiKey={handleSaveApiKey}
        savedQueries={savedQueries}
        onRunSavedQuery={handleRunSavedQuery}
        onDeleteSavedQuery={handleDeleteSavedQuery}
        onInsertColumn={handleInsertColumn}
      />

      {/* Main content: split pane */}
      <div ref={containerRef} className="flex-1 flex relative">
        {/* Ambient glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-indigo-500/[0.03] blur-[100px] pointer-events-none" />

        {/* Header bar */}
        <div className="absolute top-0 left-0 right-0 z-10 px-6 py-3 border-b dark:border-white/[0.06] border-gray-200/80 dark:bg-[#0d0d0e]/80 bg-gray-50/80 backdrop-blur-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-indigo-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75" />
            </svg>
            <span className="text-base font-semibold dark:text-gray-100 text-gray-800">Data Explorer</span>
            {activeConnectionId && connections.find(c => c.id === activeConnectionId) && (
              <span className="text-xs bg-gradient-to-r from-indigo-500/15 to-purple-500/15 dark:text-indigo-300 text-indigo-600 px-3 py-1 rounded-full font-semibold border dark:border-indigo-400/20 border-indigo-300/30 shadow-sm">
                {connections.find(c => c.id === activeConnectionId)?.name}
              </span>
            )}
          </div>
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-lg dark:hover:bg-[#2a2b2d] hover:bg-gray-200 dark:text-gray-400 text-gray-500 transition-colors cursor-pointer"
            title="Toggle dark mode"
          >
            {darkMode ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
              </svg>
            )}
          </button>
        </div>

        {/* Left pane: Query Chat */}
        <div
          className="flex flex-col pt-[57px] transition-[width] duration-300"
          style={{ width: showResults ? `${splitPosition}%` : '100%' }}
        >
          <QueryChat
            exchanges={exchanges}
            selectedIndex={selectedExchangeIndex}
            onSelectExchange={setSelectedExchangeIndex}
            onSubmitQuestion={handleSubmitQuestion}
            isQuerying={isQuerying}
            hasConnection={!!activeConnectionId}
            refineContext={refineContext}
            onCancelRefine={handleCancelRefine}
            onRefineSubmit={handleRefineSubmit}
            inputValue={queryInput}
            onInputChange={setQueryInput}
          />
        </div>

        {showResults && (
          <>
            {/* Drag handle */}
            <div
              onMouseDown={handleMouseDown}
              className="w-1.5 flex-shrink-0 cursor-col-resize dark:bg-[#2a2b2d] bg-gray-200 hover:bg-indigo-500/50 active:bg-indigo-500 transition-colors relative group z-10"
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 rounded-full dark:bg-gray-600 bg-gray-400 group-hover:bg-indigo-400 transition-colors" />
            </div>

            {/* Right pane: Results Panel */}
            <div
              className="flex flex-col pt-[57px]"
              style={{ width: `${100 - splitPosition}%` }}
            >
              <ResultsPanel
                exchange={selectedExchange}
                darkMode={darkMode}
                onClose={() => setSelectedExchangeIndex(-1)}
                onRefineChart={handleRefineChart}
                onRefineSql={handleRefineSql}
                onRequestInsights={handleRequestInsights}
                onSaveQuery={handleSaveQuery}
              />
            </div>
          </>
        )}
      </div>

      {/* Connection modal */}
      {showConnectionModal && (
        <ConnectionManager
          onSave={handleConnectionSave}
          onClose={() => setShowConnectionModal(false)}
        />
      )}
    </div>
  );
}
