'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';

export default function Chat() {
  const [chatId, setChatId] = useState(() => crypto.randomUUID());
  const [sessions, setSessions] = useState<any[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);

  const [inputValue, setInputValue] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [lightningStrike, setLightningStrike] = useState(false);

  // Edit & copy message state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  // BYOK state
  const [selectedProvider, setSelectedProvider] = useState('ollama');
  const [selectedModel, setSelectedModel] = useState('llama3.2:1b');
  const [modelCatalog, setModelCatalog] = useState<Record<string, { id: string; label: string }[]>>({});
  const [providerNames, setProviderNames] = useState<Record<string, string>>({});
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savedApiKeys, setSavedApiKeys] = useState<Record<string, string | null>>({});

  const supabase = createClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsToggleRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // --- VERCEL AI SDK V5 UPDATES ---
  const { messages, setMessages, status, sendMessage } = useChat({
    id: chatId,
    // V5 completely removed 'api' and 'body'. We use a Transport to send the request, 
    // and attach the chatId to the URL so the backend can grab it.
    transport: new DefaultChatTransport({ api: `/api/chat?id=${chatId}` })
  });

  // Recreate the isLoading boolean from the new 'status' variable
  const isLoading = status === 'submitted' || status === 'streaming';
  // ---------------------------------

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .single()
          .then(({ data, error }) => {
            if (error) console.error('Profile fetch error:', error.message);
            setUserProfile(data ? { ...data, email: user.email } : { email: user.email });
          });
      } else {
        window.location.href = '/login';
      }
    });
  }, [supabase.auth]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (settingsRef.current?.contains(target)) return;
      if (settingsToggleRef.current?.contains(target)) return;
      if (menuOpenId && menuRef.current?.contains(target)) return;
      setMenuOpenId(null);
      setSettingsOpen(false);
    };
    if (menuOpenId || settingsOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpenId, settingsOpen]);

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const isDark = saved ? saved === 'dark' : true;
    setDarkMode(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', next);
  };

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

  const apiKeyField = `${selectedProvider}_api_key` as const;

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
    setApiKeyInput('');
    saveSettings({ selected_provider: provider, selected_model: firstModel });
  };

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    saveSettings({ selected_model: model });
  };

  const handleSaveApiKey = () => {
    saveSettings({ [apiKeyField]: apiKeyInput });
    setApiKeyInput('');
  };

  // Derive current model label for the header
  const currentModelLabel = modelCatalog[selectedProvider]?.find(m => m.id === selectedModel)?.label || selectedModel;
  const currentProviderLabel = providerNames[selectedProvider] || selectedProvider;

  const fetchSessions = async () => {
    try {
      const response = await fetch('/api/sessions');
      if (response.ok) {
        const data = await response.json();
        setSessions(data);
      }
    } catch (error) {
      console.error("Failed to load sessions:", error);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const loadChat = async (id: string) => {
    try {
      const response = await fetch(`/api/messages?sessionId=${id}`);
      if (response.ok) {
        const history = await response.json();
        setChatId(id); 
        setTimeout(() => {
          setMessages(history);
        }, 10);
      }
    } catch (error) {
      console.error("Failed to load chat history:", error);
    }
  };

  const startNewChat = () => {
    setChatId(crypto.randomUUID());
    setMessages([]);
  };

  const deleteChat = async (id: string) => {
    try {
      const response = await fetch(`/api/sessions?id=${id}`, { method: 'DELETE' });
      if (response.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== id));
        if (chatId === id) startNewChat();
      }
    } catch (error) {
      console.error("Failed to delete chat:", error);
    }
    setMenuOpenId(null);
  };

  const onFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    
    // V5 uses sendMessage({ text: string }) instead of append
    sendMessage({ text: inputValue });
    
    setInputValue(''); 
    setTimeout(fetchSessions, 1000); 
  };

  const startEditing = (messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;
    const text = msg.parts?.map(p => p.type === 'text' ? p.text : '').join('') || '';
    setEditingMessageId(messageId);
    setEditText(text);
  };

  const cancelEditing = () => {
    setEditingMessageId(null);
    setEditText('');
  };

  const submitEdit = () => {
    if (!editingMessageId || !editText.trim()) return;
    // Find the index of the message being edited
    const idx = messages.findIndex(m => m.id === editingMessageId);
    if (idx === -1) return;
    // Truncate to messages before the edited one
    const prior = messages.slice(0, idx);
    setMessages(prior);
    setEditingMessageId(null);
    setEditText('');
    // Send the edited text as a new message
    setTimeout(() => {
      sendMessage({ text: editText });
      setTimeout(fetchSessions, 1000);
    }, 10);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitEdit();
    }
    if (e.key === 'Escape') {
      cancelEditing();
    }
  };

  const copyMessage = (messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;
    const text = msg.parts?.map(p => p.type === 'text' ? p.text : '').join('') || '';
    navigator.clipboard.writeText(text);
    setCopiedMessageId(messageId);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex h-screen w-full dark:bg-[#0d0d0e] bg-gray-50 dark:text-gray-100 text-gray-900 font-sans overflow-hidden">
      
      {/* Sidebar */}
      <div className={`${sidebarCollapsed ? 'w-16' : 'w-64'} flex-shrink-0 dark:bg-[#151617] bg-white border-r dark:border-[#2a2b2d] border-gray-200 flex flex-col z-20 shadow-xl transition-[width] duration-300`}>
        {/* Top bar: hamburger + new chat */}
        <div className={`flex gap-2 ${sidebarCollapsed ? 'flex-col items-center px-2 pt-3 pb-1' : 'flex-row items-center p-3'}`}>
          <button
            onClick={() => { setSidebarCollapsed(!sidebarCollapsed); if (!sidebarCollapsed) setSettingsOpen(false); }}
            className="flex-shrink-0 p-2.5 rounded-xl dark:hover:bg-[#2a2b2d] hover:bg-gray-100 dark:text-gray-400 text-gray-600 transition-colors cursor-pointer"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <button
            onClick={startNewChat}
            className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all shadow-lg shadow-indigo-500/10 font-medium active:scale-[0.98] cursor-pointer flex-1 px-3 py-2.5"
            title="New Chat"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 flex-shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {!sidebarCollapsed && <span>New Chat</span>}
          </button>
        </div>

        {/* Session list */}
        <div className={`flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-1 transition-opacity duration-200 ${sidebarCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2 mt-2 whitespace-nowrap">Recent</div>
          {sessions.length === 0 ? (
            <div className="text-gray-500 text-sm px-3 italic whitespace-nowrap">No past sessions</div>
          ) : (
            sessions.map((session) => (
              <div key={session.id} className="relative group">
                <button
                  onClick={() => loadChat(session.id)}
                  className={`w-full text-left px-3 py-2.5 pr-8 rounded-lg text-sm truncate transition-colors cursor-pointer ${
                    chatId === session.id
                      ? 'dark:bg-[#2a2b2d] bg-indigo-50 text-indigo-300 font-medium'
                      : 'dark:hover:bg-[#1e1f20] hover:bg-gray-100 dark:text-gray-400 text-gray-600 dark:hover:text-gray-200 hover:text-gray-900'
                  }`}
                >
                  {session.title ? session.title : `Chat from ${formatTime(session.created_at)}`}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === session.id ? null : session.id); }}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-[#333537] text-gray-500 hover:text-gray-200 transition-all cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M10 3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM10 8.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM11.5 15.5a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0Z" />
                  </svg>
                </button>
                {menuOpenId === session.id && (
                  <div ref={menuRef} className="absolute right-0 top-full mt-1 bg-[#1e1f20] border border-[#333537] rounded-xl shadow-xl z-30 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                    <button
                      onClick={() => deleteChat(session.id)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 w-full text-left cursor-pointer transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.519.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 1 .7.798l-.35 5.25a.75.75 0 0 1-1.497-.1l.35-5.25a.75.75 0 0 1 .797-.699Zm2.84 0a.75.75 0 0 1 .798.699l.35 5.25a.75.75 0 0 1-1.498.1l-.35-5.25a.75.75 0 0 1 .7-.798Z" clipRule="evenodd" />
                      </svg>
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* User Profile Box */}
        <div className="border-t border-[#2a2b2d] dark:bg-[#1a1b1c] bg-gray-100 flex flex-col gap-3 relative p-3">
          <div ref={settingsToggleRef} className={`flex ${sidebarCollapsed ? 'flex-col items-center gap-2' : 'items-center gap-3 px-1'}`}>
            <button
              onClick={(e) => { e.stopPropagation(); setSettingsOpen(!settingsOpen); }}
              className="w-8 h-8 flex-shrink-0 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-sm font-bold text-white shadow-md uppercase cursor-pointer"
              title="Settings"
            >
              {userProfile?.username?.charAt(0) || userProfile?.first_name?.charAt(0) || userProfile?.email?.charAt(0) || '?'}
            </button>
            <div className={`flex flex-col truncate flex-1 min-w-0 transition-opacity duration-200 ${sidebarCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100'}`}>
              <span className="text-sm font-medium dark:text-gray-200 text-gray-800 truncate">
                {!userProfile ? 'Loading...' : userProfile.username ? userProfile.username : userProfile.first_name ? `${userProfile.first_name} ${userProfile.last_name}` : userProfile.email}
              </span>
              <span className="text-xs text-gray-500 truncate">
                {userProfile?.email || 'Authenticating...'}
              </span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setSettingsOpen(!settingsOpen); }}
              className="p-1.5 rounded-lg dark:hover:bg-[#2a2b2d] hover:bg-gray-200 text-gray-500 dark:hover:text-gray-200 hover:text-gray-700 transition-all cursor-pointer flex-shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </button>
          </div>

          {/* Settings Dropdown */}
          {settingsOpen && (
            <div ref={settingsRef} className="absolute bottom-full left-0 mb-2 w-72 dark:bg-[#1a1b1c] bg-white dark:border-[#2a2b2d] border-gray-200 border rounded-2xl shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-1 duration-150 overflow-hidden">
              {/* Header */}
              <div className="px-4 pt-4 pb-2">
                <h3 className="text-sm font-semibold dark:text-gray-200 text-gray-800">Settings</h3>
              </div>

              <div className="px-4 pb-3 space-y-3">
                {/* Dark Mode Toggle */}
                <div className="flex items-center justify-between py-1">
                  <span className="text-sm dark:text-gray-300 text-gray-600">Dark Mode</span>
                  <button
                    onClick={toggleDarkMode}
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
                    onChange={(e) => handleProviderChange(e.target.value)}
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
                    onChange={(e) => handleModelChange(e.target.value)}
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
                      onClick={handleSaveApiKey}
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
            onClick={handleLogout}
            className={`text-left rounded-lg dark:hover:bg-[#2a2b2d] hover:bg-gray-200 dark:text-gray-400 text-gray-600 dark:hover:text-white hover:text-gray-900 text-sm transition-all flex items-center gap-2 cursor-pointer ${sidebarCollapsed ? 'justify-center p-1.5' : 'w-full px-3 py-2'}`}
            title="Sign Out"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 flex-shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
            </svg>
            <span className={`whitespace-nowrap transition-opacity duration-200 ${sidebarCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100'}`}>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Main Chat */}
      <div className="flex-1 flex flex-col relative dark:bg-[#0d0d0e] bg-gray-50">
        {/* Ambient glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-indigo-500/[0.03] blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/3 right-0 w-[400px] h-[400px] bg-purple-500/[0.02] blur-[120px] pointer-events-none" />

        {/* Header */}
        <header className="flex-shrink-0 px-6 py-4 relative z-10 border-b dark:border-white/[0.06] border-gray-200/80 dark:bg-[#0d0d0e]/80 bg-gray-50/80 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-md shadow-emerald-400/50 ring-2 ring-emerald-400/20" />
              <span className="text-base font-semibold dark:text-gray-100 text-gray-800">{currentProviderLabel}</span>
              <span className="text-xs bg-gradient-to-r from-indigo-500/15 to-purple-500/15 dark:text-indigo-300 text-indigo-600 px-3 py-1 rounded-full font-semibold border dark:border-indigo-400/20 border-indigo-300/30 shadow-sm">{currentModelLabel}</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto w-full scroll-smooth px-4">
          <div className="max-w-3xl mx-auto py-8 pb-44 space-y-6">

            {messages.length === 0 && (
               <div className="flex flex-col items-center justify-center text-center mt-28 animate-in fade-in slide-in-from-bottom-4 duration-700">
                 <button
                   onClick={() => { setLightningStrike(true); setTimeout(() => setLightningStrike(false), 1200); }}
                   className="w-16 h-16 dark:bg-[#1a1b1c] bg-white rounded-2xl border dark:border-[#2a2b2d] border-gray-200 shadow-2xl shadow-indigo-500/5 flex items-center justify-center mb-8 cursor-pointer relative overflow-hidden active:scale-95 transition-transform hover:shadow-indigo-500/15 hover:border-indigo-500/30"
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-8 h-8 text-indigo-400 relative z-10 ${lightningStrike ? 'animate-lightning' : ''}`}>
                      <path fillRule="evenodd" d="M14.615 1.595a.75.75 0 0 1 .359.852L12.982 9.75h7.268a.75.75 0 0 1 .548 1.262l-10.5 11.25a.75.75 0 0 1-1.272-.71l1.992-7.302H3.75a.75.75 0 0 1-.548-1.262l10.5-11.25a.75.75 0 0 1 .913-.143Z" clipRule="evenodd" />
                    </svg>
                    {lightningStrike && (
                      <div className="absolute inset-0 bg-indigo-400/30 animate-flash rounded-2xl" />
                    )}
                 </button>
                 <h2 className="text-3xl font-semibold dark:text-gray-100 text-gray-800 tracking-tight">
                   Hi {userProfile?.first_name || 'there'}, how can I help?
                 </h2>
                 <p className="dark:text-gray-500 text-gray-400 mt-3 text-sm max-w-sm leading-relaxed">Start a conversation or try one of these suggestions.</p>

                 {/* Suggestion chips */}
                 <div className="flex flex-wrap justify-center gap-2 mt-8 max-w-lg">
                   {[
                     'Explain quantum computing',
                     'Write a Python script',
                     'Debug my code',
                     'Summarize a topic',
                   ].map((suggestion) => (
                     <button
                       key={suggestion}
                       onClick={() => { setInputValue(suggestion); }}
                       className="px-4 py-2 text-sm dark:bg-white/[0.04] bg-white dark:text-gray-400 text-gray-500 rounded-xl border dark:border-white/[0.08] border-gray-200 dark:hover:bg-white/[0.08] hover:bg-gray-100 dark:hover:text-gray-200 hover:text-gray-700 dark:hover:border-white/[0.12] hover:border-gray-300 transition-all cursor-pointer"
                     >
                       {suggestion}
                     </button>
                   ))}
                 </div>
               </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300 group/msg`}>
                {/* Inline edit mode */}
                {m.role === 'user' && editingMessageId === m.id ? (
                  <div className="max-w-[85%] sm:max-w-[75%] w-full">
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
                  <div className={`
                    px-5 py-3 max-w-[85%] sm:max-w-[75%] text-[15px] leading-relaxed
                    ${m.role === 'user'
                      ? "bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-2xl rounded-br-sm shadow-lg shadow-indigo-500/20"
                      : "dark:bg-[#161718] bg-white dark:text-gray-300 text-gray-700 border dark:border-white/[0.06] border-gray-200/80 rounded-2xl rounded-bl-sm shadow-sm"}
                  `}>
                    <div className="whitespace-pre-wrap">
                      {m.parts?.map((part, index) =>
                        part.type === 'text' ? <span key={index}>{part.text}</span> : null
                      )}
                    </div>
                  </div>
                )}

                {/* Action buttons — below bubble */}
                {editingMessageId !== m.id && (
                  <div className={`flex gap-0.5 mt-1 opacity-0 group-hover/msg:opacity-100 transition-all duration-200 ${m.role === 'user' ? 'mr-1' : 'ml-1'}`}>
                    <button
                      onClick={() => copyMessage(m.id)}
                      className="p-1.5 rounded-lg dark:hover:bg-white/[0.06] hover:bg-gray-100 dark:text-gray-500 text-gray-400 dark:hover:text-gray-300 hover:text-gray-600 transition-all cursor-pointer"
                      title="Copy"
                    >
                      {copiedMessageId === m.id ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 text-emerald-400">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                        </svg>
                      )}
                    </button>
                    {m.role === 'user' && !isLoading && (
                      <button
                        onClick={() => startEditing(m.id)}
                        className="p-1.5 rounded-lg dark:hover:bg-white/[0.06] hover:bg-gray-100 dark:text-gray-500 text-gray-400 dark:hover:text-gray-300 hover:text-gray-600 transition-all cursor-pointer"
                        title="Edit & resend"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}

            {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="flex justify-start animate-in fade-in duration-300">
                <div className="dark:bg-[#161718] bg-white border dark:border-white/[0.06] border-gray-200/80 px-5 py-4 rounded-2xl rounded-bl-sm shadow-sm flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />

          </div>
        </div>

        {/* Input area */}
        <div className="absolute bottom-0 left-0 w-full pb-6 pt-16 px-4 pointer-events-none" style={{ background: darkMode ? 'linear-gradient(to top, #0d0d0e 40%, transparent)' : 'linear-gradient(to top, #f9fafb 40%, transparent)' }}>
          <div className="max-w-3xl mx-auto w-full pointer-events-auto">
            <form onSubmit={onFormSubmit} className="relative flex items-center dark:bg-[#161718] bg-white rounded-2xl border dark:border-white/[0.08] border-gray-200 shadow-xl dark:shadow-black/30 shadow-gray-200/50 focus-within:border-indigo-500/40 focus-within:ring-2 focus-within:ring-indigo-500/10 transition-all duration-300">
              <input
                className="w-full py-4 pl-5 pr-14 outline-none dark:text-gray-100 text-gray-800 bg-transparent dark:placeholder-gray-500 placeholder-gray-400 text-[15px]"
                value={inputValue}
                placeholder={`Message ${currentProviderLabel}...`}
                onChange={(e) => setInputValue(e.target.value)}
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || isLoading}
                className={`absolute right-2.5 p-2 rounded-xl transition-all duration-200 active:scale-90 cursor-pointer ${inputValue.trim() ? 'text-indigo-500 hover:text-indigo-400 hover:bg-indigo-500/10' : 'text-gray-500'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                </svg>
              </button>
            </form>
            <div className="text-center mt-3 text-[11px] dark:text-gray-600 text-gray-400">
              AI can make mistakes. Verify important information.
            </div>
          </div>
        </div>

        {/* Full-page lightning bolt strike */}
        {lightningStrike && (
          <div className="absolute inset-0 z-50 pointer-events-none">
            {/* Screen flash */}
            <div className="absolute inset-0 animate-screen-flash" />
            {/* Lightning bolt SVG */}
            <svg className="absolute left-1/2 -translate-x-1/2 top-0 h-full w-40 animate-bolt-strike" viewBox="0 0 160 800" fill="none" preserveAspectRatio="none">
              <path
                d="M80 0 L85 180 L120 185 L75 400 L105 405 L70 600 L100 605 L80 800"
                stroke="url(#bolt-gradient)"
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
                className="animate-bolt-draw"
              />
              <path
                d="M80 0 L85 180 L120 185 L75 400 L105 405 L70 600 L100 605 L80 800"
                stroke="rgba(129, 140, 248, 0.3)"
                strokeWidth="12"
                strokeLinecap="round"
                fill="none"
                className="animate-bolt-glow"
              />
              <defs>
                <linearGradient id="bolt-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(199, 210, 254, 0.9)" />
                  <stop offset="50%" stopColor="rgba(129, 140, 248, 1)" />
                  <stop offset="100%" stopColor="rgba(79, 70, 229, 0.8)" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}