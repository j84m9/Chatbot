'use client';

import { useChat } from '@ai-sdk/react';
import { useState, useRef } from 'react';

export default function Chat() {
  // 1. Generate the stable UUID
  const sessionId = useRef(crypto.randomUUID()).current;

  // 2. Vercel AI SDK v5: useChat no longer manages input state. 
  // We pass `id` directly so it attaches to the request payload natively.
  const { messages, sendMessage } = useChat({
    id: sessionId
  });

  // 3. We manually manage the input state (the v5 way)
  const [input, setInput] = useState('');

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    // v5 uses the { text: input } structure for sending messages
    sendMessage({ text: input }); 
    setInput(''); 
  };

  return (
    <div className="flex flex-col w-full max-w-2xl py-24 mx-auto stretch">
      <div className="space-y-4 mb-8">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`rounded-lg px-4 py-2 max-w-[80%] ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-black'}`}>
              <div className="font-bold mb-1 text-sm">
                {m.role === 'user' ? 'You' : 'Llama 3.2'}
              </div>
              <div className="whitespace-pre-wrap">
                {m.parts?.map((part, index) => 
                  part.type === 'text' ? <span key={index}>{part.text}</span> : null
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleFormSubmit} className="fixed bottom-8 w-full max-w-2xl p-2 bg-white border border-gray-300 rounded-lg shadow-xl flex">
        <input
          className="w-full p-2 outline-none rounded-md text-gray-900"
          value={input}
          placeholder="Send a message to your local model..."
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors ml-2">
          Send
        </button>
      </form>
    </div>
  );
}