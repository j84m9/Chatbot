'use client';

import { useChat } from '@ai-sdk/react';
import { useState, useRef, useEffect } from 'react';

export default function Chat() {
  // 1. Generate a stable session ID
  const sessionId = useRef(crypto.randomUUID()).current;
  const [sessions, setSessions] = useState<any[]>([]);

  // 2. Clean useChat hook using the default Vercel AI SDK pattern
  const { messages, sendMessage } = useChat({
    id: sessionId
  });

  const [input, setInput] = useState('');

  // 3. Load past sessions for the sidebar
  useEffect(() => {
    async function loadSessions() {
      try {
        const response = await fetch('/api/sessions');
        if (response.ok) {
          const data = await response.json();
          setSessions(data);
        }
      } catch (error) {
        console.error("Failed to load sessions:", error);
      }
    }
    loadSessions();
  }, []);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    sendMessage({ text: input }); 
    setInput(''); 
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex h-screen w-full bg-[#131314] text-gray-100 font-sans overflow-hidden">
      
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 bg-[#1e1f20] border-r border-[#333537] flex flex-col">
        <div className="p-4">
          <button 
            onClick={() => window.location.reload()} 
            className="w-full flex items-center justify-center gap-2 bg-[#333537] hover:bg-[#4a4d51] text-gray-200 py-3 rounded-lg transition-colors font-medium"
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
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#333537] text-gray-300 text-sm truncate transition-colors"
              >
                Chat from {formatTime(session.created_at)}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Chat */}
      <div className="flex-1 flex flex-col relative">
        <header className="flex-shrink-0 p-4 text-xl font-medium text-gray-200 bg-[#131314]">
          Llama 3.2
        </header>

        <div className="flex-1 overflow-y-auto w-full scroll-smooth px-4">
          <div className="max-w-3xl mx-auto py-8 pb-40 space-y-8">
            {messages.length === 0 && (
               <div className="text-center text-gray-400 mt-32 text-3xl font-light">
                 How can I help you today?
               </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={m.role === 'user' ? "bg-[#1e1f20] text-gray-100 px-6 py-3 rounded-3xl max-w-[80%]" : "text-gray-100 max-w-[90%]"}>
                  <div className="whitespace-pre-wrap leading-relaxed">
                    {m.parts?.map((part, index) => 
                      part.type === 'text' ? <span key={index}>{part.text}</span> : null
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Input Bar */}
        <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-[#131314] via-[#131314] to-transparent pb-8 pt-12 px-4 pointer-events-none">
          <div className="max-w-3xl mx-auto w-full pointer-events-auto">
            <form onSubmit={handleFormSubmit} className="relative flex items-center bg-[#1e1f20] rounded-full overflow-hidden focus-within:ring-1 focus-within:ring-gray-600">
              <input
                className="w-full py-4 pl-6 pr-14 outline-none text-gray-100 bg-transparent placeholder-gray-400"
                value={input}
                placeholder="Ask Llama anything..."
                onChange={(e) => setInput(e.target.value)}
              />
              <button type="submit" disabled={!input.trim()} className="absolute right-3 p-2 text-gray-400 hover:text-gray-100 disabled:opacity-50">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}