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
    <div className="flex h-screen w-full bg-[#0d0d0e] text-gray-100 font-sans overflow-hidden">
      
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 bg-[#151617] border-r border-[#2a2b2d] flex flex-col z-20 shadow-xl">
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
              <button 
                key={session.id}
                onClick={() => loadChat(session.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm truncate transition-colors cursor-pointer ${
                  chatId === session.id
                    ? 'bg-[#2a2b2d] text-indigo-300 font-medium'
                    : 'hover:bg-[#1e1f20] text-gray-400 hover:text-gray-200'
                }`}
              >
                {session.title ? session.title : `Chat from ${formatTime(session.created_at)}`}
              </button>
            ))
          )}
        </div>

        {/* Bulletproof User Profile Box */}
        <div className="p-4 border-t border-[#2a2b2d] bg-[#1a1b1c] flex flex-col gap-3">
          <div className="flex items-center gap-3 px-1">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-sm font-bold text-white shadow-md uppercase">
              {/* Grab the first letter of the username, fallback to first name, then email */}
              {userProfile?.username?.charAt(0) || userProfile?.first_name?.charAt(0) || userProfile?.email?.charAt(0) || '?'}
            </div>
            <div className="flex flex-col truncate">
              {/* Top Line: Prioritize Username, fallback to First Last */}
              <span className="text-sm font-medium text-gray-200 truncate">
                {!userProfile ? 'Loading...' : userProfile.username ? userProfile.username : userProfile.first_name ? `${userProfile.first_name} ${userProfile.last_name}` : userProfile.email}
              </span>
              {/* Bottom Line: Just show the email */}
              <span className="text-xs text-gray-500 truncate">
                {userProfile?.email || 'Authenticating...'}
              </span>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#2a2b2d] text-gray-400 hover:text-white text-sm transition-colors flex items-center gap-2 cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
            </svg>
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Chat */}
      <div className="flex-1 flex flex-col relative bg-[#0d0d0e]">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-2xl h-32 bg-indigo-500/5 blur-[80px] pointer-events-none"></div>

        <header className="flex-shrink-0 p-5 text-lg font-semibold text-gray-200 bg-transparent relative z-10 border-b border-white/5">
          Llama 3.2 <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded-full ml-2 font-medium">1B Model</span>
        </header>

        <div className="flex-1 overflow-y-auto w-full scroll-smooth px-4">
          <div className="max-w-3xl mx-auto py-8 pb-40 space-y-8">
            
            {messages.length === 0 && (
               <div className="flex flex-col items-center justify-center text-center mt-32 animate-in fade-in slide-in-from-bottom-4 duration-700">
                 <div className="w-16 h-16 bg-[#1e1f20] rounded-2xl border border-[#2a2b2d] shadow-2xl flex items-center justify-center mb-6">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-indigo-400">
                      <path fillRule="evenodd" d="M14.615 1.595a.75.75 0 0 1 .359.852L12.982 9.75h7.268a.75.75 0 0 1 .548 1.262l-10.5 11.25a.75.75 0 0 1-1.272-.71l1.992-7.302H3.75a.75.75 0 0 1-.548-1.262l10.5-11.25a.75.75 0 0 1 .913-.143Z" clipRule="evenodd" />
                    </svg>
                 </div>
                 <h2 className="text-3xl font-medium text-gray-200 tracking-tight">
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
                    : "bg-[#1e1f20] text-gray-200 border border-[#2a2b2d] rounded-3xl rounded-bl-sm"}
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
                <div className="bg-[#1e1f20] border border-[#2a2b2d] px-5 py-4 rounded-3xl rounded-bl-sm shadow-md flex items-center gap-2">
                  <div className="w-2 h-2 bg-indigo-500/80 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-indigo-500/80 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-indigo-500/80 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
            
          </div>
        </div>

        <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-[#0d0d0e] via-[#0d0d0e] to-transparent pb-8 pt-12 px-4 pointer-events-none">
          <div className="max-w-3xl mx-auto w-full pointer-events-auto">
            <form onSubmit={onFormSubmit} className="relative flex items-center bg-[#1e1f20] rounded-2xl border border-[#2a2b2d] overflow-hidden shadow-2xl focus-within:border-indigo-500/50 focus-within:ring-4 focus-within:ring-indigo-500/10 transition-all duration-300">
              <input
                className="w-full py-4 pl-6 pr-14 outline-none text-gray-100 bg-transparent placeholder-gray-500 text-base"
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
      </div>
    </div>
  );
}