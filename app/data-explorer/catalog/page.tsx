'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import yaml from 'js-yaml';

export default function CatalogEditorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const connectionId = searchParams.get('connectionId') || '';

  const [darkMode, setDarkMode] = useState(true);
  const [connectionName, setConnectionName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<any>(null);
  const themeCompartmentRef = useRef<any>(null);
  const [editorReady, setEditorReady] = useState(false);

  // Read theme from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const isDark = saved ? saved === 'dark' : true;
    setDarkMode(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  // Fetch metadata and build YAML
  useEffect(() => {
    if (!connectionId) return;

    // Try to get connection name from sessionStorage
    try {
      const raw = sessionStorage.getItem('data-explorer-state');
      if (raw) {
        const state = JSON.parse(raw);
        if (state.connectionName) setConnectionName(state.connectionName);
      }
    } catch {
      // Ignore
    }

    (async () => {
      try {
        const res = await fetch(`/api/data-explorer/catalog?connectionId=${connectionId}`);
        const data = await res.json();
        const metaRows = data?.metadata || [];

        const tablesObj: Record<string, any> = {};
        for (const meta of metaRows) {
          tablesObj[meta.table_name] = {
            schema: meta.table_schema,
            description: meta.user_description || meta.auto_description || '',
            tags: meta.tags?.length ? meta.tags : [],
            category: meta.category || '',
          };
        }

        const header = '# Data Catalogue\n# Edit descriptions, tags, and categories, then save.\n\n';
        const doc = yaml.dump({ tables: tablesObj }, { lineWidth: -1 });
        initEditor(header + doc);
      } catch {
        initEditor('# Failed to load catalogue data.\n');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId]);

  const initEditor = useCallback((content: string) => {
    if (!containerRef.current) return;
    let destroyed = false;

    (async () => {
      const { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, highlightActiveLine } = await import('@codemirror/view');
      const { EditorState, Compartment } = await import('@codemirror/state');
      const { defaultKeymap, history, historyKeymap, indentWithTab } = await import('@codemirror/commands');
      const { yaml: yamlLang } = await import('@codemirror/lang-yaml');
      const { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, foldKeymap } = await import('@codemirror/language');
      const { closeBrackets, closeBracketsKeymap } = await import('@codemirror/autocomplete');
      const { searchKeymap, highlightSelectionMatches } = await import('@codemirror/search');
      const { oneDark } = await import('@codemirror/theme-one-dark');

      if (destroyed || !containerRef.current) return;

      const themeCompartment = new Compartment();
      themeCompartmentRef.current = themeCompartment;

      const lightTheme = EditorView.theme({
        '&': { backgroundColor: '#ffffff', color: '#1e293b' },
        '.cm-gutters': { backgroundColor: '#f8fafc', color: '#94a3b8', borderRight: '1px solid #e2e8f0' },
        '.cm-activeLineGutter': { backgroundColor: '#f1f5f9' },
        '.cm-activeLine': { backgroundColor: '#f8fafc' },
        '.cm-cursor': { borderLeftColor: '#6366f1' },
        '.cm-selectionBackground': { backgroundColor: '#c7d2fe !important' },
        '&.cm-focused .cm-selectionBackground': { backgroundColor: '#c7d2fe !important' },
        '.cm-matchingBracket': { backgroundColor: '#c7d2fe', color: '#4338ca' },
      });

      const isDark = localStorage.getItem('theme') !== 'light';

      const state = EditorState.create({
        doc: content,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          foldGutter(),
          drawSelection(),
          EditorState.allowMultipleSelections.of(true),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          bracketMatching(),
          closeBrackets(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
            indentWithTab,
          ]),
          yamlLang(),
          themeCompartment.of(isDark ? oneDark : lightTheme),
          EditorView.lineWrapping,
        ],
      });

      const view = new EditorView({
        state,
        parent: containerRef.current!,
      });

      viewRef.current = view;
      setEditorReady(true);
    })();

    return () => {
      destroyed = true;
      viewRef.current?.destroy();
      viewRef.current = null;
      setEditorReady(false);
    };
  }, []);

  // Update theme when darkMode changes
  useEffect(() => {
    const view = viewRef.current;
    const compartment = themeCompartmentRef.current;
    if (!view || !compartment || !editorReady) return;

    (async () => {
      const { EditorView } = await import('@codemirror/view');
      const { oneDark } = await import('@codemirror/theme-one-dark');

      const lightTheme = EditorView.theme({
        '&': { backgroundColor: '#ffffff', color: '#1e293b' },
        '.cm-gutters': { backgroundColor: '#f8fafc', color: '#94a3b8', borderRight: '1px solid #e2e8f0' },
        '.cm-activeLineGutter': { backgroundColor: '#f1f5f9' },
        '.cm-activeLine': { backgroundColor: '#f8fafc' },
        '.cm-cursor': { borderLeftColor: '#6366f1' },
        '.cm-selectionBackground': { backgroundColor: '#c7d2fe !important' },
        '&.cm-focused .cm-selectionBackground': { backgroundColor: '#c7d2fe !important' },
        '.cm-matchingBracket': { backgroundColor: '#c7d2fe', color: '#4338ca' },
      });

      view.dispatch({
        effects: compartment.reconfigure(darkMode ? oneDark : lightTheme),
      });
    })();
  }, [darkMode, editorReady]);

  const handleSave = useCallback(async () => {
    const view = viewRef.current;
    if (!view || !connectionId) return;

    const content = view.state.doc.toString();

    let parsed: any;
    try {
      parsed = yaml.load(content);
    } catch (e: any) {
      setSaveStatus({ type: 'error', message: `Invalid YAML: ${e.message}` });
      setTimeout(() => setSaveStatus(null), 5000);
      return;
    }

    if (!parsed?.tables || typeof parsed.tables !== 'object') {
      setSaveStatus({ type: 'error', message: 'Missing "tables" key in YAML.' });
      setTimeout(() => setSaveStatus(null), 5000);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/data-explorer/catalog/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId, entries: parsed.tables }),
      });

      if (!res.ok) {
        const err = await res.json();
        setSaveStatus({ type: 'error', message: err.error || 'Save failed' });
      } else {
        const result = await res.json();
        setSaveStatus({ type: 'success', message: `Saved! ${result.imported} tables updated.` });
      }
    } catch {
      setSaveStatus({ type: 'error', message: 'Network error' });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveStatus(null), 3000);
    }
  }, [connectionId]);

  return (
    <div className="h-screen flex flex-col dark:bg-[#0d0d0e] bg-gray-50 dark:text-gray-100 text-gray-900 font-sans">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b dark:border-white/[0.06] border-gray-200/80 dark:bg-[#0d0d0e]/90 bg-gray-50/90 backdrop-blur-xl flex-shrink-0">
        <button
          onClick={() => window.close()}
          className="p-1.5 rounded-lg dark:hover:bg-white/5 hover:bg-gray-200 transition-colors cursor-pointer"
          title="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 dark:text-gray-400 text-gray-500">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
        </button>

        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4.5 h-4.5 text-indigo-400">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
        </svg>
        <span className="text-sm font-semibold dark:text-gray-100 text-gray-800">Edit Catalogue</span>

        {connectionName && (
          <span className="text-xs px-2 py-0.5 rounded-full dark:bg-indigo-500/15 bg-indigo-100 dark:text-indigo-300 text-indigo-600">
            {connectionName}
          </span>
        )}

        <div className="flex-1" />

        {saveStatus && (
          <span className={`text-xs ${saveStatus.type === 'success' ? 'dark:text-emerald-400 text-emerald-600' : 'dark:text-red-400 text-red-600'}`}>
            {saveStatus.message}
          </span>
        )}

        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-sm"
        >
          {saving ? (
            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          )}
          Save
        </button>
      </header>

      {/* Editor */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
            <span className="text-sm dark:text-gray-400 text-gray-500">Loading catalogue...</span>
          </div>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="flex-1 min-h-0 overflow-auto [&_.cm-editor]:h-full [&_.cm-editor]:outline-none [&_.cm-scroller]:overflow-auto"
        />
      )}
    </div>
  );
}
