'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import DataExplorerSidebar from '@/app/components/data-explorer/DataExplorerSidebar';
import ConnectionManager from '@/app/components/data-explorer/ConnectionManager';
import QueryChat, { Exchange } from '@/app/components/data-explorer/QueryChat';
import ResultsPanel from '@/app/components/data-explorer/ResultsPanel';

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

  // BYOK settings state
  const [selectedProvider, setSelectedProvider] = useState('ollama');
  const [selectedModel, setSelectedModel] = useState('llama3.2:1b');
  const [modelCatalog, setModelCatalog] = useState<Record<string, { id: string; label: string }[]>>({});
  const [providerNames, setProviderNames] = useState<Record<string, string>>({});
  const [savedApiKeys, setSavedApiKeys] = useState<Record<string, string | null>>({});

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
  };

  const handleSelectSession = async (id: string) => {
    setSessionId(id);
    // In a production app you'd load stored messages here.
    // For now, start with a clean slate when switching sessions.
    setExchanges([]);
    setSelectedExchangeIndex(-1);
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
      error: null,
      isLoading: true,
    };

    setExchanges(prev => [...prev, newExchange]);
    setSelectedExchangeIndex(exchanges.length);
    setIsQuerying(true);

    try {
      const res = await fetch('/api/data-explorer/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          connectionId: activeConnectionId,
          sessionId,
        }),
      });

      const data = await res.json();

      // If this created a new session, track it
      if (data.sessionId && !sessionId) {
        setSessionId(data.sessionId);
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
                error: data.error,
                isLoading: false,
              }
            : ex
        )
      );
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
          className="flex flex-col pt-[57px]"
          style={{ width: `${splitPosition}%` }}
        >
          <QueryChat
            exchanges={exchanges}
            selectedIndex={selectedExchangeIndex}
            onSelectExchange={setSelectedExchangeIndex}
            onSubmitQuestion={handleSubmitQuestion}
            isQuerying={isQuerying}
            hasConnection={!!activeConnectionId}
          />
        </div>

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
          />
        </div>
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
