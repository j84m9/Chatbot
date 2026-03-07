'use client';

import { useRef, useEffect, useImperativeHandle, forwardRef, useState, useCallback } from 'react';

export interface SqlEditorHandle {
  insertText: (text: string) => void;
}

interface SqlEditorProps {
  initialSql?: string;
  onExecute: (sql: string) => void;
  isExecuting: boolean;
  darkMode: boolean;
  dbType?: 'sqlite' | 'mssql';
}

const SqlEditor = forwardRef<SqlEditorHandle, SqlEditorProps>(function SqlEditor(
  { initialSql = '', onExecute, isExecuting, darkMode, dbType = 'sqlite' },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<any>(null);
  const themeCompartmentRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  // Track execution state for the toolbar
  const [lineCount, setLineCount] = useState(1);

  useImperativeHandle(ref, () => ({
    insertText(text: string) {
      const view = viewRef.current;
      if (!view) return;
      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
      });
      view.focus();
    },
  }));

  // Initialize CodeMirror
  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    (async () => {
      const { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, highlightActiveLine } = await import('@codemirror/view');
      const { EditorState, Compartment } = await import('@codemirror/state');
      const { defaultKeymap, history, historyKeymap, indentWithTab } = await import('@codemirror/commands');
      const { sql, SQLite, MSSQL } = await import('@codemirror/lang-sql');
      const { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, foldKeymap } = await import('@codemirror/language');
      const { closeBrackets, closeBracketsKeymap } = await import('@codemirror/autocomplete');
      const { searchKeymap, highlightSelectionMatches } = await import('@codemirror/search');
      const { oneDark } = await import('@codemirror/theme-one-dark');

      if (destroyed || !containerRef.current) return;

      const themeCompartment = new Compartment();
      themeCompartmentRef.current = themeCompartment;

      const dialect = dbType === 'mssql' ? MSSQL : SQLite;

      // Light theme
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

      const runKeyBinding = keymap.of([{
        key: 'Mod-Enter',
        run: (view: any) => {
          const state = view.state;
          const sel = state.selection.main;
          const text = sel.empty ? state.doc.toString() : state.sliceDoc(sel.from, sel.to);
          if (text.trim()) onExecute(text.trim());
          return true;
        },
      }]);

      const updateListener = EditorView.updateListener.of((update: any) => {
        if (update.docChanged) {
          setLineCount(update.state.doc.lines);
        }
      });

      const state = EditorState.create({
        doc: initialSql,
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
          sql({ dialect }),
          themeCompartment.of(darkMode ? oneDark : lightTheme),
          runKeyBinding,
          updateListener,
          EditorView.lineWrapping,
        ],
      });

      const view = new EditorView({
        state,
        parent: containerRef.current!,
      });

      viewRef.current = view;
      setReady(true);
      setLineCount(state.doc.lines);
    })();

    return () => {
      destroyed = true;
      viewRef.current?.destroy();
      viewRef.current = null;
      setReady(false);
    };
    // Only re-init on dbType change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbType]);

  // Update theme when darkMode changes (without remounting)
  useEffect(() => {
    const view = viewRef.current;
    const compartment = themeCompartmentRef.current;
    if (!view || !compartment || !ready) return;

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
  }, [darkMode, ready]);

  // Update editor content when initialSql changes from outside
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !ready) return;
    const current = view.state.doc.toString();
    if (current !== initialSql) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: initialSql },
      });
    }
  }, [initialSql, ready]);

  const handleRun = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const state = view.state;
    const sel = state.selection.main;
    const text = sel.empty ? state.doc.toString() : state.sliceDoc(sel.from, sel.to);
    if (text.trim()) onExecute(text.trim());
  }, [onExecute]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b dark:border-[#2a2b2d] border-gray-200 dark:bg-[#1a1b1c] bg-gray-50 flex-shrink-0">
        <button
          onClick={handleRun}
          disabled={isExecuting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-sm"
          title="Run query (Ctrl+Enter)"
        >
          {isExecuting ? (
            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.344-5.891a1.5 1.5 0 0 0 0-2.538L6.3 2.841Z" />
            </svg>
          )}
          Run
        </button>
        <span className="text-[10px] dark:text-gray-600 text-gray-400 ml-1">
          {navigator.platform?.includes('Mac') ? 'Cmd' : 'Ctrl'}+Enter
        </span>
        <div className="flex-1" />
        <span className="text-[10px] dark:text-gray-600 text-gray-400">
          {lineCount} line{lineCount !== 1 ? 's' : ''}
        </span>
        <span className="text-[10px] dark:text-gray-500 text-gray-400 px-1.5 py-0.5 rounded dark:bg-[#2a2b2d] bg-gray-200 font-mono">
          {dbType === 'mssql' ? 'T-SQL' : 'SQLite'}
        </span>
      </div>

      {/* Editor container */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-auto [&_.cm-editor]:h-full [&_.cm-editor]:outline-none [&_.cm-scroller]:overflow-auto"
      />
    </div>
  );
});

export default SqlEditor;
