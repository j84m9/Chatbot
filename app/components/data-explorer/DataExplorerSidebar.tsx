'use client';

import { useState, useEffect, useRef } from 'react';
import SchemaBrowser from './SchemaBrowser';

export interface SavedQuery {
  id: string;
  name: string;
  question: string;
  sql_query: string;
  explanation?: string;
  chart_configs?: any;
  connection_id: string;
  created_at: string;
}

interface DataExplorerSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  connections: any[];
  activeConnectionId: string | null;
  onSelectConnection: (id: string) => void;
  onManageConnections: () => void;
  sessions: any[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewQuery: () => void;
  onDeleteSession: (id: string) => void;
  userProfile: any;
  onLogout: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  // Settings (BYOK)
  selectedProvider: string;
  selectedModel: string;
  modelCatalog: Record<string, { id: string; label: string }[]>;
  providerNames: Record<string, string>;
  savedApiKeys: Record<string, string | null>;
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
  onSaveApiKey: (key: string) => void;
  // Saved queries
  savedQueries?: SavedQuery[];
  onRunSavedQuery?: (query: SavedQuery) => void;
  onDeleteSavedQuery?: (id: string) => void;
  // Schema browser
  onInsertColumn?: (text: string) => void;
}

export default function DataExplorerSidebar({
  collapsed, onToggleCollapse, connections, activeConnectionId,
  onSelectConnection, onManageConnections, sessions, activeSessionId,
  onSelectSession, onNewQuery, onDeleteSession, userProfile, onLogout,
  darkMode, onToggleDarkMode,
  selectedProvider, selectedModel, modelCatalog, providerNames,
  savedApiKeys, onProviderChange, onModelChange, onSaveApiKey,
  savedQueries, onRunSavedQuery, onDeleteSavedQuery,
  onInsertColumn,
}: DataExplorerSidebarProps) {
  const activeConn = connections.find(c => c.id === activeConnectionId);
  const [sessionSearch, setSessionSearch] = useState('');
  const [savedQueriesExpanded, setSavedQueriesExpanded] = useState(true);
  const [schemaExpanded, setSchemaExpanded] = useState(false);

  const filteredSessions = sessionSearch.trim()
    ? sessions.filter(s =>
        (s.ai_title || s.title || '').toLowerCase().includes(sessionSearch.toLowerCase())
      )
    : sessions;

  const connectionSavedQueries = savedQueries?.filter(q => q.connection_id === activeConnectionId) || [];

  return (
    <div className={`${collapsed ? 'w-16' : 'w-64'} flex-shrink-0 dark:bg-[#151617] bg-white border-r dark:border-[#2a2b2d] border-gray-200 flex flex-col z-20 shadow-xl transition-[width] duration-300`}>
      {/* Top bar */}
      <div className={`flex gap-2 ${collapsed ? 'flex-col items-center px-2 pt-3 pb-1' : 'flex-row items-center p-3'}`}>
        <button
          onClick={onToggleCollapse}
          className="flex-shrink-0 p-2.5 rounded-xl dark:hover:bg-[#2a2b2d] hover:bg-gray-100 dark:text-gray-400 text-gray-600 transition-colors cursor-pointer"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        <button
          onClick={onNewQuery}
          className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all shadow-lg shadow-indigo-500/10 font-medium active:scale-[0.98] cursor-pointer flex-1 px-3 py-2.5"
          title="New Query"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 flex-shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {!collapsed && <span>New Query</span>}
        </button>
      </div>

      {/* Navigation link back to Chat */}
      <div className={`px-3 pb-2 ${collapsed ? 'flex justify-center' : ''}`}>
        <a
          href="/"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm dark:text-gray-400 text-gray-500 dark:hover:bg-[#1e1f20] hover:bg-gray-100 dark:hover:text-gray-200 hover:text-gray-800 transition-colors ${collapsed ? 'justify-center px-2' : ''}`}
          title="Back to Chat"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 flex-shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
          </svg>
          {!collapsed && <span>Chat</span>}
        </a>
      </div>

      {/* Connection indicator */}
      {!collapsed && (
        <div className="px-3 pb-3">
          <button
            onClick={onManageConnections}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm border dark:border-[#2a2b2d] border-gray-200 dark:hover:bg-[#1e1f20] hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${activeConn ? 'bg-emerald-400 shadow-md shadow-emerald-400/50' : 'bg-gray-500'}`} />
            <span className="truncate dark:text-gray-300 text-gray-600 flex-1 text-left">
              {activeConn ? activeConn.name : 'No connection'}
            </span>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 dark:text-gray-500 text-gray-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15 12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
            </svg>
          </button>

          {/* Connection list dropdown if multiple */}
          {connections.length > 1 && (
            <div className="mt-1 space-y-0.5">
              {connections.filter(c => c.id !== activeConnectionId).map(c => (
                <button
                  key={c.id}
                  onClick={() => onSelectConnection(c.id)}
                  className="w-full text-left px-3 py-1.5 rounded-lg text-xs dark:text-gray-500 text-gray-400 dark:hover:bg-[#1e1f20] hover:bg-gray-100 dark:hover:text-gray-300 hover:text-gray-600 truncate transition-colors cursor-pointer"
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {collapsed && (
        <div className="flex justify-center px-2 pb-2">
          <button
            onClick={onManageConnections}
            className="p-2 rounded-lg dark:hover:bg-[#2a2b2d] hover:bg-gray-100 transition-colors cursor-pointer"
            title={activeConn ? activeConn.name : 'Manage connections'}
          >
            <div className={`w-2.5 h-2.5 rounded-full ${activeConn ? 'bg-emerald-400 shadow-md shadow-emerald-400/50' : 'bg-gray-500'}`} />
          </button>
        </div>
      )}

      {/* Scrollable sections */}
      <div className={`flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-3 transition-opacity duration-200 ${collapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>

        {/* Schema Browser */}
        {activeConnectionId && (
          <div>
            <button
              onClick={() => setSchemaExpanded(!schemaExpanded)}
              className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider px-2 w-full cursor-pointer hover:text-gray-400 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-3 h-3 transition-transform ${schemaExpanded ? 'rotate-90' : ''}`}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
              Schema
            </button>
            {schemaExpanded && (
              <div className="mt-2">
                <SchemaBrowser
                  connectionId={activeConnectionId}
                  onInsertColumn={onInsertColumn}
                />
              </div>
            )}
          </div>
        )}

        {/* Saved Queries */}
        {connectionSavedQueries.length > 0 && (
          <div>
            <button
              onClick={() => setSavedQueriesExpanded(!savedQueriesExpanded)}
              className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider px-2 w-full cursor-pointer hover:text-gray-400 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-3 h-3 transition-transform ${savedQueriesExpanded ? 'rotate-90' : ''}`}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
              Saved Queries
            </button>
            {savedQueriesExpanded && (
              <div className="mt-1 space-y-0.5">
                {connectionSavedQueries.map(q => (
                  <div key={q.id} className="relative group">
                    <button
                      onClick={() => onRunSavedQuery?.(q)}
                      className="w-full text-left px-3 py-2 pr-8 rounded-lg text-sm truncate dark:text-gray-400 text-gray-600 dark:hover:bg-[#1e1f20] hover:bg-gray-100 dark:hover:text-gray-200 hover:text-gray-900 transition-colors cursor-pointer flex items-center gap-2"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 text-amber-400 flex-shrink-0">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                      </svg>
                      <span className="truncate">{q.name}</span>
                    </button>
                    <button
                      onClick={() => onDeleteSavedQuery?.(q.id)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-all cursor-pointer"
                      title="Delete saved query"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                        <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Query History */}
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2 whitespace-nowrap">Query History</div>

          {/* Session search */}
          <div className="px-1 mb-2">
            <input
              value={sessionSearch}
              onChange={e => setSessionSearch(e.target.value)}
              placeholder="Search sessions..."
              className="w-full text-xs dark:bg-[#111213] bg-gray-50 dark:text-gray-300 text-gray-600 border dark:border-[#2a2b2d] border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-500/40 transition-colors placeholder:dark:text-gray-600 placeholder:text-gray-400"
            />
          </div>

          <div className="space-y-0.5">
            {filteredSessions.length === 0 ? (
              <div className="text-gray-500 text-sm px-3 italic whitespace-nowrap">
                {sessionSearch.trim() ? 'No matching sessions' : 'No past queries'}
              </div>
            ) : (
              filteredSessions.map(session => (
                <div key={session.id} className="relative group">
                  <button
                    onClick={() => onSelectSession(session.id)}
                    className={`w-full text-left px-3 py-2.5 pr-8 rounded-lg text-sm truncate transition-colors cursor-pointer ${
                      activeSessionId === session.id
                        ? 'dark:bg-indigo-500/[0.08] bg-indigo-50 dark:text-indigo-300 text-indigo-600 font-medium border-l-2 border-indigo-500 dark:border-indigo-400'
                        : 'dark:hover:bg-white/[0.04] hover:bg-gray-100 dark:text-gray-400 text-gray-600 dark:hover:text-gray-200 hover:text-gray-900'
                    }`}
                  >
                    {session.ai_title || session.title}
                  </button>
                  <button
                    onClick={() => onDeleteSession(session.id)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-all cursor-pointer"
                    title="Delete"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.519.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 1 .7.798l-.35 5.25a.75.75 0 0 1-1.497-.1l.35-5.25a.75.75 0 0 1 .797-.699Zm2.84 0a.75.75 0 0 1 .798.699l.35 5.25a.75.75 0 0 1-1.498.1l-.35-5.25a.75.75 0 0 1 .7-.798Z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* User Profile Box */}
      <UserProfileBox
        collapsed={collapsed}
        userProfile={userProfile}
        onLogout={onLogout}
        darkMode={darkMode}
        onToggleDarkMode={onToggleDarkMode}
        selectedProvider={selectedProvider}
        selectedModel={selectedModel}
        modelCatalog={modelCatalog}
        providerNames={providerNames}
        savedApiKeys={savedApiKeys}
        onProviderChange={onProviderChange}
        onModelChange={onModelChange}
        onSaveApiKey={onSaveApiKey}
      />
    </div>
  );
}

// ─── Settings + Profile sub-component ────────────────────────────────

function UserProfileBox({
  collapsed, userProfile, onLogout, darkMode, onToggleDarkMode,
  selectedProvider, selectedModel, modelCatalog, providerNames,
  savedApiKeys, onProviderChange, onModelChange, onSaveApiKey,
}: {
  collapsed: boolean;
  userProfile: any;
  onLogout: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  selectedProvider: string;
  selectedModel: string;
  modelCatalog: Record<string, { id: string; label: string }[]>;
  providerNames: Record<string, string>;
  savedApiKeys: Record<string, string | null>;
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
  onSaveApiKey: (key: string) => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsToggleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (settingsRef.current?.contains(target)) return;
      if (settingsToggleRef.current?.contains(target)) return;
      setSettingsOpen(false);
    };
    if (settingsOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [settingsOpen]);

  const handleSaveKey = () => {
    onSaveApiKey(apiKeyInput);
    setApiKeyInput('');
  };

  return (
    <div className="border-t border-[#2a2b2d] dark:bg-[#1a1b1c] bg-gray-100 flex flex-col gap-3 relative p-3">
      <div ref={settingsToggleRef} className={`flex ${collapsed ? 'flex-col items-center gap-2' : 'items-center gap-3 px-1'}`}>
        <button
          onClick={(e) => { e.stopPropagation(); setSettingsOpen(!settingsOpen); }}
          className="w-8 h-8 flex-shrink-0 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-sm font-bold text-white shadow-md uppercase cursor-pointer"
          title="Settings"
        >
          {userProfile?.username?.charAt(0) || userProfile?.first_name?.charAt(0) || userProfile?.email?.charAt(0) || '?'}
        </button>
        <div className={`flex flex-col truncate flex-1 min-w-0 transition-opacity duration-200 ${collapsed ? 'opacity-0 w-0 hidden' : 'opacity-100'}`}>
          <span className="text-sm font-medium dark:text-gray-200 text-gray-800 truncate">
            {!userProfile ? 'Loading...' : userProfile.username ? userProfile.username : userProfile.first_name ? `${userProfile.first_name} ${userProfile.last_name}` : userProfile.email}
          </span>
          <span className="text-xs text-gray-500 truncate">
            {userProfile?.email || 'Authenticating...'}
          </span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); setSettingsOpen(!settingsOpen); }}
          className={`p-1.5 rounded-lg dark:hover:bg-[#2a2b2d] hover:bg-gray-200 text-gray-500 dark:hover:text-gray-200 hover:text-gray-700 transition-all cursor-pointer flex-shrink-0 ${collapsed ? 'hidden' : ''}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        </button>
      </div>

      {/* Settings Dropdown */}
      {settingsOpen && (
        <div ref={settingsRef} className="absolute bottom-full left-0 mb-2 w-72 dark:bg-[#1a1b1c] bg-white dark:border-[#2a2b2d] border-gray-200 border rounded-2xl shadow-2xl shadow-black/8 dark:shadow-black/40 ring-1 ring-black/[0.03] dark:ring-white/[0.03] z-50 animate-slide-up overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <h3 className="text-sm font-semibold dark:text-gray-200 text-gray-800">Settings</h3>
          </div>

          <div className="px-4 pb-3 space-y-3">
            {/* Dark Mode Toggle */}
            <div className="flex items-center justify-between py-1">
              <span className="text-sm dark:text-gray-300 text-gray-600">Dark Mode</span>
              <button
                onClick={onToggleDarkMode}
                className={`relative w-10 h-5.5 rounded-full transition-colors cursor-pointer ${darkMode ? 'bg-indigo-600' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform ${darkMode ? 'translate-x-[18px]' : 'translate-x-0'}`} />
              </button>
            </div>

            <div className="border-t dark:border-[#2a2b2d] border-gray-100" />

            {/* Provider */}
            <div>
              <label className="text-xs font-medium dark:text-gray-400 text-gray-500 mb-1.5 block">Provider</label>
              <select
                value={selectedProvider}
                onChange={(e) => onProviderChange(e.target.value)}
                className="w-full text-sm dark:bg-[#111213] bg-gray-50 dark:text-gray-200 text-gray-800 border dark:border-[#2a2b2d] border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 cursor-pointer transition-colors"
              >
                {Object.entries(providerNames).map(([key, name]) => (
                  <option key={key} value={key}>{name}</option>
                ))}
              </select>
            </div>

            {/* Model */}
            <div>
              <label className="text-xs font-medium dark:text-gray-400 text-gray-500 mb-1.5 block">Model</label>
              <select
                value={selectedModel}
                onChange={(e) => onModelChange(e.target.value)}
                className="w-full text-sm dark:bg-[#111213] bg-gray-50 dark:text-gray-200 text-gray-800 border dark:border-[#2a2b2d] border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 cursor-pointer transition-colors"
              >
                {(modelCatalog[selectedProvider] || []).map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>

            {/* API Key (hidden for Ollama) */}
            {selectedProvider !== 'ollama' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium dark:text-gray-400 text-gray-500">API Key</label>
                  {savedApiKeys[selectedProvider] && (
                    <span className="text-xs text-green-500 flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                        <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                      </svg>
                      Saved ({savedApiKeys[selectedProvider]})
                    </span>
                  )}
                </div>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={savedApiKeys[selectedProvider] ? 'Enter new key to replace...' : 'Enter API key...'}
                  className="w-full text-sm dark:bg-[#111213] bg-gray-50 dark:text-gray-200 text-gray-800 border dark:border-[#2a2b2d] border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-colors"
                />
                <button
                  onClick={handleSaveKey}
                  disabled={!apiKeyInput.trim()}
                  className="w-full mt-2 text-sm py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer font-medium"
                >
                  Save Key
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <button
        onClick={onLogout}
        className={`text-left rounded-lg dark:hover:bg-[#2a2b2d] hover:bg-gray-200 dark:text-gray-400 text-gray-600 dark:hover:text-white hover:text-gray-900 text-sm transition-all flex items-center gap-2 cursor-pointer ${collapsed ? 'justify-center p-1.5' : 'w-full px-3 py-2'}`}
        title="Sign Out"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 flex-shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
        </svg>
        <span className={`whitespace-nowrap transition-opacity duration-200 ${collapsed ? 'opacity-0 w-0 hidden' : 'opacity-100'}`}>Sign Out</span>
      </button>
    </div>
  );
}
