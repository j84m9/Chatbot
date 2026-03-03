'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

export default function VoiceInputButton({ onTranscript, disabled }: VoiceInputButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupported(!!SR);
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const toggleRecording = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      const last = event.results[event.results.length - 1];
      if (last.isFinal) {
        onTranscript(last[0].transcript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, [isRecording, onTranscript]);

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={toggleRecording}
      disabled={disabled}
      className={`p-2 rounded-xl transition-all duration-200 cursor-pointer ${
        isRecording
          ? 'text-indigo-600 hover:text-indigo-500 hover:bg-indigo-500/10 animate-pulse'
          : 'dark:text-gray-500 text-gray-400 dark:hover:text-gray-300 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-white/[0.06]'
      } disabled:opacity-40 disabled:cursor-not-allowed`}
      title={isRecording ? 'Stop recording' : 'Voice input'}
    >
      {isRecording ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
          <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
        </svg>
      )}
    </button>
  );
}
