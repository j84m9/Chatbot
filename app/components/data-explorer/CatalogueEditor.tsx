'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import yaml from 'js-yaml';

interface CatalogueEditorProps {
  connectionId: string;
  darkMode: boolean;
}

export default function CatalogueEditor({ connectionId, darkMode }: CatalogueEditorProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [yamlContent, setYamlContent] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<any>(null);
  const themeCompartmentRef = useRef<any>(null);
  const [editorReady, setEditorReady] = useState(false);

  // Fetch metadata and build YAML
  useEffect(() => {
    if (!connectionId) return;

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
        setYamlContent(header + doc);
      } catch {
        setYamlContent('# Failed to load catalogue data.\n');
      } finally {
        setLoading(false);
      }
    })();
  }, [connectionId]);

  // Initialize editor after loading completes and container mounts
  useEffect(() => {
    if (loading || !containerRef.current || !yamlContent) return;
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

      const state = EditorState.create({
        doc: yamlContent,
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
          themeCompartment.of(darkMode ? oneDark : lightTheme),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, yamlContent]);

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
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b dark:border-[#2a2b2d] border-gray-200 dark:bg-[#1a1b1c] bg-gray-50 flex-shrink-0">
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-sm"
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

        {saveStatus && (
          <span className={`text-xs ${saveStatus.type === 'success' ? 'dark:text-emerald-400 text-emerald-600' : 'dark:text-red-400 text-red-600'}`}>
            {saveStatus.message}
          </span>
        )}

        <div className="flex-1" />
        <span className="text-[10px] dark:text-gray-500 text-gray-400 px-1.5 py-0.5 rounded dark:bg-[#2a2b2d] bg-gray-200 font-mono">
          YAML
        </span>
      </div>

      {/* Editor container */}
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
