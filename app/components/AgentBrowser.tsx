'use client';

import { useState, useEffect, useRef } from 'react';

interface Agent {
  id: string;
  store_agent_id?: string;
  name: string;
  description?: string;
  system_prompt: string;
  job_category?: string;
  logo_url?: string;
  downloads?: number;
  tools?: any[];
  skills?: any[];
  parent_agent_id?: string;
  store_created_by?: string;
  isInstalled?: boolean;
}

interface AgentBrowserProps {
  installedAgents: Agent[];
  onInstall: (agent: Agent) => void;
  onUninstall: (agentId: string) => void;
  onSelect: (agent: Agent | null) => void;
  onClose: () => void;
}

const CATEGORIES = ['All', 'Engineering', 'Marketing', 'Sales', 'Support', 'Data', 'Writing', 'Research'];

export default function AgentBrowser({ installedAgents, onInstall, onUninstall, onSelect, onClose }: AgentBrowserProps) {
  const [tab, setTab] = useState<'store' | 'installed'>('store');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [storeAgents, setStoreAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [installingIds, setInstallingIds] = useState<Set<string>>(new Set());
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchStoreAgents = async (searchQuery: string, cat: string) => {
    setLoading(true);
    setStoreError(null);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (cat && cat !== 'All') params.set('category', cat);
      const res = await fetch(`/api/agent-store/browse?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json();
        setStoreError(err.error || 'Failed to load store');
        setStoreAgents([]);
        return;
      }
      const data = await res.json();
      setStoreAgents(data);
    } catch {
      setStoreError('Failed to connect to agent store');
      setStoreAgents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'store') {
      fetchStoreAgents(search, category);
    }
  }, [tab, category]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      fetchStoreAgents(value, category);
    }, 300);
  };

  const handleInstall = async (agent: Agent) => {
    setInstallingIds(prev => new Set(prev).add(agent.id));
    await onInstall(agent);
    setInstallingIds(prev => {
      const next = new Set(prev);
      next.delete(agent.id);
      return next;
    });
    // Refresh store to update isInstalled flags
    if (tab === 'store') {
      fetchStoreAgents(search, category);
    }
  };

  // Check if a store agent is installed (using local installed list as source of truth)
  const isInstalled = (storeAgentId: string) => {
    return installedAgents.some(a => a.store_agent_id === storeAgentId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl max-h-[80vh] dark:bg-[#1a1b1c] bg-white rounded-2xl shadow-2xl border dark:border-[#2a2b2d] border-gray-200 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b dark:border-[#2a2b2d] border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 dark:text-indigo-400 text-indigo-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
            <h3 className="text-sm font-semibold dark:text-gray-200 text-gray-800">AI Agents</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg dark:hover:bg-[#2a2b2d] hover:bg-gray-100 dark:text-gray-400 text-gray-500 transition-colors cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b dark:border-[#2a2b2d] border-gray-200 px-5 flex-shrink-0">
          <button
            onClick={() => setTab('store')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              tab === 'store'
                ? 'border-indigo-500 dark:text-indigo-400 text-indigo-600'
                : 'border-transparent dark:text-gray-500 text-gray-400 dark:hover:text-gray-300 hover:text-gray-600'
            }`}
          >
            Store
          </button>
          <button
            onClick={() => setTab('installed')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              tab === 'installed'
                ? 'border-indigo-500 dark:text-indigo-400 text-indigo-600'
                : 'border-transparent dark:text-gray-500 text-gray-400 dark:hover:text-gray-300 hover:text-gray-600'
            }`}
          >
            Installed ({installedAgents.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {tab === 'store' && (
            <div className="p-5">
              {/* Search */}
              <div className="relative mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 dark:text-gray-500 text-gray-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search agents..."
                  value={search}
                  onChange={e => handleSearchChange(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm dark:bg-[#111213] bg-gray-50 dark:text-gray-200 text-gray-800 border dark:border-[#2a2b2d] border-gray-200 rounded-xl outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-colors"
                />
              </div>

              {/* Category chips */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`px-2.5 py-1 text-xs rounded-lg border transition-all cursor-pointer ${
                      category === cat
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'dark:bg-white/[0.04] bg-gray-100 dark:text-gray-400 text-gray-500 dark:hover:bg-white/[0.08] hover:bg-gray-200 dark:border-white/[0.06] border-gray-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Loading */}
              {loading && (
                <div className="text-center py-12">
                  <div className="inline-block w-6 h-6 border-2 dark:border-gray-600 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
                  <p className="text-sm dark:text-gray-500 text-gray-400 mt-3">Loading agents...</p>
                </div>
              )}

              {/* Error */}
              {storeError && !loading && (
                <div className="text-center py-12">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 dark:text-gray-600 text-gray-300 mx-auto mb-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                  </svg>
                  <p className="text-sm dark:text-gray-400 text-gray-500">{storeError}</p>
                  <button
                    onClick={() => fetchStoreAgents(search, category)}
                    className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                  >
                    Try again
                  </button>
                </div>
              )}

              {/* Agent grid */}
              {!loading && !storeError && (
                <>
                  {storeAgents.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-sm dark:text-gray-500 text-gray-400">No agents found</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {storeAgents.map(agent => {
                        const installed = isInstalled(agent.id);
                        const installing = installingIds.has(agent.id);
                        return (
                          <div
                            key={agent.id}
                            className="p-3.5 rounded-xl border dark:border-[#2a2b2d] border-gray-200 dark:bg-[#111213] bg-gray-50 dark:hover:border-[#3a3b3d] hover:border-gray-300 transition-colors"
                          >
                            <div className="flex items-start gap-3 mb-2">
                              {agent.logo_url ? (
                                <img src={agent.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center flex-shrink-0">
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 dark:text-indigo-400 text-indigo-500">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                                  </svg>
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-medium dark:text-gray-200 text-gray-800 truncate">{agent.name}</h4>
                                {agent.job_category && (
                                  <span className="text-[10px] dark:text-gray-500 text-gray-400">{agent.job_category}</span>
                                )}
                              </div>
                            </div>
                            {agent.description && (
                              <p className="text-xs dark:text-gray-500 text-gray-500 line-clamp-2 mb-3">{agent.description}</p>
                            )}
                            <div className="flex items-center justify-between">
                              {agent.downloads != null && agent.downloads > 0 && (
                                <span className="text-[10px] dark:text-gray-600 text-gray-400">
                                  {agent.downloads.toLocaleString()} installs
                                </span>
                              )}
                              <div className="ml-auto">
                                {installed ? (
                                  <span className="text-xs dark:text-emerald-400 text-emerald-600 font-medium flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                                    </svg>
                                    Installed
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => handleInstall(agent)}
                                    disabled={installing}
                                    className="px-2.5 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors cursor-pointer font-medium disabled:opacity-50"
                                  >
                                    {installing ? 'Installing...' : 'Install'}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {tab === 'installed' && (
            <div className="p-5">
              {installedAgents.length === 0 ? (
                <div className="text-center py-12">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 dark:text-gray-700 text-gray-300 mx-auto mb-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                  </svg>
                  <p className="text-sm dark:text-gray-500 text-gray-400 mb-1">No agents installed</p>
                  <p className="text-xs dark:text-gray-600 text-gray-400">Browse the store to find and install agents</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {installedAgents.map(agent => (
                    <div
                      key={agent.id}
                      className="flex items-center gap-3 p-3 rounded-xl border dark:border-[#2a2b2d] border-gray-200 dark:bg-[#111213] bg-gray-50 dark:hover:border-[#3a3b3d] hover:border-gray-300 transition-colors"
                    >
                      {agent.logo_url ? (
                        <img src={agent.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center flex-shrink-0">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 dark:text-indigo-400 text-indigo-500">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                          </svg>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium dark:text-gray-200 text-gray-800 truncate">{agent.name}</h4>
                        {agent.description && (
                          <p className="text-xs dark:text-gray-500 text-gray-400 truncate">{agent.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => { onSelect(agent); onClose(); }}
                          className="px-2.5 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors cursor-pointer font-medium"
                        >
                          Use
                        </button>
                        <button
                          onClick={() => onUninstall(agent.id)}
                          className="px-2.5 py-1 text-xs dark:text-red-400 text-red-500 dark:hover:bg-red-500/10 hover:bg-red-50 rounded-lg transition-colors cursor-pointer border dark:border-red-500/20 border-red-200"
                        >
                          Uninstall
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
