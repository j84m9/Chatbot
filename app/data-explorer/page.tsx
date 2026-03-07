'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import DataExplorerSidebar, { SavedQuery } from '@/app/components/data-explorer/DataExplorerSidebar';
import ConnectionManager from '@/app/components/data-explorer/ConnectionManager';
import QueryChat, { Exchange } from '@/app/components/data-explorer/QueryChat';
import ResultsPanel from '@/app/components/data-explorer/ResultsPanel';
import Dashboard, { PinnedChart } from '@/app/components/data-explorer/Dashboard';
import type { ChartConfig } from '@/app/components/data-explorer/PlotlyChart';
import type { GlobalFilter } from '@/types/dashboard';
import { applyFiltersToSql } from '@/utils/dashboard-filters';
import AgentBrowser from '@/app/components/AgentBrowser';
import { useKeyboardShortcuts } from '@/app/hooks/useKeyboardShortcuts';
import SqlEditor, { type SqlEditorHandle } from '@/app/components/data-explorer/SqlEditor';

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
  const [selectedModel, setSelectedModel] = useState('llama3.2:3b');
  const [modelCatalog, setModelCatalog] = useState<Record<string, { id: string; label: string }[]>>({});
  const [providerNames, setProviderNames] = useState<Record<string, string>>({});
  const [savedApiKeys, setSavedApiKeys] = useState<Record<string, string | null>>({});

  // Saved queries
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);

  // Lifted input state for QueryChat (allows schema browser to insert text)
  const [queryInput, setQueryInput] = useState('');

  // Dashboard state
  const [pinnedCharts, setPinnedCharts] = useState<PinnedChart[]>([]);
  const [viewMode, setViewMode] = useState<'query' | 'dashboard'>('query');
  const [dashboardTitle, setDashboardTitle] = useState('Dashboard');
  const [dashboardId, setDashboardId] = useState<string | null>(null);
  const [refreshingCharts, setRefreshingCharts] = useState<Set<string>>(new Set());
  const [globalFilters, setGlobalFilters] = useState<GlobalFilter[]>([]);
  const autoRefreshTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // Query mode: quick (single-shot) vs agent (agentic loop)
  const [queryMode, setQueryMode] = useState<'quick' | 'agent'>('quick');

  // SQL editor mode
  const [editorMode, setEditorMode] = useState<'chat' | 'sql'>('chat');
  const [editorSql, setEditorSql] = useState('');
  const sqlEditorRef = useRef<SqlEditorHandle>(null);

  // Agent state
  const [installedAgents, setInstalledAgents] = useState<any[]>([]);
  const [activeAgent, setActiveAgent] = useState<any>(null);
  const [agentBrowserOpen, setAgentBrowserOpen] = useState(false);
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);

  // Fire explosion easter egg
  const [fireEffect, setFireEffect] = useState(false);

  // Abort controller for cancelling in-flight queries
  const queryAbortRef = useRef<AbortController | null>(null);

  // Draggable split pane
  const [splitPosition, setSplitPosition] = useState(45); // percentage (horizontal)
  const [verticalSplitPosition, setVerticalSplitPosition] = useState(50); // percentage (vertical, for SQL mode)
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

  const handleQuickModelSwitch = (provider: string, model: string) => {
    setSelectedProvider(provider);
    setSelectedModel(model);
    saveSettings({ selected_provider: provider, selected_model: model });
  };

  // Agent handlers
  const fetchInstalledAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents');
      if (res.ok) {
        const data = await res.json();
        setInstalledAgents(data);
      }
    } catch (err) {
      console.error('Failed to fetch installed agents:', err);
    }
  }, []);

  useEffect(() => {
    fetchInstalledAgents();
  }, [fetchInstalledAgents]);

  const selectAgent = async (agent: any | null) => {
    setActiveAgent(agent);
    if (sessionId) {
      await fetch('/api/data-explorer/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessionId, agent_id: agent?.id || null }),
      });
    }
  };

  const installAgent = async (storeAgent: any) => {
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_agent_id: storeAgent.id,
          name: storeAgent.name,
          description: storeAgent.description,
          system_prompt: storeAgent.system_prompt,
          job_category: storeAgent.job_category,
          logo_url: storeAgent.logo_url,
          downloads: storeAgent.downloads,
          tools: storeAgent.tools,
          skills: storeAgent.skills,
          parent_agent_id: storeAgent.parent_agent_id,
          store_created_by: storeAgent.created_by,
        }),
      });
      if (res.ok) {
        await fetchInstalledAgents();
      }
    } catch (err) {
      console.error('Failed to install agent:', err);
    }
  };

  const uninstallAgent = async (agentId: string) => {
    try {
      const res = await fetch(`/api/agents?id=${agentId}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchInstalledAgents();
        if (activeAgent?.id === agentId) {
          setActiveAgent(null);
        }
      }
    } catch (err) {
      console.error('Failed to uninstall agent:', err);
    }
  };

  // Close agent dropdown on outside click
  const agentDropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!agentDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (agentDropdownRef.current && !agentDropdownRef.current.contains(e.target as Node)) {
        setAgentDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [agentDropdownOpen]);

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
    if (editorMode === 'sql') {
      sqlEditorRef.current?.insertText(text);
    } else {
      setQueryInput(prev => prev ? prev + ' ' + text : text);
    }
  };

  // Load connections
  const fetchConnections = useCallback(async () => {
    const res = await fetch('/api/data-explorer/connections');
    if (res.ok) {
      const data = await res.json();
      setConnections(data);
      if (data.length > 0) {
        setActiveConnectionId(prev => prev ?? data[0].id);
      }
    }
  }, []);

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
    setActiveConnectionId(conn.id);
  };

  const handleConnectionUpdate = (conn: any) => {
    setConnections(prev => prev.map(c => c.id === conn.id ? conn : c));
  };

  const handleConnectionDelete = (id: string) => {
    setConnections(prev => prev.filter(c => c.id !== id));
    if (activeConnectionId === id) {
      setActiveConnectionId(connections.find(c => c.id !== id)?.id || null);
    }
  };

  const handleNewQuery = () => {
    setSessionId(null);
    setExchanges([]);
    setSelectedExchangeIndex(-1);
    setRefineContext(null);
    setActiveAgent(null);
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

      // Restore agent if session has one
      if (data.agentId) {
        const agent = installedAgents.find(a => a.id === data.agentId);
        setActiveAgent(agent || null);
      } else {
        setActiveAgent(null);
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
          insights: msg.insights ?? null,
          agentSteps: msg.agent_steps || undefined,
          isAgentMode: !!msg.agent_steps,
        } satisfies Exchange;
      });

      setExchanges(loaded);
    } catch {
      // If loading fails, session is selected but exchanges stay empty
    }
  };

  const handleRenameSession = async (id: string, newTitle: string) => {
    const res = await fetch('/api/data-explorer/sessions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title: newTitle }),
    });
    if (res.ok) {
      setSessions(prev => prev.map(s =>
        s.id === id ? { ...s, title: newTitle, ai_title: newTitle } : s
      ));
    }
  };

  const handleDeleteSession = async (id: string) => {
    const res = await fetch(`/api/data-explorer/sessions?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      setSessions(prev => prev.filter(s => s.id !== id));
      if (sessionId === id) handleNewQuery();
    }
  };

  const handleEditQuestion = (index: number, newQuestion: string) => {
    // Remove the edited exchange and everything after it, then re-submit
    setExchanges(prev => prev.slice(0, index));
    setSelectedExchangeIndex(index > 0 ? index - 1 : -1);
    // Re-submit with the edited question after state update
    setTimeout(() => {
      if (queryMode === 'agent') {
        handleSubmitAgentQuestion(newQuestion);
      } else {
        handleSubmitQuestion(newQuestion);
      }
    }, 10);
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

    const abortController = new AbortController();
    queryAbortRef.current = abortController;

    try {
      const res = await fetch('/api/data-explorer/query-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          connectionId: activeConnectionId,
          sessionId,
          agentId: activeAgent?.id || null,
        }),
        signal: abortController.signal,
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
                      errorSuggestion: data.suggestion || null,
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
      if (err.name === 'AbortError') {
        setExchanges(prev =>
          prev.map(ex =>
            ex.id === exchangeId ? { ...ex, isLoading: false, statusMessage: undefined } : ex
          )
        );
      } else {
        setExchanges(prev =>
          prev.map(ex =>
            ex.id === exchangeId
              ? { ...ex, error: err.message || 'Request failed', isLoading: false }
              : ex
          )
        );
      }
    } finally {
      queryAbortRef.current = null;
      setIsQuerying(false);
    }
  };

  const handleExecuteSql = async (sql: string) => {
    if (!activeConnectionId) return;

    const exchangeId = crypto.randomUUID();
    const newExchange: Exchange = {
      id: exchangeId,
      question: sql,
      sql,
      explanation: null,
      results: null,
      chartConfig: null,
      chartConfigs: null,
      error: null,
      isLoading: true,
      statusMessage: 'Running query...',
      messageType: 'direct_sql',
    };

    setExchanges(prev => [...prev, newExchange]);
    setSelectedExchangeIndex(exchanges.length);
    setIsQuerying(true);

    const abortController = new AbortController();
    queryAbortRef.current = abortController;

    try {
      const res = await fetch('/api/data-explorer/execute-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql,
          connectionId: activeConnectionId,
          sessionId,
        }),
        signal: abortController.signal,
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
      if (err.name === 'AbortError') {
        setExchanges(prev =>
          prev.map(ex =>
            ex.id === exchangeId ? { ...ex, isLoading: false, statusMessage: undefined } : ex
          )
        );
      } else {
        setExchanges(prev =>
          prev.map(ex =>
            ex.id === exchangeId
              ? { ...ex, error: err.message || 'Request failed', isLoading: false }
              : ex
          )
        );
      }
    } finally {
      queryAbortRef.current = null;
      setIsQuerying(false);
    }
  };

  const handleQueryTable = (tableName: string) => {
    const conn = connections.find(c => c.id === activeConnectionId);
    const isSqlite = conn?.db_type === 'sqlite';
    const sql = isSqlite
      ? `SELECT * FROM "${tableName}" LIMIT 1000;`
      : `SELECT TOP 1000 * FROM [${tableName}];`;
    setEditorSql(sql);
    setEditorMode('sql');
  };

  const handleAddDatabase = async (sourceConnectionId: string, databaseName: string) => {
    const source = connections.find(c => c.id === sourceConnectionId);
    if (!source) return;
    try {
      const res = await fetch('/api/data-explorer/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceConnectionId,
          database: databaseName,
          name: `${source.server} / ${databaseName}`,
          server: source.server,
          port: source.port,
          authType: source.auth_type,
          username: source.username,
          domain: source.domain,
          encrypt: source.encrypt,
          trustServerCertificate: source.trust_server_certificate,
          dbType: 'mssql',
        }),
      });
      if (res.ok) {
        const newConn = await res.json();
        setConnections(prev => [newConn, ...prev]);
        setActiveConnectionId(newConn.id);
      }
    } catch {
      // silently fail — user will see the popover didn't close
    }
  };

  const handleSubmitAgentQuestion = async (question: string) => {
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
      statusMessage: 'Agent is thinking...',
      isAgentMode: true,
      agentSteps: [],
    };

    setExchanges(prev => [...prev, newExchange]);
    setSelectedExchangeIndex(exchanges.length);
    setIsQuerying(true);

    const abortController = new AbortController();
    queryAbortRef.current = abortController;

    try {
      const res = await fetch('/api/data-explorer/agent-query-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          connectionId: activeConnectionId,
          sessionId,
          agentId: activeAgent?.id || null,
        }),
        signal: abortController.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error('Agent stream request failed');
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
                  case 'agent_step':
                    return { ...ex, agentSteps: [...(ex.agentSteps || []), data] };
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
                      insightsLoading: true,
                    };
                  case 'insights':
                    return {
                      ...ex,
                      insights: data.insights,
                      insightsLoading: false,
                    };
                  case 'error':
                    return {
                      ...ex,
                      error: data.message,
                      errorSuggestion: data.suggestion || null,
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
                    return { ...ex, isLoading: false, statusMessage: undefined, insightsLoading: false };
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
      if (err.name === 'AbortError') {
        setExchanges(prev =>
          prev.map(ex =>
            ex.id === exchangeId ? { ...ex, isLoading: false, statusMessage: undefined, insightsLoading: false } : ex
          )
        );
      } else {
        setExchanges(prev =>
          prev.map(ex =>
            ex.id === exchangeId
              ? { ...ex, error: err.message || 'Agent request failed', isLoading: false }
              : ex
          )
        );
      }
    } finally {
      queryAbortRef.current = null;
      setIsQuerying(false);
    }
  };

  const handleStopQuery = useCallback(() => {
    queryAbortRef.current?.abort();
  }, []);

  // Chart type change handler (local switch, no API call)
  const handleChangeChartType = (chartIndex: number, newType: string) => {
    setExchanges(prev =>
      prev.map((ex, i) => {
        if (i !== selectedExchangeIndex) return ex;
        const configs = ex.chartConfigs
          || (ex.chartConfig ? [ex.chartConfig] : []);
        const updated = configs.map((c, ci) =>
          ci === chartIndex ? { ...c, chartType: newType as any } : c
        );
        return { ...ex, chartConfigs: updated, chartConfig: updated[0] || ex.chartConfig };
      })
    );
  };

  // Direct chart refinement handler (called inline from ChartGallery)
  const handleDirectChartRefine = async (chartIndex: number, instruction: string) => {
    if (!activeConnectionId) return;

    const targetExchange = exchanges[selectedExchangeIndex];
    if (!targetExchange) return;

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

    if (!res.ok) {
      throw new Error(`Chart refinement failed: ${res.status}`);
    }

    const data = await res.json();

    if (data.chartConfigs) {
      setExchanges(prev =>
        prev.map((ex, i) =>
          i === selectedExchangeIndex
            ? {
                ...ex,
                chartConfig: data.chartConfig || data.chartConfigs?.[0] || ex.chartConfig,
                chartConfigs: data.chartConfigs,
              }
            : ex
        )
      );
    }
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
  const handleRequestInsights = async (exchangeIdx?: number) => {
    const targetIdx = exchangeIdx ?? selectedExchangeIndex;
    const exchange = exchanges[targetIdx];
    if (!exchange || !activeConnectionId) return;

    // Select the exchange so results panel shows it
    if (exchangeIdx !== undefined) {
      setSelectedExchangeIndex(exchangeIdx);
    }

    // Set loading state
    setExchanges(prev =>
      prev.map((ex, i) =>
        i === targetIdx ? { ...ex, insightsLoading: true, insights: null } : ex
      )
    );

    if (exchange.isAgentMode) {
      // Agent mode: use SSE insight agent stream
      try {
        const res = await fetch('/api/data-explorer/insights-agent-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: exchange.question,
            connectionId: activeConnectionId,
            messageId: exchange.id,
            existingResults: {
              columns: exchange.results?.columns,
              rows: exchange.results?.rows?.slice(0, 20),
              types: exchange.results?.types || {},
              rowCount: exchange.results?.rowCount,
            },
            existingExplanation: exchange.explanation,
          }),
        });

        if (!res.ok || !res.body) {
          throw new Error('Insight agent stream request failed');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        const exchangeIdx = targetIdx;

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
                prev.map((ex, i) => {
                  if (i !== exchangeIdx) return ex;
                  switch (stage) {
                    case 'status':
                      return { ...ex, statusMessage: data.message };
                    case 'insights':
                      return { ...ex, insights: data.insights, insightsLoading: false, statusMessage: undefined };
                    case 'complete':
                      return { ...ex, insightsLoading: false, statusMessage: undefined };
                    case 'error':
                      return { ...ex, insightsLoading: false, insights: data.message || 'Failed to generate insights.', statusMessage: undefined };
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
      } catch {
        setExchanges(prev =>
          prev.map((ex, i) =>
            i === targetIdx
              ? { ...ex, insightsLoading: false, insights: 'Failed to generate insights.', statusMessage: undefined }
              : ex
          )
        );
      }
    } else {
      // Quick mode: use simple endpoint
      try {
        const res = await fetch('/api/data-explorer/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: exchange.question,
            connectionId: activeConnectionId,
            messageType: 'insight',
            messageId: exchange.id,
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
            i === targetIdx
              ? { ...ex, insightsLoading: false, insights: data.insights || data.error || 'No insights available.' }
              : ex
          )
        );
      } catch {
        setExchanges(prev =>
          prev.map((ex, i) =>
            i === targetIdx
              ? { ...ex, insightsLoading: false, insights: 'Failed to generate insights.' }
              : ex
          )
        );
      }
    }
  };

  // Annotation handler
  const handleAddAnnotation = async (chartIndex: number, x: number | string, y: number | string, text: string) => {
    const annotationId = crypto.randomUUID();
    let persistConfigs: ChartConfig[] = [];

    setExchanges(prev =>
      prev.map((ex, i) => {
        if (i !== selectedExchangeIndex) return ex;
        const configs = ex.chartConfigs || (ex.chartConfig ? [ex.chartConfig] : []);
        const updated = configs.map((c, ci) => {
          if (ci !== chartIndex) return c;
          const annotations = [...(c.annotations || []), { id: annotationId, x, y, text }];
          return { ...c, annotations, showAnnotations: true };
        });
        persistConfigs = updated;
        return { ...ex, chartConfigs: updated, chartConfig: updated[0] || ex.chartConfig };
      })
    );

    // Persist to DB
    const exchange = exchanges[selectedExchangeIndex];
    if (exchange?.id && persistConfigs.length > 0) {
      fetch('/api/data-explorer/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: exchange.id, chart_configs: persistConfigs }),
      }).catch(err => console.error('Failed to save annotation:', err));
    }
  };

  const handleToggleAnnotations = async (chartIndex: number) => {
    let updatedConfigs: ChartConfig[] = [];
    setExchanges(prev =>
      prev.map((ex, i) => {
        if (i !== selectedExchangeIndex) return ex;
        const configs = ex.chartConfigs || (ex.chartConfig ? [ex.chartConfig] : []);
        updatedConfigs = configs.map((c, ci) => {
          if (ci !== chartIndex) return c;
          return { ...c, showAnnotations: c.showAnnotations === false ? true : false };
        });
        return { ...ex, chartConfigs: updatedConfigs, chartConfig: updatedConfigs[0] || ex.chartConfig };
      })
    );

    // Persist to DB
    const exchange = exchanges[selectedExchangeIndex];
    if (exchange?.id && updatedConfigs.length > 0) {
      fetch('/api/data-explorer/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: exchange.id, chart_configs: updatedConfigs }),
      }).catch(err => console.error('Failed to toggle annotations:', err));
    }
  };

  // Pinned chart handlers
  const fetchPinnedCharts = useCallback(async () => {
    if (!activeConnectionId) return;
    try {
      const res = await fetch(`/api/data-explorer/pinned-charts?connectionId=${activeConnectionId}`);
      if (res.ok) {
        const data = await res.json();
        setPinnedCharts(data);
      }
    } catch (err) {
      console.error('Failed to fetch pinned charts:', err);
    }
  }, [activeConnectionId]);

  useEffect(() => {
    fetchPinnedCharts();
  }, [fetchPinnedCharts]);

  const pinnedSourceMap = useMemo(
    () => new Map(
      pinnedCharts
        .filter(p => (p.chart_config as any)._sourceKey)
        .map(p => [(p.chart_config as any)._sourceKey as string, p.id])
    ),
    [pinnedCharts]
  );

  const handlePinChart = async (chartIndex: number) => {
    const exchange = exchanges[selectedExchangeIndex];
    if (!exchange || !activeConnectionId || !exchange.results) return;

    const configs = exchange.chartConfigs || (exchange.chartConfig ? [exchange.chartConfig] : []);
    const config = configs[chartIndex];
    if (!config) return;

    const sourceKey = `${exchange.id}:${chartIndex}`;
    if (pinnedSourceMap.has(sourceKey)) return; // already pinned

    try {
      const res = await fetch('/api/data-explorer/pinned-charts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: activeConnectionId,
          title: config.title || `Chart from "${exchange.question}"`,
          chart_config: { ...config, _sourceKey: sourceKey },
          results_snapshot: {
            rows: exchange.results.rows,
            columns: exchange.results.columns,
            types: exchange.results.types,
          },
          source_message_id: null,
          source_sql: exchange.sql || null,
          source_question: exchange.question || null,
        }),
      });
      if (res.ok) {
        fetchPinnedCharts();
      }
    } catch (err) {
      console.error('Failed to pin chart:', err);
    }
  };

  const handleUnpinChart = async (id: string) => {
    try {
      const res = await fetch(`/api/data-explorer/pinned-charts?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setPinnedCharts(prev => prev.filter(p => p.id !== id));
      }
    } catch (err) {
      console.error('Failed to unpin chart:', err);
      fetchPinnedCharts();
    }
  };

  const handleLayoutChange = async (id: string, layout: { x: number; y: number; w: number; h: number }) => {
    // Optimistic update
    setPinnedCharts(prev => prev.map(p => p.id === id ? { ...p, layout } : p));
    // Persist
    fetch('/api/data-explorer/pinned-charts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, layout }),
    }).catch(err => console.error('Failed to save layout:', err));
  };

  const handleDashboardChartTypeChange = (id: string, newType: string) => {
    setPinnedCharts(prev => prev.map(p =>
      p.id === id
        ? { ...p, chart_config: { ...p.chart_config, chartType: newType as ChartConfig['chartType'] } }
        : p
    ));
    fetch('/api/data-explorer/pinned-charts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, chart_config: { ...pinnedCharts.find(p => p.id === id)?.chart_config, chartType: newType } }),
    }).catch(err => console.error('Failed to save chart type:', err));
  };

  // Dashboard annotation handlers
  const handleDashboardAddAnnotation = (id: string, x: number | string, y: number | string, text: string) => {
    const pin = pinnedCharts.find(p => p.id === id);
    if (!pin) return;
    const existing = pin.chart_config.annotations || [];
    const updatedConfig = {
      ...pin.chart_config,
      annotations: [...existing, { id: crypto.randomUUID(), x, y, text }],
      showAnnotations: true,
    };
    setPinnedCharts(prev => prev.map(p =>
      p.id === id ? { ...p, chart_config: updatedConfig } : p
    ));
    fetch('/api/data-explorer/pinned-charts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, chart_config: updatedConfig }),
    }).catch(err => console.error('Failed to save dashboard annotation:', err));
  };

  const handleDashboardToggleAnnotations = (id: string) => {
    const pin = pinnedCharts.find(p => p.id === id);
    if (!pin) return;
    const updatedConfig = {
      ...pin.chart_config,
      showAnnotations: pin.chart_config.showAnnotations === false ? true : false,
    };
    setPinnedCharts(prev => prev.map(p =>
      p.id === id ? { ...p, chart_config: updatedConfig } : p
    ));
    fetch('/api/data-explorer/pinned-charts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, chart_config: updatedConfig }),
    }).catch(err => console.error('Failed to toggle dashboard annotations:', err));
  };

  // Dashboard title handlers
  const handleDashboardTitleChange = async (title: string) => {
    setDashboardTitle(title);
    if (dashboardId) {
      fetch('/api/data-explorer/dashboards', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: dashboardId, title }),
      }).catch(err => console.error('Failed to save dashboard title:', err));
    }
  };

  const handleChartTitleChange = (id: string, title: string) => {
    setPinnedCharts(prev => prev.map(p => p.id === id ? { ...p, title } : p));
    fetch('/api/data-explorer/pinned-charts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title }),
    }).catch(err => console.error('Failed to save chart title:', err));
  };

  // Refresh handlers
  const handleRefreshChart = async (id: string) => {
    setRefreshingCharts(prev => new Set(prev).add(id));
    try {
      const res = await fetch('/api/data-explorer/pinned-charts/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chartId: id }),
      });
      if (res.ok) {
        const data = await res.json();
        setPinnedCharts(prev => prev.map(p =>
          p.id === id ? { ...p, results_snapshot: data.results_snapshot, last_refreshed_at: data.last_refreshed_at } : p
        ));
      }
    } catch (err) {
      console.error('Failed to refresh chart:', err);
    } finally {
      setRefreshingCharts(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleRefreshAll = async () => {
    const refreshable = pinnedCharts.filter(p => p.source_sql);
    for (const chart of refreshable) {
      handleRefreshChart(chart.id);
    }
  };

  const handleAutoRefreshChange = (id: string, interval: number) => {
    setPinnedCharts(prev => prev.map(p => p.id === id ? { ...p, auto_refresh_interval: interval } : p));
    fetch('/api/data-explorer/pinned-charts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, auto_refresh_interval: interval }),
    }).catch(err => console.error('Failed to save auto-refresh interval:', err));
  };

  // Auto-refresh timers
  useEffect(() => {
    // Clear all existing timers
    for (const [, timer] of autoRefreshTimers.current) {
      clearInterval(timer);
    }
    autoRefreshTimers.current.clear();

    // Set up timers for charts with auto_refresh_interval
    for (const chart of pinnedCharts) {
      if (chart.auto_refresh_interval && chart.auto_refresh_interval > 0 && chart.source_sql) {
        const timer = setInterval(() => {
          handleRefreshChart(chart.id);
        }, chart.auto_refresh_interval * 1000);
        autoRefreshTimers.current.set(chart.id, timer);
      }
    }

    return () => {
      for (const [, timer] of autoRefreshTimers.current) {
        clearInterval(timer);
      }
    };
  }, [pinnedCharts.map(c => `${c.id}:${c.auto_refresh_interval}`).join(',')]);

  // Global filter handlers
  const handleGlobalFiltersChange = (filters: GlobalFilter[]) => {
    setGlobalFilters(filters);
  };

  const handleApplyAndRefresh = async (filters: GlobalFilter[]) => {
    setGlobalFilters(filters);
    // Persist filters
    if (dashboardId) {
      fetch('/api/data-explorer/dashboards', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: dashboardId, global_filters: filters }),
      }).catch(err => console.error('Failed to save global filters:', err));
    }
    // Refresh all charts with filtered SQL
    const refreshable = pinnedCharts.filter(p => p.source_sql);
    for (const chart of refreshable) {
      const filteredSql = applyFiltersToSql(chart.source_sql!, filters);
      setRefreshingCharts(prev => new Set(prev).add(chart.id));
      try {
        const res = await fetch('/api/data-explorer/pinned-charts/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chartId: chart.id, overrideSql: filteredSql }),
        });
        if (res.ok) {
          const data = await res.json();
          setPinnedCharts(prev => prev.map(p =>
            p.id === chart.id ? { ...p, results_snapshot: data.results_snapshot, last_refreshed_at: data.last_refreshed_at } : p
          ));
        }
      } catch (err) {
        console.error('Failed to refresh chart with filters:', err);
      } finally {
        setRefreshingCharts(prev => {
          const next = new Set(prev);
          next.delete(chart.id);
          return next;
        });
      }
    }
  };

  // Fetch dashboard record on connection change
  useEffect(() => {
    if (!activeConnectionId) return;
    fetch(`/api/data-explorer/dashboards?connectionId=${activeConnectionId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setDashboardId(data.id);
          setDashboardTitle(data.title || 'Dashboard');
          setGlobalFilters(data.global_filters || []);
        }
      })
      .catch(err => console.error('Failed to fetch dashboard:', err));
  }, [activeConnectionId]);

  // Drag handle for split pane
  const dragAxis = useRef<'horizontal' | 'vertical'>('horizontal');

  const handleMouseDown = (axis: 'horizontal' | 'vertical') => {
    isDragging.current = true;
    dragAxis.current = axis;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (dragAxis.current === 'vertical') {
        const y = e.clientY - rect.top;
        const pct = Math.min(Math.max((y / rect.height) * 100, 20), 80);
        setVerticalSplitPosition(pct);
      } else {
        const x = e.clientX - rect.left;
        const pct = Math.min(Math.max((x / rect.width) * 100, 25), 75);
        setSplitPosition(pct);
      }
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
        onRenameSession={handleRenameSession}
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
        onQueryTable={handleQueryTable}
        dbType={connections.find(c => c.id === activeConnectionId)?.db_type === 'sqlite' ? 'sqlite' : 'mssql'}
        onAddDatabase={handleAddDatabase}
      />

      {/* Main content: split pane */}
      <div ref={containerRef} className="flex-1 flex flex-col relative">
        {/* Ambient glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-indigo-500/[0.08] dark:bg-indigo-500/[0.03] blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/3 right-0 w-[400px] h-[400px] bg-purple-500/[0.06] dark:bg-purple-500/[0.02] blur-[120px] pointer-events-none" />

        {/* Header bar */}
        <header className="flex-shrink-0 px-6 py-4 relative z-10 border-b dark:border-white/[0.06] border-gray-200/80 dark:bg-[#0d0d0e]/80 bg-white/70 backdrop-blur-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.05)] dark:shadow-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-status-glow ring-2 ring-emerald-400/20" />
              <span className="text-base font-semibold dark:text-gray-100 text-gray-800">Data Explorer</span>
              {activeConnectionId && connections.find(c => c.id === activeConnectionId) && (
                <span className="text-xs bg-gradient-to-r from-indigo-500/15 to-purple-500/15 dark:text-indigo-300 text-indigo-600 px-3 py-1 rounded-full font-semibold border dark:border-indigo-400/20 border-indigo-300/30 shadow-sm">
                  {connections.find(c => c.id === activeConnectionId)?.name}
                </span>
              )}
              {activeAgent && (
                <span className="text-xs bg-gradient-to-r from-emerald-500/15 to-teal-500/15 dark:text-emerald-300 text-emerald-600 px-3 py-1 rounded-full font-semibold border dark:border-emerald-400/20 border-emerald-300/30 shadow-sm dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
                  {activeAgent.name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {activeConnectionId && (
                <div className="flex items-center gap-1.5 mr-2 text-xs dark:text-gray-500 text-gray-400">
                  <span>{connections.find(c => c.id === activeConnectionId)?.db_type === 'sqlite' ? 'SQLite' : 'MSSQL'}</span>
                </div>
              )}
              {/* Chat / SQL / Agent toggle */}
              <div className="flex items-center dark:bg-[#1e1f20] bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => { setEditorMode('chat'); setQueryMode('quick'); }}
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${editorMode === 'chat' && queryMode === 'quick' ? 'dark:bg-[#2a2b2d] bg-white dark:text-indigo-400 text-indigo-500 shadow-sm' : 'dark:text-gray-500 text-gray-400 dark:hover:text-gray-300 hover:text-gray-600'}`}
                  title="Chat mode — natural language SQL generation"
                >
                  Chat
                </button>
                <button
                  onClick={() => setEditorMode('sql')}
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${editorMode === 'sql' ? 'dark:bg-[#2a2b2d] bg-white dark:text-emerald-400 text-emerald-500 shadow-sm' : 'dark:text-gray-500 text-gray-400 dark:hover:text-gray-300 hover:text-gray-600'}`}
                  title="SQL mode — write and run raw SQL"
                >
                  SQL
                </button>
                <button
                  onClick={() => { setEditorMode('chat'); setQueryMode('agent'); }}
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${editorMode === 'chat' && queryMode === 'agent' ? 'dark:bg-[#2a2b2d] bg-white dark:text-amber-400 text-amber-500 shadow-sm' : 'dark:text-gray-500 text-gray-400 dark:hover:text-gray-300 hover:text-gray-600'}`}
                  title="Agent mode — multi-step reasoning with self-correction"
                >
                  Agent
                </button>
              </div>
              {/* Query / Dashboard toggle */}
              <div className="flex items-center dark:bg-[#1e1f20] bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode('query')}
                  className={`p-1.5 rounded-md transition-colors cursor-pointer ${viewMode === 'query' ? 'dark:bg-[#2a2b2d] bg-white dark:text-indigo-400 text-indigo-500 shadow-sm' : 'dark:text-gray-500 text-gray-400 dark:hover:text-gray-300 hover:text-gray-600'}`}
                  title="Query view"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                </button>
                <button
                  onClick={() => setViewMode('dashboard')}
                  className={`p-1.5 rounded-md transition-colors cursor-pointer relative ${viewMode === 'dashboard' ? 'dark:bg-[#2a2b2d] bg-white dark:text-indigo-400 text-indigo-500 shadow-sm' : 'dark:text-gray-500 text-gray-400 dark:hover:text-gray-300 hover:text-gray-600'}`}
                  title="Dashboard view"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
                  </svg>
                  {pinnedCharts.length > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-indigo-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                      {pinnedCharts.length}
                    </span>
                  )}
                </button>
              </div>
              {/* Agent dropdown */}
              <div ref={agentDropdownRef} className="relative">
                <button
                  onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
                  className={`p-2 rounded-lg transition-colors cursor-pointer ${activeAgent ? 'dark:text-emerald-400 text-emerald-500 dark:hover:bg-emerald-500/10 hover:bg-emerald-50' : 'dark:text-gray-500 text-gray-400 dark:hover:bg-[#2a2b2d] hover:bg-gray-200'}`}
                  title="Select agent"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                  </svg>
                </button>
                {agentDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 w-56 dark:bg-[#1e1f20] bg-white rounded-xl border dark:border-[#2a2b2d] border-gray-200 shadow-xl z-50 py-1 overflow-hidden">
                    {installedAgents.length > 0 && (
                      <div className="max-h-48 overflow-y-auto">
                        {activeAgent && (
                          <button
                            onClick={() => { selectAgent(null); setAgentDropdownOpen(false); }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm dark:text-gray-400 text-gray-500 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 transition-colors cursor-pointer"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                            No agent
                          </button>
                        )}
                        {installedAgents.map(agent => (
                          <button
                            key={agent.id}
                            onClick={() => { selectAgent(agent); setAgentDropdownOpen(false); }}
                            className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors cursor-pointer ${
                              activeAgent?.id === agent.id
                                ? 'dark:bg-emerald-500/10 bg-emerald-50 dark:text-emerald-300 text-emerald-600'
                                : 'dark:text-gray-300 text-gray-700 dark:hover:bg-[#2a2b2d] hover:bg-gray-100'
                            }`}
                          >
                            {agent.logo_url ? (
                              <img src={agent.logo_url} alt="" className="w-4 h-4 rounded object-cover flex-shrink-0" />
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 flex-shrink-0">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                              </svg>
                            )}
                            <span className="truncate">{agent.name}</span>
                            {activeAgent?.id === agent.id && (
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 ml-auto flex-shrink-0">
                                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="border-t dark:border-[#2a2b2d] border-gray-200">
                      <button
                        onClick={() => { setAgentBrowserOpen(true); setAgentDropdownOpen(false); }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm dark:text-indigo-400 text-indigo-500 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 transition-colors cursor-pointer"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
                        </svg>
                        Browse agents...
                      </button>
                    </div>
                  </div>
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
          </div>
        </header>

        {/* Pane row */}
        <div className="flex-1 flex min-h-0">
          {viewMode === 'dashboard' ? (
            <Dashboard
              pinnedCharts={pinnedCharts}
              darkMode={darkMode}
              onUnpin={handleUnpinChart}
              onLayoutChange={handleLayoutChange}
              onChangeChartType={handleDashboardChartTypeChange}
              onAddAnnotation={handleDashboardAddAnnotation}
              onToggleAnnotations={handleDashboardToggleAnnotations}
              connectionName={connections.find(c => c.id === activeConnectionId)?.name}
              dashboardTitle={dashboardTitle}
              dashboardId={dashboardId}
              onDashboardTitleChange={handleDashboardTitleChange}
              onRefreshChart={handleRefreshChart}
              onRefreshAll={handleRefreshAll}
              refreshingCharts={refreshingCharts}
              onAutoRefreshChange={handleAutoRefreshChange}
              onChartTitleChange={handleChartTitleChange}
              globalFilters={globalFilters}
              onGlobalFiltersChange={handleGlobalFiltersChange}
              onApplyAndRefresh={handleApplyAndRefresh}
            />
          ) : editorMode === 'sql' ? (
          /* SQL mode: vertical split (editor top, results bottom) */
          <div className="flex-1 flex flex-col min-h-0">
            <div
              className="flex flex-col"
              style={{ height: showResults ? `${verticalSplitPosition}%` : '100%' }}
            >
              <SqlEditor
                ref={sqlEditorRef}
                initialSql={editorSql}
                onExecute={handleExecuteSql}
                isExecuting={isQuerying}
                darkMode={darkMode}
                dbType={connections.find(c => c.id === activeConnectionId)?.db_type === 'sqlite' ? 'sqlite' : 'mssql'}
              />
            </div>

            {showResults && (
              <>
                {/* Horizontal drag handle */}
                <div
                  onMouseDown={() => handleMouseDown('vertical')}
                  className="h-1.5 flex-shrink-0 cursor-row-resize dark:bg-[#1e1f20] bg-gray-200 hover:bg-indigo-500/50 active:bg-indigo-500 transition-colors relative group z-10"
                >
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-1 w-8 rounded-full dark:bg-gray-600 bg-gray-400 group-hover:bg-indigo-400 transition-colors" />
                </div>

                {/* Bottom pane: Results Panel */}
                <div
                  className="flex flex-col min-h-0"
                  style={{ height: `${100 - verticalSplitPosition}%` }}
                >
                  <ResultsPanel
                    exchange={selectedExchange}
                    darkMode={darkMode}
                    onClose={() => setSelectedExchangeIndex(-1)}
                    onRefineSubmit={handleDirectChartRefine}
                    onRefineSql={handleRefineSql}
                    onOpenInEditor={(sql) => { setEditorSql(sql); setEditorMode('sql'); }}
                    onRequestInsights={() => handleRequestInsights()}
                    onSaveQuery={handleSaveQuery}
                    onChangeChartType={handleChangeChartType}
                    onAddAnnotation={handleAddAnnotation}
                    onToggleAnnotations={handleToggleAnnotations}
                    onPinChart={handlePinChart}
                    onUnpinChart={handleUnpinChart}
                    pinnedSourceMap={pinnedSourceMap}
                  />
                </div>
              </>
            )}
          </div>
          ) : (
          /* Chat/Agent mode: horizontal split (chat left, results right) */
          <>
          <div
            className="flex flex-col transition-[width] duration-300 min-w-0 overflow-hidden"
            style={{ width: showResults ? `${splitPosition}%` : '100%' }}
          >
              <QueryChat
                exchanges={exchanges}
                selectedIndex={selectedExchangeIndex}
                onSelectExchange={setSelectedExchangeIndex}
                onSubmitQuestion={queryMode === 'agent' ? handleSubmitAgentQuestion : handleSubmitQuestion}
                onSubmitAgentFollowUp={handleSubmitAgentQuestion}
                onEditQuestion={handleEditQuestion}
                isQuerying={isQuerying}
                onStop={handleStopQuery}
                hasConnection={!!activeConnectionId}
                refineContext={refineContext}
                onCancelRefine={handleCancelRefine}
                onRefineSubmit={handleRefineSubmit}
                inputValue={queryInput}
                onInputChange={setQueryInput}
                fireEffect={fireEffect}
                onTriggerFire={() => { setFireEffect(true); setTimeout(() => setFireEffect(false), 1700); }}
                darkMode={darkMode}
                onRequestInsights={handleRequestInsights}
                selectedProvider={selectedProvider}
                selectedModel={selectedModel}
                modelCatalog={modelCatalog}
                providerNames={providerNames}
                savedApiKeys={savedApiKeys}
                onQuickModelSwitch={handleQuickModelSwitch}
                queryMode={queryMode}
              />
          </div>

          {showResults && (
            <>
              {/* Vertical drag handle */}
              <div
                onMouseDown={() => handleMouseDown('horizontal')}
                className="w-1.5 flex-shrink-0 cursor-col-resize dark:bg-[#1e1f20] bg-gray-200 hover:bg-indigo-500/50 active:bg-indigo-500 transition-colors relative group z-10"
              >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 rounded-full dark:bg-gray-600 bg-gray-400 group-hover:bg-indigo-400 transition-colors" />
              </div>

              {/* Right pane: Results Panel */}
              <div
                className="flex flex-col"
                style={{ width: `${100 - splitPosition}%` }}
              >
                <ResultsPanel
                  exchange={selectedExchange}
                  darkMode={darkMode}
                  onClose={() => setSelectedExchangeIndex(-1)}
                  onRefineSubmit={handleDirectChartRefine}
                  onRefineSql={handleRefineSql}
                  onOpenInEditor={(sql) => { setEditorSql(sql); setEditorMode('sql'); }}
                  onRequestInsights={() => handleRequestInsights()}
                  onSaveQuery={handleSaveQuery}
                  onChangeChartType={handleChangeChartType}
                  onAddAnnotation={handleAddAnnotation}
                  onToggleAnnotations={handleToggleAnnotations}
                  onPinChart={handlePinChart}
                  onUnpinChart={handleUnpinChart}
                  pinnedSourceMap={pinnedSourceMap}
                />
              </div>
            </>
          )}
          </>
          )}
        </div>

        {/* Full-page radar pulse — rings expand from icon position to window edges */}
        {fireEffect && (
          <div className="absolute inset-0 z-50 pointer-events-none overflow-hidden">
            {[
              { duration: '1.2s', delay: '0s', opacity: 0.35, width: 2 },
              { duration: '1.2s', delay: '0.12s', opacity: 0.25, width: 1.5 },
              { duration: '1.2s', delay: '0.24s', opacity: 0.18, width: 1 },
              { duration: '1.2s', delay: '0.36s', opacity: 0.10, width: 0.5 },
            ].map((ring, i) => (
              <span
                key={i}
                className="absolute rounded-full"
                style={{
                  width: '200vmax',
                  height: '200vmax',
                  left: '50%',
                  top: '40%',
                  translate: '-50% -50%',
                  scale: 0,
                  borderWidth: `${ring.width}px`,
                  borderStyle: 'solid',
                  borderColor: `rgba(129, 140, 248, ${ring.opacity})`,
                  animation: `db-radar-expand ${ring.duration} ease-out forwards`,
                  animationDelay: ring.delay,
                  // @ts-expect-error -- CSS custom property
                  '--ring-opacity': ring.opacity,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Connection modal */}
      {showConnectionModal && (
        <ConnectionManager
          connections={connections}
          activeConnectionId={activeConnectionId}
          onSelect={(id) => { setActiveConnectionId(id); }}
          onDelete={handleConnectionDelete}
          onSave={handleConnectionSave}
          onUpdate={handleConnectionUpdate}
          onClose={() => setShowConnectionModal(false)}
        />
      )}

      {/* Agent browser modal */}
      {agentBrowserOpen && (
        <AgentBrowser
          installedAgents={installedAgents}
          onInstall={installAgent}
          onUninstall={uninstallAgent}
          onSelect={selectAgent}
          onClose={() => setAgentBrowserOpen(false)}
        />
      )}
    </div>
  );
}
