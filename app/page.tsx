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
  const [darkMode, setDarkMode] = useState(true);
  const [lightningStrike, setLightningStrike] = useState(false);
  
  const supabase = createClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    const handleClickOutside = () => { setMenuOpenId(null); setSettingsOpen(false); };
    if (menuOpenId || settingsOpen) document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
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

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex h-screen w-full dark:bg-[#0d0d0e] bg-gray-50 dark:text-gray-100 text-gray-900 font-sans overflow-hidden">
      
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 dark:bg-[#151617] bg-white border-r dark:border-[#2a2b2d] border-gray-200 flex flex-col z-20 shadow-xl">
        <div className="p-4">
          <button 
            onClick={startNewChat} 
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/10 font-medium active:scale-[0.98] cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Chat
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2 mt-2">Recent</div>
          {sessions.length === 0 ? (
            <div className="text-gray-500 text-sm px-3 italic">No past sessions</div>
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
                  <div className="absolute right-0 top-full mt-1 bg-[#1e1f20] border border-[#333537] rounded-xl shadow-xl z-30 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
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
        <div className="p-4 border-t border-[#2a2b2d] dark:bg-[#1a1b1c] bg-gray-100 flex flex-col gap-3 relative">
          <div className="flex items-center gap-3 px-1">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-sm font-bold text-white shadow-md uppercase">
              {userProfile?.username?.charAt(0) || userProfile?.first_name?.charAt(0) || userProfile?.email?.charAt(0) || '?'}
            </div>
            <div className="flex flex-col truncate flex-1">
              <span className="text-sm font-medium dark:text-gray-200 text-gray-800 truncate">
                {!userProfile ? 'Loading...' : userProfile.username ? userProfile.username : userProfile.first_name ? `${userProfile.first_name} ${userProfile.last_name}` : userProfile.email}
              </span>
              <span className="text-xs text-gray-500 truncate">
                {userProfile?.email || 'Authenticating...'}
              </span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setSettingsOpen(!settingsOpen); }}
              className="p-1.5 rounded-lg dark:hover:bg-[#2a2b2d] hover:bg-gray-200 text-gray-500 dark:hover:text-gray-200 hover:text-gray-700 transition-colors cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </button>
          </div>

          {/* Settings Dropdown */}
          {settingsOpen && (
            <div onClick={(e) => e.stopPropagation()} className="absolute bottom-full left-4 right-4 mb-2 dark:bg-[#1e1f20] bg-white dark:border-[#333537] border-gray-200 border rounded-xl shadow-xl z-30 p-3 animate-in fade-in slide-in-from-bottom-1 duration-150">
              <div className="text-xs font-semibold dark:text-gray-400 text-gray-500 uppercase tracking-wider mb-2 px-1">Settings</div>
              <div className="flex items-center justify-between px-1 py-2">
                <span className="text-sm dark:text-gray-200 text-gray-700">Dark Mode</span>
                <button
                  onClick={toggleDarkMode}
                  className={`relative w-10 h-5.5 rounded-full transition-colors cursor-pointer ${darkMode ? 'bg-indigo-600' : 'bg-gray-300'}`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform ${darkMode ? 'translate-x-[18px]' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>
          )}

          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 rounded-lg dark:hover:bg-[#2a2b2d] hover:bg-gray-200 dark:text-gray-400 text-gray-600 dark:hover:text-white hover:text-gray-900 text-sm transition-colors flex items-center gap-2 cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
            </svg>
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Chat */}
      <div className="flex-1 flex flex-col relative dark:bg-[#0d0d0e] bg-gray-50">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-2xl h-32 bg-indigo-500/5 blur-[80px] pointer-events-none"></div>

        <header className="flex-shrink-0 p-5 text-lg font-semibold dark:text-gray-200 text-gray-800 bg-transparent relative z-10 border-b dark:border-white/5 border-gray-200">
          Llama 3.2 <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded-full ml-2 font-medium">1B Model</span>
        </header>

        <div className="flex-1 overflow-y-auto w-full scroll-smooth px-4">
          <div className="max-w-3xl mx-auto py-8 pb-40 space-y-8">
            
            {messages.length === 0 && (
               <div className="flex flex-col items-center justify-center text-center mt-32 animate-in fade-in slide-in-from-bottom-4 duration-700">
                 <button
                   onClick={() => { setLightningStrike(true); setTimeout(() => setLightningStrike(false), 1200); }}
                   className="w-16 h-16 dark:bg-[#1e1f20] bg-white rounded-2xl border dark:border-[#2a2b2d] border-gray-200 shadow-2xl flex items-center justify-center mb-6 cursor-pointer relative overflow-hidden active:scale-95 transition-transform"
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-8 h-8 text-indigo-400 relative z-10 ${lightningStrike ? 'animate-lightning' : ''}`}>
                      <path fillRule="evenodd" d="M14.615 1.595a.75.75 0 0 1 .359.852L12.982 9.75h7.268a.75.75 0 0 1 .548 1.262l-10.5 11.25a.75.75 0 0 1-1.272-.71l1.992-7.302H3.75a.75.75 0 0 1-.548-1.262l10.5-11.25a.75.75 0 0 1 .913-.143Z" clipRule="evenodd" />
                    </svg>
                    {lightningStrike && (
                      <div className="absolute inset-0 bg-indigo-400/30 animate-flash rounded-2xl" />
                    )}
                 </button>
                 <h2 className="text-3xl font-medium dark:text-gray-200 text-gray-800 tracking-tight">
                   Hi {userProfile?.first_name || 'there'}, how can I help?
                 </h2>
                 <p className="text-gray-500 mt-2 text-sm">Ask me to analyze data, write Python scripts, or optimize PyTorch models.</p>
               </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in duration-300`}>
                <div className={`
                  px-6 py-3.5 max-w-[85%] sm:max-w-[75%] shadow-md text-base leading-relaxed
                  ${m.role === 'user' 
                    ? "bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-3xl rounded-br-sm" 
                    : "dark:bg-[#1e1f20] bg-white dark:text-gray-200 text-gray-800 border dark:border-[#2a2b2d] border-gray-200 rounded-3xl rounded-bl-sm"}
                `}>
                  <div className="whitespace-pre-wrap">
                    {m.parts?.map((part, index) =>
                      part.type === 'text' ? <span key={index}>{part.text}</span> : null
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex justify-start animate-in fade-in duration-300">
                <div className="dark:bg-[#1e1f20] bg-white border dark:border-[#2a2b2d] border-gray-200 px-5 py-4 rounded-3xl rounded-bl-sm shadow-md flex items-center gap-2">
                  <div className="w-2 h-2 bg-indigo-500/80 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-indigo-500/80 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-indigo-500/80 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
            
          </div>
        </div>

        <div className="absolute bottom-0 left-0 w-full dark:bg-gradient-to-t dark:from-[#0d0d0e] dark:via-[#0d0d0e] bg-gradient-to-t from-gray-50 via-gray-50 to-transparent pb-8 pt-12 px-4 pointer-events-none">
          <div className="max-w-3xl mx-auto w-full pointer-events-auto">
            <form onSubmit={onFormSubmit} className="relative flex items-center dark:bg-[#1e1f20] bg-white rounded-2xl border dark:border-[#2a2b2d] border-gray-200 overflow-hidden shadow-2xl focus-within:border-indigo-500/50 focus-within:ring-4 focus-within:ring-indigo-500/10 transition-all duration-300">
              <input
                className="w-full py-4 pl-6 pr-14 outline-none dark:text-gray-100 text-gray-800 bg-transparent placeholder-gray-500 text-base"
                value={inputValue}
                placeholder="Ask Llama anything... (e.g., 'How do I optimize a PyTorch model?')"
                onChange={(e) => setInputValue(e.target.value)}
                disabled={isLoading}
              />
              <button 
                type="submit" 
                disabled={!inputValue.trim() || isLoading} 
                className="absolute right-2 p-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl disabled:opacity-0 transition-all duration-200 active:scale-95 cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                </svg>
              </button>
            </form>
            <div className="text-center mt-3 text-xs text-gray-500">
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