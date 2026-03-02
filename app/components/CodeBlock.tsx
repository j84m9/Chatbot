'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// Singleton highlighter — loaded once, shared across all CodeBlock instances
let highlighterPromise: Promise<any> | null = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki/bundle/web').then((shiki) =>
      shiki.createHighlighter({
        themes: ['github-dark', 'github-light'],
        langs: [
          'javascript', 'typescript', 'python', 'rust', 'go', 'java', 'c',
          'cpp', 'csharp', 'ruby', 'php', 'swift', 'kotlin', 'bash', 'shell',
          'sql', 'html', 'css', 'json', 'yaml', 'toml', 'markdown', 'xml',
          'jsx', 'tsx', 'dockerfile', 'graphql',
        ],
      })
    );
  }
  return highlighterPromise;
}

interface CodeBlockProps {
  code: string;
  language?: string;
}

export default function CodeBlock({ code, language }: CodeBlockProps) {
  const [highlightedHtml, setHighlightedHtml] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCodeRef = useRef<string>('');

  const highlight = useCallback(async (text: string) => {
    try {
      const highlighter = await getHighlighter();
      const loadedLangs = highlighter.getLoadedLanguages();
      const lang = language && loadedLangs.includes(language) ? language : 'text';

      const html = highlighter.codeToHtml(text, {
        lang,
        themes: { dark: 'github-dark', light: 'github-light' },
        defaultColor: false,
      });
      setHighlightedHtml(html);
    } catch {
      // Highlighting failed — raw text fallback is already showing
    }
  }, [language]);

  useEffect(() => {
    if (code === lastCodeRef.current) return;
    lastCodeRef.current = code;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => highlight(code), 30);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [code, highlight]);

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayLang = language || 'text';

  return (
    <div className="code-block-wrapper rounded-xl overflow-hidden my-3 border dark:border-white/[0.08] border-gray-200">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 dark:bg-[#1e1f20] bg-gray-100 border-b dark:border-white/[0.06] border-gray-200">
        <span className="text-xs font-medium dark:text-gray-400 text-gray-500">{displayLang}</span>
        <button
          onClick={copyCode}
          className="flex items-center gap-1.5 text-xs dark:text-gray-400 text-gray-500 dark:hover:text-gray-200 hover:text-gray-700 transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 text-emerald-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code content */}
      {highlightedHtml ? (
        <div
          className="shiki-wrapper overflow-x-auto text-sm p-4 dark:bg-[#161718] bg-gray-50"
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      ) : (
        <pre className="overflow-x-auto text-sm p-4 dark:bg-[#161718] bg-gray-50 dark:text-gray-300 text-gray-700">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
