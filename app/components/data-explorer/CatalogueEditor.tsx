'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import yaml from 'js-yaml';
import FileDropZone from './FileDropZone';

interface CatalogueEditorProps {
  connectionId: string;
  darkMode: boolean;
  onClose: () => void;
  connectionType?: string;
  semanticContext?: string | null;
  onSaveSemanticContext?: (yaml: string) => void;
  fewShotExamples?: string | null;
  onSaveFewShotExamples?: (yaml: string) => void;
}

export default function CatalogueEditor({ connectionId, darkMode, onClose, connectionType, semanticContext: initialSemanticContext, onSaveSemanticContext, fewShotExamples: initialFewShotExamples, onSaveFewShotExamples }: CatalogueEditorProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [yamlContent, setYamlContent] = useState('');
  const [profiling, setProfiling] = useState(false);
  const [profileProgress, setProfileProgress] = useState('');
  const [activeTab, setActiveTab] = useState<'catalogue' | 'semantic' | 'examples'>('catalogue');
  const [semanticYaml, setSemanticYaml] = useState(initialSemanticContext || '');
  const [examplesYaml, setExamplesYaml] = useState(initialFewShotExamples || '');
  const semanticContainerRef = useRef<HTMLDivElement>(null);
  const semanticViewRef = useRef<any>(null);
  const examplesContainerRef = useRef<HTMLDivElement>(null);
  const examplesViewRef = useRef<any>(null);

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

  const handleProfile = useCallback(async () => {
    if (!connectionId || profiling) return;
    setProfiling(true);
    setProfileProgress('Starting...');
    try {
      const res = await fetch('/api/data-explorer/catalog/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId }),
      });
      if (!res.ok || !res.body) {
        setSaveStatus({ type: 'error', message: 'Profile request failed' });
        setProfiling(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.stage === 'progress') {
              setProfileProgress(evt.data?.message || 'Profiling...');
            } else if (evt.stage === 'complete') {
              setSaveStatus({ type: 'success', message: evt.data?.message || 'Profiling complete' });
            } else if (evt.stage === 'error') {
              setSaveStatus({ type: 'error', message: evt.data?.message || 'Profiling failed' });
            }
          } catch { /* skip parse errors */ }
        }
      }
    } catch {
      setSaveStatus({ type: 'error', message: 'Profile request failed' });
    } finally {
      setProfiling(false);
      setProfileProgress('');
      setTimeout(() => setSaveStatus(null), 5000);
    }
  }, [connectionId, profiling]);

  const handleSaveSemanticContext = useCallback(async () => {
    const view = semanticViewRef.current;
    if (!view || !connectionId) return;
    const content = view.state.doc.toString();
    setSaving(true);
    try {
      const res = await fetch(`/api/data-explorer/connections?id=${connectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ semantic_context: content, dbType: connectionType || 'mssql' }),
      });
      if (res.ok) {
        setSaveStatus({ type: 'success', message: 'Semantic context saved' });
        onSaveSemanticContext?.(content);
      } else {
        setSaveStatus({ type: 'error', message: 'Failed to save semantic context' });
      }
    } catch {
      setSaveStatus({ type: 'error', message: 'Network error' });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveStatus(null), 3000);
    }
  }, [connectionId, connectionType, onSaveSemanticContext]);

  const handleSaveFewShotExamples = useCallback(async () => {
    const view = examplesViewRef.current;
    if (!view || !connectionId) return;
    const content = view.state.doc.toString();
    setSaving(true);
    try {
      const res = await fetch(`/api/data-explorer/connections?id=${connectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ few_shot_examples: content, dbType: connectionType || 'mssql' }),
      });
      if (res.ok) {
        setSaveStatus({ type: 'success', message: 'Few-shot examples saved' });
        onSaveFewShotExamples?.(content);
      } else {
        setSaveStatus({ type: 'error', message: 'Failed to save examples' });
      }
    } catch {
      setSaveStatus({ type: 'error', message: 'Network error' });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveStatus(null), 3000);
    }
  }, [connectionId, connectionType, onSaveFewShotExamples]);

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

  /** Helper: replace the contents of a CodeMirror view with new text */
  const replaceEditorContent = useCallback((view: any, content: string) => {
    if (!view) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content },
    });
  }, []);

  // Initialize semantic context editor
  useEffect(() => {
    if (activeTab !== 'semantic' || !semanticContainerRef.current) return;
    let destroyed = false;

    (async () => {
      const { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, highlightActiveLine } = await import('@codemirror/view');
      const { EditorState } = await import('@codemirror/state');
      const { defaultKeymap, history, historyKeymap, indentWithTab } = await import('@codemirror/commands');
      const { yaml: yamlLang } = await import('@codemirror/lang-yaml');
      const { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, foldKeymap } = await import('@codemirror/language');
      const { closeBrackets, closeBracketsKeymap } = await import('@codemirror/autocomplete');
      const { searchKeymap, highlightSelectionMatches } = await import('@codemirror/search');
      const { oneDark } = await import('@codemirror/theme-one-dark');

      if (destroyed || !semanticContainerRef.current) return;

      const defaultYaml = semanticYaml || `# Semantic Context (YAML)
# Define business rules, key metrics, and column descriptions.
# This context is included in AI prompts for better SQL generation.

database:
  name: ""
  description: ""

tables: {}

key_metrics: []

example_queries: []
`;

      const state = EditorState.create({
        doc: defaultYaml,
        extensions: [
          lineNumbers(), highlightActiveLineGutter(), highlightSpecialChars(),
          history(), foldGutter(), drawSelection(),
          EditorState.allowMultipleSelections.of(true),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          bracketMatching(), closeBrackets(), highlightActiveLine(), highlightSelectionMatches(),
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
          yamlLang(),
          darkMode ? oneDark : EditorView.theme({
            '&': { backgroundColor: '#ffffff', color: '#1e293b' },
            '.cm-gutters': { backgroundColor: '#f8fafc', color: '#94a3b8', borderRight: '1px solid #e2e8f0' },
          }),
          EditorView.lineWrapping,
        ],
      });

      const view = new EditorView({ state, parent: semanticContainerRef.current! });
      semanticViewRef.current = view;
    })();

    return () => {
      destroyed = true;
      semanticViewRef.current?.destroy();
      semanticViewRef.current = null;
    };
  }, [activeTab, semanticYaml, darkMode]);

  // Initialize examples editor
  useEffect(() => {
    if (activeTab !== 'examples' || !examplesContainerRef.current) return;
    let destroyed = false;

    (async () => {
      const { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, highlightActiveLine } = await import('@codemirror/view');
      const { EditorState } = await import('@codemirror/state');
      const { defaultKeymap, history, historyKeymap, indentWithTab } = await import('@codemirror/commands');
      const { yaml: yamlLang } = await import('@codemirror/lang-yaml');
      const { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, foldKeymap } = await import('@codemirror/language');
      const { closeBrackets, closeBracketsKeymap } = await import('@codemirror/autocomplete');
      const { searchKeymap, highlightSelectionMatches } = await import('@codemirror/search');
      const { oneDark } = await import('@codemirror/theme-one-dark');

      if (destroyed || !examplesContainerRef.current) return;

      const defaultYaml = examplesYaml || `# Few-Shot Examples (YAML)
# Question -> SQL pairs to improve SQL generation accuracy.

- question: ""
  sql: ""
  tables: []
  pattern: ""
`;

      const state = EditorState.create({
        doc: defaultYaml,
        extensions: [
          lineNumbers(), highlightActiveLineGutter(), highlightSpecialChars(),
          history(), foldGutter(), drawSelection(),
          EditorState.allowMultipleSelections.of(true),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          bracketMatching(), closeBrackets(), highlightActiveLine(), highlightSelectionMatches(),
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
          yamlLang(),
          darkMode ? oneDark : EditorView.theme({
            '&': { backgroundColor: '#ffffff', color: '#1e293b' },
            '.cm-gutters': { backgroundColor: '#f8fafc', color: '#94a3b8', borderRight: '1px solid #e2e8f0' },
          }),
          EditorView.lineWrapping,
        ],
      });

      const view = new EditorView({ state, parent: examplesContainerRef.current! });
      examplesViewRef.current = view;
    })();

    return () => {
      destroyed = true;
      examplesViewRef.current?.destroy();
      examplesViewRef.current = null;
    };
  }, [activeTab, examplesYaml, darkMode]);

  const showTabs = onSaveSemanticContext != null;

  // Determine save button based on active tab
  const renderSaveButton = () => {
    if (activeTab === 'catalogue') {
      return (
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
      );
    }
    if (activeTab === 'semantic') {
      return (
        <button
          onClick={handleSaveSemanticContext}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-sm"
        >
          {saving ? (
            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          )}
          Save Context
        </button>
      );
    }
    // examples tab
    return (
      <button
        onClick={handleSaveFewShotExamples}
        disabled={saving}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-sm"
      >
        {saving ? (
          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        )}
        Save Examples
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b dark:border-[#2a2b2d] border-gray-200 dark:bg-[#1a1b1c] bg-gray-50 flex-shrink-0">
        {showTabs ? (
          <div className="flex items-center gap-0.5 mr-2">
            <button
              onClick={() => setActiveTab('catalogue')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${activeTab === 'catalogue' ? 'bg-indigo-500/15 text-indigo-400' : 'dark:text-gray-500 text-gray-400 hover:dark:text-gray-300 hover:text-gray-600'}`}
            >
              Catalogue
            </button>
            <button
              onClick={() => setActiveTab('semantic')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${activeTab === 'semantic' ? 'bg-indigo-500/15 text-indigo-400' : 'dark:text-gray-500 text-gray-400 hover:dark:text-gray-300 hover:text-gray-600'}`}
            >
              Semantic Context
            </button>
            <button
              onClick={() => setActiveTab('examples')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${activeTab === 'examples' ? 'bg-indigo-500/15 text-indigo-400' : 'dark:text-gray-500 text-gray-400 hover:dark:text-gray-300 hover:text-gray-600'}`}
            >
              Examples
            </button>
          </div>
        ) : (
          <span className="text-xs font-semibold dark:text-gray-300 text-gray-600 mr-1">Catalogue Editor</span>
        )}
        {renderSaveButton()}
        <button
          onClick={handleProfile}
          disabled={profiling || loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-sm"
        >
          {profiling ? (
            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
          )}
          {profiling ? profileProgress || 'Profiling...' : 'Profile Database'}
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
        <button
          onClick={onClose}
          className="p-1 rounded-md dark:hover:bg-white/5 hover:bg-gray-200 dark:text-gray-500 text-gray-400 dark:hover:text-gray-300 hover:text-gray-600 transition-colors cursor-pointer"
          title="Close editor"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Editor containers */}
      {activeTab === 'catalogue' ? (
        loading ? (
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
        )
      ) : activeTab === 'semantic' ? (
        <div className="flex-1 flex flex-col min-h-0">
          <FileDropZone
            darkMode={darkMode}
            label="Drop a schema context .yaml file here or click to browse"
            onFileLoad={(content) => replaceEditorContent(semanticViewRef.current, content)}
          />
          <div
            ref={semanticContainerRef}
            className="flex-1 min-h-0 overflow-auto [&_.cm-editor]:h-full [&_.cm-editor]:outline-none [&_.cm-scroller]:overflow-auto"
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <FileDropZone
            darkMode={darkMode}
            label="Drop a few-shot examples .yaml file here or click to browse"
            onFileLoad={(content) => replaceEditorContent(examplesViewRef.current, content)}
          />
          <div
            ref={examplesContainerRef}
            className="flex-1 min-h-0 overflow-auto [&_.cm-editor]:h-full [&_.cm-editor]:outline-none [&_.cm-scroller]:overflow-auto"
          />
        </div>
      )}
    </div>
  );
}
