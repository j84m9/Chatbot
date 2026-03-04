'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import MarkdownRenderer from '@/app/components/MarkdownRenderer';
import { useKeyboardShortcuts } from '@/app/hooks/useKeyboardShortcuts';
import SearchModal from '@/app/components/SearchModal';
import SystemPromptEditor from '@/app/components/SystemPromptEditor';
import VoiceInputButton from '@/app/components/VoiceInputButton';
import ExportMenu from '@/app/components/ExportMenu';
import FileUploadButton from '@/app/components/FileUploadButton';
import FilePreview from '@/app/components/FilePreview';
import { estimateCost } from '@/utils/token-costs';
import AgentBrowser from '@/app/components/AgentBrowser';

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
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  // Edit & copy message state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  // Rename state
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Search modal state
  const [searchOpen, setSearchOpen] = useState(false);

  // System prompt state
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const [systemPromptEditorOpen, setSystemPromptEditorOpen] = useState(false);

  // Agent state
  const [installedAgents, setInstalledAgents] = useState<any[]>([]);
  const [activeAgent, setActiveAgent] = useState<any>(null);
  const [agentBrowserOpen, setAgentBrowserOpen] = useState(false);
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);

  // File upload state
  const [pendingFiles, setPendingFiles] = useState<Array<{ url: string; mediaType: string; filename: string }>>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);

  // Token usage state (keyed by message ID)
  const [tokenUsage, setTokenUsage] = useState<Record<string, any>>({});

  // Settings panel state
  const [settingsTab, setSettingsTab] = useState<'general' | 'model'>('general');
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('base');
  const [sendWithEnter, setSendWithEnter] = useState(true);
  const [showTokenUsage, setShowTokenUsage] = useState(true);

  // BYOK state
  const [selectedProvider, setSelectedProvider] = useState('ollama');
  const [selectedModel, setSelectedModel] = useState('llama3.2:1b');
  const [modelCatalog, setModelCatalog] = useState<Record<string, { id: string; label: string; vision?: boolean }[]>>({});
  const [providerNames, setProviderNames] = useState<Record<string, string>>({});
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savedApiKeys, setSavedApiKeys] = useState<Record<string, string | null>>({});
  const [deleteKeyConfirm, setDeleteKeyConfirm] = useState(false);
  const [deleteKeyInput, setDeleteKeyInput] = useState('');

  const supabase = createClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsToggleRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const agentDropdownRef = useRef<HTMLDivElement>(null);

  // --- VERCEL AI SDK V5 UPDATES ---
  const { messages, setMessages, status, sendMessage } = useChat({
    id: chatId,
    // V5 completely removed 'api' and 'body'. We use a Transport to send the request, 
    // and attach the chatId to the URL so the backend can grab it.
    transport: new DefaultChatTransport({ api: `/api/chat?id=${chatId}${activeAgent ? `&agentId=${activeAgent.id}` : ''}` })
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
    if (!modelDropdownOpen) return;
    const handleModelDropdownClickOutside = (e: MouseEvent) => {
      if (modelDropdownRef.current?.contains(e.target as Node)) return;
      setModelDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleModelDropdownClickOutside);
    return () => document.removeEventListener('mousedown', handleModelDropdownClickOutside);
  }, [modelDropdownOpen]);

  useEffect(() => {
    if (!agentDropdownOpen) return;
    const handleAgentDropdownClickOutside = (e: MouseEvent) => {
      if (agentDropdownRef.current?.contains(e.target as Node)) return;
      setAgentDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleAgentDropdownClickOutside);
    return () => document.removeEventListener('mousedown', handleAgentDropdownClickOutside);
  }, [agentDropdownOpen]);

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const isDark = saved ? saved === 'dark' : true;
    setDarkMode(isDark);
    document.documentElement.classList.toggle('dark', isDark);

    const savedFontSize = localStorage.getItem('chatFontSize') as 'sm' | 'base' | 'lg' | null;
    if (savedFontSize) setFontSize(savedFontSize);
    const savedSendWithEnter = localStorage.getItem('sendWithEnter');
    if (savedSendWithEnter !== null) setSendWithEnter(savedSendWithEnter !== 'false');
    const savedShowTokenUsage = localStorage.getItem('showTokenUsage');
    if (savedShowTokenUsage !== null) setShowTokenUsage(savedShowTokenUsage !== 'false');
  }, []);

  // Keyboard shortcuts
  const shortcuts = useMemo(() => ({
    'meta+k': () => setSearchOpen(true),
    'meta+n': () => startNewChat(),
    'meta+/': () => { setSidebarCollapsed(prev => !prev); },
    'escape': () => {
      if (agentBrowserOpen) setAgentBrowserOpen(false);
      else if (agentDropdownOpen) setAgentDropdownOpen(false);
      else if (searchOpen) setSearchOpen(false);
      else if (systemPromptEditorOpen) setSystemPromptEditorOpen(false);
      else if (editingMessageId) cancelEditing();
      else if (renamingSessionId) { setRenamingSessionId(null); setRenameValue(''); }
    },
  }), [agentBrowserOpen, agentDropdownOpen, searchOpen, systemPromptEditorOpen, editingMessageId, renamingSessionId]);
  useKeyboardShortcuts(shortcuts);

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', next);
  };

  const changeFontSize = (size: 'sm' | 'base' | 'lg') => {
    setFontSize(size);
    localStorage.setItem('chatFontSize', size);
  };

  const toggleSendWithEnter = () => {
    const next = !sendWithEnter;
    setSendWithEnter(next);
    localStorage.setItem('sendWithEnter', String(next));
  };

  const toggleShowTokenUsage = () => {
    const next = !showTokenUsage;
    setShowTokenUsage(next);
    localStorage.setItem('showTokenUsage', String(next));
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
    setDeleteKeyConfirm(false);
    setDeleteKeyInput('');
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

  const handleDeleteApiKey = () => {
    saveSettings({ [apiKeyField]: '' });
    setDeleteKeyConfirm(false);
    setDeleteKeyInput('');
  };

  // Quick model switch from input dropdown
  const handleQuickModelSwitch = (provider: string, modelId: string) => {
    setSelectedProvider(provider);
    setSelectedModel(modelId);
    saveSettings({ selected_provider: provider, selected_model: modelId });
    setModelDropdownOpen(false);
  };

  // Derive current model label for the header
  const currentModel = modelCatalog[selectedProvider]?.find(m => m.id === selectedModel);
  const currentModelLabel = currentModel?.label || selectedModel;
  const currentProviderLabel = providerNames[selectedProvider] || selectedProvider;
  const currentModelVision = currentModel?.vision ?? false;

  const uploadFile = async (file: File) => {
    setUploadingCount(c => c + 1);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json();
        console.error('Upload failed:', err.error);
        return;
      }
      const data = await res.json();
      setPendingFiles(prev => [...prev, data]);
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setUploadingCount(c => c - 1);
    }
  };

  const handleFilesSelected = (files: FileList) => {
    Array.from(files).forEach(uploadFile);
  };

  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

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
    fetchInstalledAgents();
  }, []);

  // Agent handlers
  const fetchInstalledAgents = async () => {
    try {
      const res = await fetch('/api/agents');
      if (res.ok) {
        const data = await res.json();
        setInstalledAgents(data);
      }
    } catch (err) {
      console.error('Failed to fetch installed agents:', err);
    }
  };

  const selectAgent = async (agent: any | null) => {
    setActiveAgent(agent);
    // If we have an existing session, update it
    if (chatId && sessions.some(s => s.id === chatId)) {
      await fetch('/api/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: chatId,
          agent_id: agent?.id || null,
          // Clear custom system prompt when selecting an agent
          ...(agent ? { system_prompt: null } : {}),
        }),
      });
      if (agent) setSystemPrompt(null);
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

  const handleDetachAgent = async () => {
    if (!activeAgent) return;
    // Copy the agent's prompt to custom system prompt
    const prompt = activeAgent.system_prompt;
    setSystemPrompt(prompt);
    setActiveAgent(null);
    setSystemPromptEditorOpen(false);
    // Update session: set custom prompt, clear agent_id
    if (chatId && sessions.some(s => s.id === chatId)) {
      await fetch('/api/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: chatId, system_prompt: prompt, agent_id: null }),
      });
    }
  };

  const loadChat = async (id: string) => {
    try {
      const response = await fetch(`/api/messages?sessionId=${id}`);
      if (response.ok) {
        const history = await response.json();
        setChatId(id);
        // Load system prompt and agent from session data
        const session = sessions.find(s => s.id === id);
        setSystemPrompt(session?.system_prompt || null);
        // Load active agent if session has one
        if (session?.agent_id) {
          const agent = installedAgents.find(a => a.id === session.agent_id);
          setActiveAgent(agent || null);
        } else {
          setActiveAgent(null);
        }
        // Extract token usage from messages
        const usage: Record<string, any> = {};
        for (const msg of history) {
          if (msg.token_usage) usage[msg.id] = msg.token_usage;
        }
        setTokenUsage(usage);
        setPendingFiles([]);
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
    setSystemPrompt(null);
    setActiveAgent(null);
    setPendingFiles([]);
    setTokenUsage({});
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

  const startRenaming = (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    setRenamingSessionId(sessionId);
    setRenameValue(session?.title || '');
    setMenuOpenId(null);
  };

  const submitRename = async () => {
    if (!renamingSessionId || !renameValue.trim()) return;
    try {
      const res = await fetch('/api/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: renamingSessionId, title: renameValue.trim() }),
      });
      if (res.ok) {
        setSessions(prev => prev.map(s =>
          s.id === renamingSessionId ? { ...s, title: renameValue.trim() } : s
        ));
      }
    } catch (err) {
      console.error('Failed to rename session:', err);
    }
    setRenamingSessionId(null);
    setRenameValue('');
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitRename();
    }
    if (e.key === 'Escape') {
      setRenamingSessionId(null);
      setRenameValue('');
    }
  };

  // System prompt handlers
  const handleSaveSystemPrompt = async (prompt: string | null) => {
    setSystemPrompt(prompt);
    setSystemPromptEditorOpen(false);
    // Save to session if we have one
    if (chatId && sessions.some(s => s.id === chatId)) {
      await fetch('/api/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: chatId, system_prompt: prompt }),
      });
    }
  };

  const onFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!inputValue.trim() && pendingFiles.length === 0) return;

    // V5 uses sendMessage({ text: string, files?: ... }) instead of append
    const messagePayload: any = { text: inputValue || ' ' };
    if (pendingFiles.length > 0) {
      messagePayload.files = pendingFiles.map(f => ({
        mediaType: f.mediaType,
        url: f.url,
      }));
    }
    sendMessage(messagePayload);

    setInputValue('');
    setPendingFiles([]);
    setTimeout(fetchSessions, 1000);
  };

  const forkChat = async (messageId: string) => {
    try {
      const res = await fetch('/api/fork', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: chatId, messageId }),
      });
      if (res.ok) {
        const { id } = await res.json();
        await fetchSessions();
        loadChat(id);
      }
    } catch (err) {
      console.error('Fork failed:', err);
    }
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

        {/* Data Explorer link */}
        <div className={`px-3 pb-1 ${sidebarCollapsed ? 'flex justify-center' : ''}`}>
          <a
            href="/data-explorer"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm dark:text-gray-400 text-gray-500 dark:hover:bg-[#1e1f20] hover:bg-gray-100 dark:hover:text-gray-200 hover:text-gray-800 transition-colors ${sidebarCollapsed ? 'justify-center px-2' : ''}`}
            title="Data Explorer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 flex-shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75" />
            </svg>
            <span className={`whitespace-nowrap transition-opacity duration-200 ${sidebarCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100'}`}>Data Explorer</span>
          </a>
        </div>

        {/* Session list */}
        <div className={`flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-1 transition-opacity duration-200 ${sidebarCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          <div className="flex items-center justify-between mb-3 px-2 mt-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Recent</span>
            <button
              onClick={() => setSearchOpen(true)}
              className="p-1 rounded-md dark:hover:bg-[#2a2b2d] hover:bg-gray-200 dark:text-gray-500 text-gray-400 dark:hover:text-gray-300 hover:text-gray-600 transition-colors cursor-pointer"
              title="Search chats (Cmd+K)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
            </button>
          </div>
          {sessions.length === 0 ? (
            <div className="text-gray-500 text-sm px-3 italic whitespace-nowrap">No past sessions</div>
          ) : (
            sessions.map((session) => (
              <div key={session.id} className="relative group">
                {renamingSessionId === session.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={handleRenameKeyDown}
                    onBlur={submitRename}
                    className="w-full px-3 py-2 rounded-lg text-sm dark:bg-[#1e1f20] bg-gray-100 dark:text-gray-200 text-gray-800 border border-indigo-500 outline-none"
                  />
                ) : (
                  <button
                    onClick={() => loadChat(session.id)}
                    onDoubleClick={() => startRenaming(session.id)}
                    className={`w-full text-left px-3 py-2.5 pr-8 rounded-lg text-sm truncate transition-colors cursor-pointer ${
                      chatId === session.id
                        ? 'dark:bg-indigo-500/[0.08] bg-indigo-50 dark:text-indigo-300 text-indigo-600 font-medium border-l-2 border-indigo-500 dark:border-indigo-400'
                        : 'dark:hover:bg-white/[0.04] hover:bg-gray-100 dark:text-gray-400 text-gray-600 dark:hover:text-gray-200 hover:text-gray-900'
                    }`}
                  >
                    {session.title ? session.title : `Chat from ${formatTime(session.created_at)}`}
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === session.id ? null : session.id); }}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-md opacity-0 group-hover:opacity-100 dark:hover:bg-white/[0.08] hover:bg-gray-200 text-gray-500 hover:text-gray-200 transition-all cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M10 3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM10 8.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM11.5 15.5a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0Z" />
                  </svg>
                </button>
                {menuOpenId === session.id && (
                  <div ref={menuRef} className="absolute right-0 top-full mt-1 dark:bg-[#1e1f20] bg-white border dark:border-[#333537] border-gray-200 rounded-xl shadow-2xl shadow-black/8 dark:shadow-black/40 ring-1 ring-black/[0.03] dark:ring-white/[0.03] z-30 overflow-hidden animate-slide-up">
                    <button
                      onClick={() => startRenaming(session.id)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm dark:text-gray-300 text-gray-700 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 w-full text-left cursor-pointer transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                      </svg>
                      Rename
                    </button>
                    <button
                      onClick={() => deleteChat(session.id)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 dark:hover:bg-red-500/10 hover:bg-red-50 w-full text-left cursor-pointer transition-colors"
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
        <div className="border-t dark:border-[#2a2b2d] border-gray-200 dark:bg-[#1a1b1c] bg-gray-100 flex flex-col gap-3 relative p-3">
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
            <div ref={settingsRef} className="absolute bottom-full left-0 mb-2 w-80 dark:bg-[#1a1b1c] bg-white dark:border-[#2a2b2d] border-gray-200 border rounded-2xl shadow-2xl shadow-black/8 dark:shadow-black/40 ring-1 ring-black/[0.03] dark:ring-white/[0.03] z-50 animate-slide-up overflow-hidden max-h-[70vh] overflow-y-auto">
              {/* Header */}
              <div className="px-4 pt-4 pb-3 border-b dark:border-[#2a2b2d] border-gray-100 bg-gradient-to-r from-indigo-500/5 to-purple-500/5">
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4.5 h-4.5 dark:text-indigo-400 text-indigo-500">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  </svg>
                  <h3 className="text-sm font-semibold dark:text-gray-200 text-gray-800">Settings</h3>
                </div>
              </div>

              {/* Tab bar */}
              <div className="flex gap-1 px-4 pt-3 pb-2">
                <button
                  onClick={() => setSettingsTab('general')}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-all cursor-pointer ${settingsTab === 'general' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20' : 'dark:text-gray-400 text-gray-500 dark:hover:bg-[#2a2b2d] hover:bg-gray-100'}`}
                >
                  General
                </button>
                <button
                  onClick={() => setSettingsTab('model')}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-all cursor-pointer ${settingsTab === 'model' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20' : 'dark:text-gray-400 text-gray-500 dark:hover:bg-[#2a2b2d] hover:bg-gray-100'}`}
                >
                  AI Model
                </button>
              </div>

              <div className="px-4 pb-4 pt-1">
                {settingsTab === 'general' ? (
                  <div className="space-y-1">
                    {/* Dark Mode */}
                    <div className="flex items-center justify-between py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg dark:bg-[#2a2b2d] bg-gray-100 flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 dark:text-gray-400 text-gray-500">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
                          </svg>
                        </div>
                        <span className="text-sm dark:text-gray-300 text-gray-600">Dark Mode</span>
                      </div>
                      <button
                        onClick={toggleDarkMode}
                        className={`relative w-10 h-5.5 rounded-full transition-colors cursor-pointer ${darkMode ? 'bg-indigo-600' : 'bg-gray-300'}`}
                      >
                        <div className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform ${darkMode ? 'translate-x-[18px]' : 'translate-x-0'}`} />
                      </button>
                    </div>

                    <div className="border-t dark:border-[#2a2b2d]/60 border-gray-100" />

                    {/* Font Size */}
                    <div className="flex items-center justify-between py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg dark:bg-[#2a2b2d] bg-gray-100 flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 dark:text-gray-400 text-gray-500">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.243 4.493v7.5m0 0v7.514m0-7.514h7.5m-7.5 0H12m8.25-7.5v15" />
                          </svg>
                        </div>
                        <span className="text-sm dark:text-gray-300 text-gray-600">Font Size</span>
                      </div>
                      <div className="flex items-center gap-0.5 dark:bg-[#111213] bg-gray-50 rounded-lg p-0.5 border dark:border-[#2a2b2d] border-gray-200">
                        {([['sm', 'S'], ['base', 'M'], ['lg', 'L']] as const).map(([size, label]) => (
                          <button
                            key={size}
                            onClick={() => changeFontSize(size)}
                            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${fontSize === size ? 'bg-indigo-600 text-white shadow-sm' : 'dark:text-gray-400 text-gray-500 dark:hover:text-gray-200 hover:text-gray-700'}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="border-t dark:border-[#2a2b2d]/60 border-gray-100" />

                    {/* Send with Enter */}
                    <div className="flex items-center justify-between py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg dark:bg-[#2a2b2d] bg-gray-100 flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 dark:text-gray-400 text-gray-500">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                          </svg>
                        </div>
                        <div>
                          <span className="text-sm dark:text-gray-300 text-gray-600">Send with Enter</span>
                          <p className="text-[11px] dark:text-gray-600 text-gray-400 mt-0.5">{sendWithEnter ? 'Shift+Enter for new line' : 'Enter for new line'}</p>
                        </div>
                      </div>
                      <button
                        onClick={toggleSendWithEnter}
                        className={`relative w-10 h-5.5 rounded-full transition-colors cursor-pointer ${sendWithEnter ? 'bg-indigo-600' : 'bg-gray-300'}`}
                      >
                        <div className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform ${sendWithEnter ? 'translate-x-[18px]' : 'translate-x-0'}`} />
                      </button>
                    </div>

                    <div className="border-t dark:border-[#2a2b2d]/60 border-gray-100" />

                    {/* Show Token Usage */}
                    <div className="flex items-center justify-between py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg dark:bg-[#2a2b2d] bg-gray-100 flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 dark:text-gray-400 text-gray-500">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                          </svg>
                        </div>
                        <span className="text-sm dark:text-gray-300 text-gray-600">Show Token Usage</span>
                      </div>
                      <button
                        onClick={toggleShowTokenUsage}
                        className={`relative w-10 h-5.5 rounded-full transition-colors cursor-pointer ${showTokenUsage ? 'bg-indigo-600' : 'bg-gray-300'}`}
                      >
                        <div className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform ${showTokenUsage ? 'translate-x-[18px]' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Provider */}
                    <div>
                      <label className="text-xs font-medium dark:text-gray-400 text-gray-500 mb-1.5 flex items-center gap-1.5">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-16.5-3a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3m-19.5 0a4.5 4.5 0 0 1 .9-2.7L5.737 5.1a3.375 3.375 0 0 1 2.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 0 1 .9 2.7m0 0a3 3 0 0 1-3 3m0 3h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Zm-3 6h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Z" />
                        </svg>
                        Provider
                      </label>
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
                      <label className="text-xs font-medium dark:text-gray-400 text-gray-500 mb-1.5 flex items-center gap-1.5">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
                        </svg>
                        Model
                      </label>
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
                          <label className="text-xs font-medium dark:text-gray-400 text-gray-500 flex items-center gap-1.5">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
                            </svg>
                            API Key
                          </label>
                          {savedApiKeys[selectedProvider] && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-indigo-400 flex items-center gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                                  <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                                </svg>
                                Saved
                              </span>
                              <button
                                type="button"
                                onClick={() => { setDeleteKeyConfirm(true); setDeleteKeyInput(''); }}
                                className="text-[10px] text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Delete confirmation */}
                        {deleteKeyConfirm && savedApiKeys[selectedProvider] ? (
                          <div className="space-y-2">
                            <div className="px-3 py-2.5 rounded-lg border dark:border-red-500/20 border-red-200 dark:bg-red-500/5 bg-red-50">
                              <p className="text-xs dark:text-red-400 text-red-600 mb-2">
                                To confirm, type <span className="font-semibold">delete</span> below.
                              </p>
                              <input
                                type="text"
                                value={deleteKeyInput}
                                onChange={(e) => setDeleteKeyInput(e.target.value)}
                                placeholder="Type delete to confirm"
                                className="w-full text-sm dark:bg-[#111213] bg-white dark:text-gray-200 text-gray-800 border dark:border-red-500/30 border-red-300 rounded-lg px-3 py-1.5 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/20 transition-colors"
                                autoFocus
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => { setDeleteKeyConfirm(false); setDeleteKeyInput(''); }}
                                className="flex-1 text-sm py-1.5 dark:text-gray-400 text-gray-500 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={handleDeleteApiKey}
                                disabled={deleteKeyInput !== 'delete'}
                                className="flex-1 text-sm py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer font-medium"
                              >
                                Delete Key
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
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
                          </>
                        )}
                      </div>
                    )}
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
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-indigo-500/[0.08] dark:bg-indigo-500/[0.03] blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/3 right-0 w-[400px] h-[400px] bg-purple-500/[0.06] dark:bg-purple-500/[0.02] blur-[120px] pointer-events-none" />

        {/* Header */}
        <header className="flex-shrink-0 px-6 py-4 relative z-10 border-b dark:border-white/[0.06] border-gray-200/80 dark:bg-[#0d0d0e]/80 bg-white/70 backdrop-blur-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.05)] dark:shadow-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-status-glow ring-2 ring-emerald-400/20" />
              <span className="text-base font-semibold dark:text-gray-100 text-gray-800">{currentProviderLabel}</span>
              <span className="text-xs bg-gradient-to-r from-indigo-500/15 to-purple-500/15 dark:text-indigo-300 text-indigo-600 px-3 py-1 rounded-full font-semibold border dark:border-indigo-400/20 border-indigo-300/30 shadow-sm dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">{currentModelLabel}</span>
              {activeAgent && (
                <button
                  onClick={() => setAgentBrowserOpen(true)}
                  className="text-xs bg-gradient-to-r from-emerald-500/15 to-teal-500/15 dark:text-emerald-300 text-emerald-600 px-3 py-1 rounded-full font-semibold border dark:border-emerald-400/20 border-emerald-300/30 shadow-sm dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] hover:from-emerald-500/25 hover:to-teal-500/25 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                  </svg>
                  {activeAgent.name}
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <ExportMenu
                  messages={messages}
                  sessionTitle={sessions.find(s => s.id === chatId)?.title || 'Chat'}
                />
              )}
              {/* Agent dropdown */}
              <div className="relative" ref={agentDropdownRef}>
                <button
                  onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
                  className={`p-2 rounded-lg transition-colors cursor-pointer ${activeAgent ? 'dark:text-emerald-400 text-emerald-500 dark:hover:bg-emerald-500/10 hover:bg-emerald-50' : 'dark:text-gray-500 text-gray-400 dark:hover:bg-[#2a2b2d] hover:bg-gray-200'}`}
                  title="AI Agents"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                  </svg>
                </button>
                {agentDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 w-56 dark:bg-[#1e1f20] bg-white border dark:border-[#333537] border-gray-200 rounded-xl shadow-2xl shadow-black/8 dark:shadow-black/40 ring-1 ring-black/[0.03] dark:ring-white/[0.03] z-30 overflow-hidden animate-slide-up">
                    {installedAgents.length > 0 && (
                      <div className="py-1">
                        <div className="px-3 py-1.5 text-[10px] font-semibold dark:text-gray-500 text-gray-400 uppercase tracking-wider">Installed Agents</div>
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
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 ml-auto flex-shrink-0">
                                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="border-t dark:border-[#333537] border-gray-200">
                      <button
                        onClick={() => { setAgentBrowserOpen(true); setAgentDropdownOpen(false); }}
                        className="flex items-center gap-2 w-full px-3 py-2.5 text-sm dark:text-indigo-400 text-indigo-500 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 transition-colors cursor-pointer"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
                        </svg>
                        Browse Agent Store
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={() => setSystemPromptEditorOpen(true)}
                className={`p-2 rounded-lg transition-colors cursor-pointer ${systemPrompt || activeAgent ? 'dark:text-indigo-400 text-indigo-500 dark:hover:bg-indigo-500/10 hover:bg-indigo-50' : 'dark:text-gray-500 text-gray-400 dark:hover:bg-[#2a2b2d] hover:bg-gray-200'}`}
                title="System prompt"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto w-full scroll-smooth px-4">
          <div className="max-w-3xl mx-auto py-8 pb-44 space-y-6">

            {messages.length === 0 && (
               <div className="flex flex-col items-center justify-center text-center mt-28">
                 <button
                   onClick={() => { setLightningStrike(true); setTimeout(() => setLightningStrike(false), 1200); }}
                   className="w-16 h-16 dark:bg-[#1a1b1c] bg-white rounded-2xl border dark:border-[#2a2b2d] border-gray-200 shadow-2xl shadow-indigo-500/10 dark:shadow-indigo-500/5 flex items-center justify-center mb-8 cursor-pointer relative overflow-hidden active:scale-95 transition-transform hover:shadow-indigo-500/15 hover:border-indigo-500/30"
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-8 h-8 text-indigo-400 relative z-10 ${lightningStrike ? 'animate-lightning' : ''}`}>
                      <path fillRule="evenodd" d="M14.615 1.595a.75.75 0 0 1 .359.852L12.982 9.75h7.268a.75.75 0 0 1 .548 1.262l-10.5 11.25a.75.75 0 0 1-1.272-.71l1.992-7.302H3.75a.75.75 0 0 1-.548-1.262l10.5-11.25a.75.75 0 0 1 .913-.143Z" clipRule="evenodd" />
                    </svg>
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
                       className="px-4 py-2 text-sm dark:bg-white/[0.04] bg-white dark:text-gray-400 text-gray-500 rounded-xl border dark:border-white/[0.08] border-gray-200 dark:hover:bg-white/[0.08] hover:bg-gray-100 dark:hover:text-gray-200 hover:text-gray-700 dark:hover:border-white/[0.12] hover:border-gray-300 shadow-sm hover:shadow-md dark:shadow-none transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                     >
                       {suggestion}
                     </button>
                   ))}
                 </div>
               </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-message-in group/msg`}>
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
                    px-5 py-3 max-w-[85%] sm:max-w-[75%] leading-relaxed ${fontSize === 'sm' ? 'text-sm' : fontSize === 'lg' ? 'text-lg' : 'text-[15px]'}
                    ${m.role === 'user'
                      ? "bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-2xl rounded-br-sm shadow-lg shadow-indigo-500/25 dark:shadow-indigo-500/20"
                      : "dark:bg-[#161718] bg-white dark:text-gray-300 text-gray-700 border dark:border-white/[0.06] border-gray-200/80 rounded-2xl rounded-bl-sm shadow-md shadow-gray-200/50 dark:shadow-[0_0_20px_-5px_rgba(99,102,241,0.06)]"}
                  `}>
                    {m.role === 'assistant' ? (
                      <MarkdownRenderer content={m.parts?.map(p => p.type === 'text' ? p.text : '').join('') || ''} darkMode={darkMode} />
                    ) : (
                      <div className="space-y-2">
                        {m.parts?.some((p: any) => p.type === 'file') && (
                          <div className="flex flex-wrap gap-2">
                            {m.parts?.map((part: any, index: number) =>
                              part.type === 'file' ? (
                                <FilePreview key={index} url={part.url} mediaType={part.mediaType} filename={part.filename} />
                              ) : null
                            )}
                          </div>
                        )}
                        <div className="whitespace-pre-wrap">
                          {m.parts?.map((part: any, index: number) =>
                            part.type === 'text' ? <span key={index}>{part.text}</span> : null
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Action buttons — below bubble */}
                {editingMessageId !== m.id && (
                  <div className={`flex items-center gap-0.5 mt-1 opacity-0 group-hover/msg:opacity-100 transition-all duration-200 ${m.role === 'user' ? 'mr-1' : 'ml-1'}`}>
                    <button
                      onClick={() => copyMessage(m.id)}
                      className="p-1.5 rounded-lg dark:hover:bg-white/[0.06] hover:bg-gray-100 dark:text-gray-500 text-gray-400 dark:hover:text-gray-300 hover:text-gray-600 transition-all cursor-pointer hover:scale-110 active:scale-95"
                      title="Copy"
                    >
                      {copiedMessageId === m.id ? (
                        <span className="animate-copy-feedback">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 text-emerald-400">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                        </span>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                        </svg>
                      )}
                    </button>
                    {m.role === 'user' && !isLoading && (
                      <button
                        onClick={() => startEditing(m.id)}
                        className="p-1.5 rounded-lg dark:hover:bg-white/[0.06] hover:bg-gray-100 dark:text-gray-500 text-gray-400 dark:hover:text-gray-300 hover:text-gray-600 transition-all cursor-pointer hover:scale-110 active:scale-95"
                        title="Edit & resend"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                        </svg>
                      </button>
                    )}
                    {!isLoading && sessions.some(s => s.id === chatId) && (
                      <button
                        onClick={() => forkChat(m.id)}
                        className="p-1.5 rounded-lg dark:hover:bg-white/[0.06] hover:bg-gray-100 dark:text-gray-500 text-gray-400 dark:hover:text-gray-300 hover:text-gray-600 transition-all cursor-pointer hover:scale-110 active:scale-95"
                        title="Fork conversation from here"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
                        </svg>
                      </button>
                    )}
                    {showTokenUsage && m.role === 'assistant' && tokenUsage[m.id] && (
                      <span className="ml-1 text-[11px] dark:text-gray-600 text-gray-400">
                        ~{(tokenUsage[m.id].totalTokens || 0).toLocaleString()} tokens
                        {(() => {
                          const cost = estimateCost(
                            tokenUsage[m.id].model,
                            tokenUsage[m.id].promptTokens || 0,
                            tokenUsage[m.id].completionTokens || 0
                          );
                          return cost !== null ? ` · ~$${cost.toFixed(4)}` : '';
                        })()}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}

            {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="flex justify-start animate-message-in">
                <div className="dark:bg-[#161718] bg-white border dark:border-white/[0.06] border-gray-200/80 rounded-2xl rounded-bl-sm shadow-sm overflow-hidden">
                  <div className="px-5 py-4 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-dot-wave" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-dot-wave" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-dot-wave" style={{ animationDelay: '300ms' }} />
                  </div>
                  <div className="h-0.5 rounded-b-full overflow-hidden">
                    <div className="h-full loading-shimmer" />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />

          </div>
        </div>

        {/* Drag-and-drop overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-40 bg-indigo-500/10 border-2 border-dashed border-indigo-400 rounded-xl flex items-center justify-center pointer-events-none animate-backdrop-in">
            <div className="text-lg font-medium dark:text-indigo-300 text-indigo-600">Drop files here</div>
          </div>
        )}

        {/* Input area */}
        <div
          className="absolute bottom-0 left-0 w-full pb-6 pt-16 px-4 pointer-events-none"
          style={{ background: darkMode ? 'linear-gradient(to top, #0d0d0e 40%, transparent)' : 'linear-gradient(to top, #f9fafb 40%, transparent)' }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files.length > 0) {
              handleFilesSelected(e.dataTransfer.files);
            }
          }}
        >
          <div className="max-w-3xl mx-auto w-full pointer-events-auto">
            {/* Pending files strip */}
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2 px-1">
                {pendingFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg dark:bg-[#1e1f20] bg-gray-100 border dark:border-[#333537] border-gray-200 text-sm">
                    {f.mediaType.startsWith('image/') ? (
                      <img src={f.url} alt={f.filename} className="w-6 h-6 rounded object-cover" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 dark:text-gray-400 text-gray-500">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                      </svg>
                    )}
                    <span className="dark:text-gray-300 text-gray-700 truncate max-w-[120px]">{f.filename}</span>
                    <button
                      type="button"
                      onClick={() => removePendingFile(i)}
                      className="p-0.5 rounded dark:hover:bg-white/[0.1] hover:bg-gray-200 dark:text-gray-500 text-gray-400 dark:hover:text-gray-300 hover:text-gray-600 cursor-pointer"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                        <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                      </svg>
                    </button>
                  </div>
                ))}
                {uploadingCount > 0 && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm dark:text-gray-500 text-gray-400">
                    <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                    Uploading...
                  </div>
                )}
              </div>
            )}
            <form onSubmit={onFormSubmit} className="dark:bg-[#161718] bg-white rounded-2xl border dark:border-white/[0.08] border-gray-200 shadow-xl dark:shadow-black/30 shadow-gray-300/40 focus-within:border-indigo-500/40 focus-within:ring-2 focus-within:ring-indigo-500/10 transition-all duration-300">
              {/* Textarea row */}
              <textarea
                className="w-full pt-4 pb-2 px-4 outline-none dark:text-gray-100 text-gray-800 bg-transparent dark:placeholder-gray-500 placeholder-gray-400 text-[15px] resize-none max-h-40 overflow-y-auto"
                rows={1}
                value={inputValue}
                placeholder={`Message ${currentProviderLabel}...`}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
                onKeyDown={(e) => {
                  if (sendWithEnter) {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (inputValue.trim() || pendingFiles.length > 0) {
                        (e.target as HTMLTextAreaElement).form?.requestSubmit();
                      }
                    }
                  } else {
                    if (e.key === 'Enter' && e.shiftKey) {
                      e.preventDefault();
                      if (inputValue.trim() || pendingFiles.length > 0) {
                        (e.target as HTMLTextAreaElement).form?.requestSubmit();
                      }
                    }
                  }
                }}
                disabled={isLoading}
              />
              {/* Toolbar row */}
              <div className="flex items-center justify-between px-2 pb-2 pt-0.5">
                <div className="flex items-center gap-0.5">
                  <FileUploadButton onFilesSelected={handleFilesSelected} disabled={isLoading} />
                  {/* Model selector */}
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
                      <div className="absolute bottom-full left-0 mb-1.5 w-56 dark:bg-[#1a1b1c] bg-white border dark:border-[#2a2b2d] border-gray-200 rounded-xl shadow-2xl shadow-black/8 dark:shadow-black/40 ring-1 ring-black/[0.03] dark:ring-white/[0.03] overflow-hidden z-50 animate-slide-up">
                        <div className="max-h-64 overflow-y-auto py-1">
                          {Object.entries(modelCatalog).map(([provider, models]) => {
                            const hasKey = provider === 'ollama' || !!savedApiKeys[provider];
                            return (
                              <div key={provider}>
                                <div className="px-3 pt-2 pb-1">
                                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${hasKey ? 'dark:text-gray-400 text-gray-500' : 'dark:text-gray-600 text-gray-400'}`}>
                                    {providerNames[provider] || provider}
                                    {!hasKey && <span className="ml-1 normal-case tracking-normal font-normal">· no key</span>}
                                  </span>
                                </div>
                                {models.map((m) => {
                                  const isActive = selectedProvider === provider && selectedModel === m.id;
                                  return (
                                    <button
                                      key={`${provider}-${m.id}`}
                                      type="button"
                                      disabled={!hasKey}
                                      onClick={() => handleQuickModelSwitch(provider, m.id)}
                                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                                        isActive
                                          ? 'dark:bg-indigo-500/15 bg-indigo-50 dark:text-indigo-300 text-indigo-600 font-medium cursor-pointer'
                                          : hasKey
                                            ? 'dark:text-gray-300 text-gray-700 dark:hover:bg-white/[0.06] hover:bg-gray-50 cursor-pointer'
                                            : 'dark:text-gray-600 text-gray-350 opacity-40 cursor-not-allowed'
                                      }`}
                                    >
                                      {m.label}
                                    </button>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <VoiceInputButton
                    onTranscript={(text) => setInputValue(prev => prev + (prev ? ' ' : '') + text)}
                    disabled={isLoading}
                  />
                  <button
                    type="submit"
                    disabled={(!inputValue.trim() && pendingFiles.length === 0) || isLoading}
                    className={`p-2 rounded-xl transition-all duration-200 active:scale-90 cursor-pointer ${inputValue.trim() || pendingFiles.length > 0 ? 'text-indigo-500 hover:text-indigo-400 hover:bg-indigo-500/10 hover:shadow-md hover:shadow-indigo-500/20 send-glow' : 'text-gray-500'}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                      <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                    </svg>
                  </button>
                </div>
              </div>
            </form>
            <div className="text-center mt-3 text-[11px] dark:text-gray-600 text-gray-400">
              AI can make mistakes. Verify important information.
            </div>
          </div>
        </div>

        {/* Full-page lightning bolt strike */}
        {/* Search Modal */}
        {searchOpen && (
          <SearchModal
            onClose={() => setSearchOpen(false)}
            onSelectResult={(sessionId) => { setSearchOpen(false); loadChat(sessionId); }}
          />
        )}

        {/* System Prompt Editor */}
        {systemPromptEditorOpen && (
          <SystemPromptEditor
            currentPrompt={systemPrompt}
            onSave={handleSaveSystemPrompt}
            onClose={() => setSystemPromptEditorOpen(false)}
            activeAgent={activeAgent}
            onDetachAgent={handleDetachAgent}
          />
        )}

        {/* Agent Browser */}
        {agentBrowserOpen && (
          <AgentBrowser
            installedAgents={installedAgents}
            onInstall={installAgent}
            onUninstall={uninstallAgent}
            onSelect={selectAgent}
            onClose={() => setAgentBrowserOpen(false)}
          />
        )}

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