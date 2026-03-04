'use client';

import { useState, useEffect, useRef } from 'react';

// Simple language detection for unlabeled code blocks
function detectLanguage(code: string): string | undefined {
  const trimmed = code.trim();
  if (/^(import |from \w+ import |def |class |print\(|if __name__|#!.*python)/.test(trimmed)) return 'python';
  if (/\bself\b/.test(trimmed) && /\bdef /.test(trimmed)) return 'python';
  if (/^(const |let |var |function |import |export |=>|async )/.test(trimmed)) {
    if (/:\s*(string|number|boolean|any|void)\b/.test(trimmed) || /interface |type /.test(trimmed)) return 'typescript';
    return 'javascript';
  }
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH)\b/i.test(trimmed)) return 'sql';
  if (/^(#!\/bin\/(ba)?sh|\$ |npm |pip |curl |git |cd |ls |mkdir |echo )/.test(trimmed)) return 'bash';
  if (/^<(!DOCTYPE|html|div|span|head|body|p|a |h[1-6])/i.test(trimmed)) return 'html';
  if (/^(\.|#|@media|@import|body|html)\s*\{/.test(trimmed)) return 'css';
  if (/^\s*[\[{]/.test(trimmed) && /[\]}]\s*$/.test(trimmed)) {
    try { JSON.parse(trimmed); return 'json'; } catch { /* not json */ }
  }
  if (/^(fn |use |mod |struct |impl |let mut |pub )/.test(trimmed)) return 'rust';
  if (/^(package |func |import \(|type \w+ struct)/.test(trimmed)) return 'go';
  return undefined;
}

// Module-level cache: survives component remounts caused by react-markdown
// re-rendering the tree on each streamed token. Key = lang:theme:code → HTML.
const highlightCache = new Map<string, string>();

interface CodeBlockProps {
  code: string;
  language?: string;
}

export default function CodeBlock({ code, language }: CodeBlockProps) {
  const resolvedLanguage = language || detectLanguage(code);
  const lang = resolvedLanguage || 'text';
  const [copied, setCopied] = useState(false);

  // Read dark mode synchronously from DOM — correct on every render including
  // remounts, avoiding the useState(true) → effect → setState lag that caused
  // cache key mismatches and flicker.
  const isDark = typeof document !== 'undefined'
    ? document.documentElement.classList.contains('dark')
    : true;

  // Force re-render when dark mode toggles mid-session
  const [, setRenderTick] = useState(0);
  useEffect(() => {
    const observer = new MutationObserver(() => setRenderTick(n => n + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Derive displayed HTML from module-level cache during render — no component
  // state for the HTML means remounts never flash empty.
  const cacheKey = `${lang}:${isDark ? 'dark' : 'light'}:${code}`;
  const highlightedHtml = highlightCache.get(cacheKey) || '';

  // Async highlight only when cache misses
  const prevCodeRef = useRef<string>(code);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const effectIdRef = useRef(0);

  useEffect(() => {
    if (highlightCache.has(cacheKey)) return;

    const codeChanged = code !== prevCodeRef.current;
    prevCodeRef.current = code;
    const currentId = ++effectIdRef.current;

    const doHighlight = async () => {
      try {
        const { codeToHtml } = await import('shiki/bundle/web');
        const html = await codeToHtml(code, {
          lang,
          theme: isDark ? 'github-dark' : 'github-light',
        });
        highlightCache.set(cacheKey, html);
        if (effectIdRef.current === currentId) {
          setRenderTick(n => n + 1);
        }
      } catch {
        // Shiki failed — keep showing plain fallback
      }
    };

    clearTimeout(debounceRef.current);

    if (codeChanged) {
      // Code actively changing (being streamed) — debounce
      debounceRef.current = setTimeout(doHighlight, 150);
    } else {
      // Fresh mount with stable code — highlight immediately
      doHighlight();
    }

    return () => clearTimeout(debounceRef.current);
  }, [cacheKey, code, lang, isDark]);

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayLang = resolvedLanguage || 'text';

  return (
    <div className="code-block-wrapper rounded-xl overflow-hidden my-3 border dark:border-white/[0.08] border-gray-200 shadow-md shadow-gray-200/50 dark:shadow-black/20">
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
          className="overflow-x-auto text-sm [&_pre]:!m-0 [&_pre]:!p-4 [&_code]:block"
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
