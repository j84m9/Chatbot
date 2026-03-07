'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import yaml from 'js-yaml';

interface Column {
  name: string;
  type: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
}

interface Table {
  name: string;
  columns: Column[];
  description?: string | null;
  tags?: string[];
}

interface TableMetadata {
  id: string;
  table_schema: string;
  table_name: string;
  auto_description: string | null;
  user_description: string | null;
  tags: string[];
  category: string | null;
}

interface SchemaBrowserProps {
  connectionId: string;
  onInsertColumn?: (text: string) => void;
  onQueryTable?: (tableName: string) => void;
  dbType?: 'sqlite' | 'mssql';
}

const TAG_COLORS: Record<string, string> = {
  sales: 'bg-emerald-500/20 text-emerald-400',
  finance: 'bg-blue-500/20 text-blue-400',
  inventory: 'bg-amber-500/20 text-amber-400',
  users: 'bg-purple-500/20 text-purple-400',
  system: 'bg-gray-500/20 text-gray-400',
  hr: 'bg-pink-500/20 text-pink-400',
  reference: 'bg-cyan-500/20 text-cyan-400',
};

function getTagColor(tag: string): string {
  const lower = tag.toLowerCase();
  return TAG_COLORS[lower] || 'bg-indigo-500/20 text-indigo-400';
}

export default function SchemaBrowser({ connectionId, onInsertColumn, onQueryTable, dbType }: SchemaBrowserProps) {
  const router = useRouter();
  const [tables, setTables] = useState<Table[]>([]);
  const [metadata, setMetadata] = useState<TableMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedTable, setExpandedTable] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingDescription, setEditingDescription] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [catalogGenerating, setCatalogGenerating] = useState(false);
  const [catalogProgress, setCatalogProgress] = useState<{ total: number; completed: number } | null>(null);
  const catalogReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  useEffect(() => {
    if (!connectionId) return;
    setLoading(true);

    // Fetch schema and metadata in parallel
    Promise.all([
      fetch(`/api/data-explorer/schema?connectionId=${connectionId}`)
        .then(r => r.json())
        .catch(() => []),
      fetch(`/api/data-explorer/catalog?connectionId=${connectionId}`)
        .then(r => r.json())
        .catch(() => ({ metadata: [] })),
    ]).then(([schemaData, catalogData]) => {
      const metaRows: TableMetadata[] = catalogData?.metadata || [];
      setMetadata(metaRows);

      const metaMap = new Map<string, TableMetadata>();
      for (const m of metaRows) {
        metaMap.set(m.table_name.toLowerCase(), m);
      }

      // API returns { schema: [...], cached } — unwrap if needed
      const schemaArray = Array.isArray(schemaData) ? schemaData : schemaData?.schema;
      if (Array.isArray(schemaArray)) {
        setTables(schemaArray.map((t: any) => {
          const name = t.tableName || t.name;
          const meta = metaMap.get(name.toLowerCase());
          return {
            name,
            columns: (t.columns || []).map((c: any) => ({
              name: c.columnName || c.name,
              type: c.dataType || c.type || '',
              isPrimaryKey: c.isPrimaryKey || false,
              isForeignKey: c.isForeignKey || false,
            })),
            description: meta?.user_description || meta?.auto_description || null,
            tags: meta?.tags || [],
          };
        }));
      }
    }).finally(() => setLoading(false));
  }, [connectionId]);

  const filteredTables = useMemo(() => {
    if (!searchQuery.trim()) return tables;
    const lower = searchQuery.toLowerCase();
    return tables.filter(t =>
      t.name.toLowerCase().includes(lower) ||
      t.description?.toLowerCase().includes(lower) ||
      t.tags?.some(tag => tag.toLowerCase().includes(lower))
    );
  }, [tables, searchQuery]);

  const handleSaveDescription = async (tableName: string) => {
    const meta = metadata.find(m => m.table_name.toLowerCase() === tableName.toLowerCase());
    if (!meta) return;

    try {
      const res = await fetch('/api/data-explorer/catalog', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: meta.id, user_description: editValue }),
      });
      if (res.ok) {
        setMetadata(prev => prev.map(m =>
          m.id === meta.id ? { ...m, user_description: editValue } : m
        ));
        setTables(prev => prev.map(t =>
          t.name.toLowerCase() === tableName.toLowerCase()
            ? { ...t, description: editValue || meta.auto_description }
            : t
        ));
      }
    } catch {
      // Failed to save
    }
    setEditingDescription(null);
  };

  const handleGenerateCatalog = async () => {
    setCatalogGenerating(true);
    setCatalogProgress(null);

    try {
      const res = await fetch('/api/data-explorer/catalog/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId }),
      });

      if (!res.ok || !res.body) {
        setCatalogGenerating(false);
        return;
      }

      const reader = res.body.getReader();
      catalogReaderRef.current = reader;
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
            const event = JSON.parse(line.slice(6));
            if (event.stage === 'progress') {
              setCatalogProgress({ total: event.data.total, completed: event.data.completed });
            } else if (event.stage === 'complete') {
              // Refresh metadata
              const catalogRes = await fetch(`/api/data-explorer/catalog?connectionId=${connectionId}`);
              const catalogData = await catalogRes.json();
              const metaRows: TableMetadata[] = catalogData?.metadata || [];
              setMetadata(metaRows);

              const metaMap = new Map<string, TableMetadata>();
              for (const m of metaRows) {
                metaMap.set(m.table_name.toLowerCase(), m);
              }
              setTables(prev => prev.map(t => {
                const meta = metaMap.get(t.name.toLowerCase());
                return {
                  ...t,
                  description: meta?.user_description || meta?.auto_description || null,
                  tags: meta?.tags || [],
                };
              }));
            }
          } catch {
            // Parse error, skip
          }
        }
      }
    } catch {
      // Generation failed or cancelled
    }
    catalogReaderRef.current = null;
    setCatalogGenerating(false);
    setCatalogProgress(null);

    // Refresh metadata (partial results are still useful if stopped early)
    try {
      const catalogRes = await fetch(`/api/data-explorer/catalog?connectionId=${connectionId}`);
      const catalogData = await catalogRes.json();
      const metaRows: TableMetadata[] = catalogData?.metadata || [];
      setMetadata(metaRows);

      const metaMap = new Map<string, TableMetadata>();
      for (const m of metaRows) {
        metaMap.set(m.table_name.toLowerCase(), m);
      }
      setTables(prev => prev.map(t => {
        const meta = metaMap.get(t.name.toLowerCase());
        return {
          ...t,
          description: meta?.user_description || meta?.auto_description || null,
          tags: meta?.tags || [],
        };
      }));
    } catch {
      // Refresh failed
    }
  };

  const handleStopCatalog = () => {
    catalogReaderRef.current?.cancel();
    catalogReaderRef.current = null;
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleEditCatalog = () => {
    router.push(`/data-explorer/catalog?connectionId=${connectionId}`);
  };

  const handleDownloadCatalog = () => {
    const tablesObj: Record<string, any> = {};
    for (const meta of metadata) {
      tablesObj[meta.table_name] = {
        schema: meta.table_schema,
        description: meta.user_description || meta.auto_description || '',
        tags: meta.tags?.length ? meta.tags : [],
        category: meta.category || '',
      };
    }
    const doc = yaml.dump({ tables: tablesObj }, { lineWidth: -1 });
    const header = '# Data Catalogue\n# Edit descriptions, tags, and categories, then re-upload.\n\n';
    const blob = new Blob([header + doc], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'catalog.yaml';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUploadCatalog = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = yaml.load(text) as any;
      if (!parsed?.tables || typeof parsed.tables !== 'object') {
        alert('Invalid YAML: missing "tables" key.');
        return;
      }
      const res = await fetch('/api/data-explorer/catalog/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId, entries: parsed.tables }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Import failed: ${err.error || 'Unknown error'}`);
        return;
      }
      // Refresh metadata
      const catalogRes = await fetch(`/api/data-explorer/catalog?connectionId=${connectionId}`);
      const catalogData = await catalogRes.json();
      const metaRows: TableMetadata[] = catalogData?.metadata || [];
      setMetadata(metaRows);

      const metaMap = new Map<string, TableMetadata>();
      for (const m of metaRows) {
        metaMap.set(m.table_name.toLowerCase(), m);
      }
      setTables(prev => prev.map(t => {
        const meta = metaMap.get(t.name.toLowerCase());
        return {
          ...t,
          description: meta?.user_description || meta?.auto_description || null,
          tags: meta?.tags || [],
        };
      }));
    } catch {
      alert('Failed to parse YAML file.');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-2 py-1">
        <div className="w-3 h-3 border border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
        <span className="text-xs dark:text-gray-500 text-gray-400">Loading schema...</span>
      </div>
    );
  }

  if (tables.length === 0) {
    return (
      <div className="text-xs dark:text-gray-600 text-gray-400 px-2 py-1 italic">No tables found</div>
    );
  }

  const hasMetadata = metadata.length > 0;
  const isLargeDb = tables.length > 30;

  return (
    <div className="space-y-1">
      {/* Search input */}
      <div className="px-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search tables..."
          className="w-full text-xs px-2 py-1 rounded-md border dark:border-[#333] border-gray-200 dark:bg-[#1a1a1a] bg-white dark:text-gray-300 text-gray-600 placeholder:dark:text-gray-600 placeholder:text-gray-400 focus:outline-none focus:border-indigo-500/50"
        />
      </div>

      {/* Catalog generation banner */}
      {!catalogGenerating && (
        <div className={`mx-2 px-2 py-1.5 rounded-md border ${
          isLargeDb && !hasMetadata
            ? 'dark:bg-red-500/10 bg-red-50 dark:border-red-500/20 border-red-200'
            : 'dark:bg-indigo-500/10 bg-indigo-50 dark:border-indigo-500/20 border-indigo-200'
        }`}>
          <p className={`text-[10px] mb-1 ${
            isLargeDb && !hasMetadata
              ? 'dark:text-red-300 text-red-600'
              : 'dark:text-indigo-300 text-indigo-600'
          }`}>
            {isLargeDb && !hasMetadata
              ? `Large database (${tables.length} tables). Generate descriptions for better AI accuracy.`
              : hasMetadata
                ? `${metadata.length} table descriptions loaded.`
                : 'Generate table descriptions for better AI accuracy.'}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={handleGenerateCatalog}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors cursor-pointer ${
                isLargeDb && !hasMetadata
                  ? 'dark:bg-red-500/20 bg-red-100 dark:text-red-300 text-red-600 dark:hover:bg-red-500/30 hover:bg-red-200'
                  : 'dark:bg-indigo-500/20 bg-indigo-100 dark:text-indigo-300 text-indigo-600 dark:hover:bg-indigo-500/30 hover:bg-indigo-200'
              }`}
            >
              {hasMetadata ? 'Regenerate Descriptions' : 'Generate Descriptions'}
            </button>
            {hasMetadata && (
              <>
                <button
                  onClick={handleEditCatalog}
                  className="text-[10px] px-2 py-0.5 rounded dark:bg-indigo-500/20 bg-indigo-100 dark:text-indigo-300 text-indigo-600 dark:hover:bg-indigo-500/30 hover:bg-indigo-200 transition-colors cursor-pointer"
                  title="Edit catalogue in YAML editor"
                >
                  Edit Catalogue
                </button>
                <button
                  onClick={handleDownloadCatalog}
                  className="text-[10px] px-1.5 py-0.5 rounded dark:bg-indigo-500/20 bg-indigo-100 dark:text-indigo-300 text-indigo-600 dark:hover:bg-indigo-500/30 hover:bg-indigo-200 transition-colors cursor-pointer"
                  title="Download catalogue as YAML"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                    <path d="M8.75 2.75a.75.75 0 0 0-1.5 0v5.69L5.03 6.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 8.44V2.75Z" />
                    <path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z" />
                  </svg>
                </button>
              </>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-[10px] px-1.5 py-0.5 rounded dark:bg-indigo-500/20 bg-indigo-100 dark:text-indigo-300 text-indigo-600 dark:hover:bg-indigo-500/30 hover:bg-indigo-200 transition-colors cursor-pointer"
              title="Upload catalogue YAML"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                <path d="M7.25 10.25a.75.75 0 0 0 1.5 0V4.56l2.22 2.22a.75.75 0 1 0 1.06-1.06l-3.5-3.5a.75.75 0 0 0-1.06 0l-3.5 3.5a.75.75 0 0 0 1.06 1.06l2.22-2.22v5.69Z" />
                <path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".yaml,.yml"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUploadCatalog(file);
              }}
            />
          </div>
        </div>
      )}

      {/* Catalog generation progress */}
      {catalogGenerating && catalogProgress && (
        <div className="mx-2 px-2 py-1.5 rounded-md dark:bg-[#1a1a1a] bg-gray-50 border dark:border-[#333] border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] dark:text-gray-400 text-gray-500">
              Cataloging {catalogProgress.completed} / {catalogProgress.total} tables...
            </p>
            <button
              onClick={handleStopCatalog}
              className="text-[10px] px-1.5 py-0.5 rounded dark:bg-red-500/20 bg-red-100 dark:text-red-400 text-red-600 dark:hover:bg-red-500/30 hover:bg-red-200 transition-colors cursor-pointer"
            >
              Stop
            </button>
          </div>
          <div className="w-full h-1 rounded-full dark:bg-[#333] bg-gray-200 overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-300"
              style={{ width: `${(catalogProgress.completed / catalogProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Table list */}
      <div className="space-y-0.5 max-h-[300px] overflow-y-auto">
        {filteredTables.map(table => (
          <div key={table.name} className="group/row">
            <div className="flex items-center">
              <button
                onClick={() => setExpandedTable(expandedTable === table.name ? null : table.name)}
                className="flex items-center gap-1.5 flex-1 min-w-0 px-2 py-1 text-xs rounded-md dark:hover:bg-[#1e1f20] hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-2.5 h-2.5 dark:text-gray-500 text-gray-400 transition-transform flex-shrink-0 ${expandedTable === table.name ? 'rotate-90' : ''}`}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 text-indigo-400 flex-shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125" />
                </svg>
                <span className="dark:text-gray-300 text-gray-600 truncate">{table.name}</span>
                <span className="text-[10px] dark:text-gray-600 text-gray-400 ml-auto flex-shrink-0">{table.columns.length}</span>
              </button>
              {onQueryTable && (
                <button
                  onClick={(e) => { e.stopPropagation(); onQueryTable(table.name); }}
                  className="opacity-0 group-hover/row:opacity-100 p-1 mr-1 rounded dark:hover:bg-emerald-500/15 hover:bg-emerald-50 dark:text-gray-500 dark:hover:text-emerald-400 text-gray-400 hover:text-emerald-600 transition-all cursor-pointer flex-shrink-0"
                  title={`Query ${table.name}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                    <path d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.344-5.891a1.5 1.5 0 0 0 0-2.538L6.3 2.841Z" />
                  </svg>
                </button>
              )}
            </div>

            {/* Description + tags under table name (when not expanded) */}
            {table.description && expandedTable !== table.name && (
              <div className="ml-7 px-2 -mt-0.5 mb-0.5">
                <p className="text-[10px] dark:text-gray-500 text-gray-400 truncate">{table.description}</p>
              </div>
            )}

            {expandedTable === table.name && (
              <div className="ml-5 space-y-0.5 mt-0.5">
                {/* Description with edit */}
                <div className="px-2 py-0.5">
                  {editingDescription === table.name ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveDescription(table.name);
                          if (e.key === 'Escape') setEditingDescription(null);
                        }}
                        className="flex-1 text-[10px] px-1 py-0.5 rounded dark:bg-[#1a1a1a] bg-white border dark:border-[#444] border-gray-300 dark:text-gray-300 text-gray-600 focus:outline-none focus:border-indigo-500/50"
                        autoFocus
                        placeholder="Add a description..."
                      />
                      <button onClick={() => handleSaveDescription(table.name)} className="text-[10px] dark:text-indigo-400 text-indigo-500 cursor-pointer">Save</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 group/desc">
                      <p className="text-[10px] dark:text-gray-500 text-gray-400 truncate flex-1">
                        {table.description || 'No description'}
                      </p>
                      {metadata.find(m => m.table_name.toLowerCase() === table.name.toLowerCase()) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const meta = metadata.find(m => m.table_name.toLowerCase() === table.name.toLowerCase());
                            setEditValue(meta?.user_description || meta?.auto_description || '');
                            setEditingDescription(table.name);
                          }}
                          className="opacity-0 group-hover/desc:opacity-100 transition-opacity cursor-pointer"
                          title="Edit description"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5 dark:text-gray-500 text-gray-400">
                            <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.262a1.75 1.75 0 0 0 0-2.474Z" />
                            <path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V9A.75.75 0 0 1 14 9v2.25A2.75 2.75 0 0 1 11.25 14h-6.5A2.75 2.75 0 0 1 2 11.25v-6.5A2.75 2.75 0 0 1 4.75 2H7a.75.75 0 0 1 0 1.5H4.75Z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Tags */}
                  {table.tags && table.tags.length > 0 && (
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      {table.tags.map((tag) => (
                        <span key={tag} className={`text-[9px] px-1 py-px rounded ${getTagColor(tag)}`}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Columns */}
                {table.columns.map(col => (
                  <button
                    key={col.name}
                    onClick={() => onInsertColumn?.(`"${table.name}"."${col.name}"`)}
                    className="flex items-center gap-1.5 w-full px-2 py-0.5 text-[11px] rounded dark:hover:bg-indigo-500/10 hover:bg-indigo-50 transition-colors cursor-pointer group"
                    title={`Click to insert "${table.name}"."${col.name}"`}
                  >
                    {col.isPrimaryKey ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5 text-amber-400 flex-shrink-0">
                        <path fillRule="evenodd" d="M8 1a3.5 3.5 0 0 0-3.5 3.5c0 .539.122 1.049.34 1.505L1.22 9.625a.75.75 0 0 0-.22.53v2.095a.75.75 0 0 0 .75.75h1.5a.75.75 0 0 0 .75-.75v-.5h.5a.75.75 0 0 0 .75-.75v-.5h.5a.75.75 0 0 0 .53-.22l.66-.66A3.5 3.5 0 1 0 8 1Zm1.5 3.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" clipRule="evenodd" />
                      </svg>
                    ) : col.isForeignKey ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5 text-blue-400 flex-shrink-0">
                        <path fillRule="evenodd" d="M8.914 6.025a.75.75 0 0 1 1.06 0 3.5 3.5 0 0 1 0 4.95l-2 2a3.5 3.5 0 0 1-5.396-4.402.75.75 0 0 1 1.251.827 2 2 0 0 0 3.085 2.514l2-2a2 2 0 0 0 0-2.828.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                        <path fillRule="evenodd" d="M7.086 9.975a.75.75 0 0 1-1.06 0 3.5 3.5 0 0 1 0-4.95l2-2a3.5 3.5 0 0 1 5.396 4.402.75.75 0 0 1-1.251-.827 2 2 0 0 0-3.085-2.514l-2 2a2 2 0 0 0 0 2.828.75.75 0 0 1 0 1.06Z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <div className="w-2.5 h-2.5 flex-shrink-0" />
                    )}
                    <span className="dark:text-gray-400 text-gray-500 group-hover:dark:text-gray-200 group-hover:text-gray-800 truncate">{col.name}</span>
                    <span className="text-[10px] dark:text-gray-600 text-gray-400 ml-auto font-mono">{col.type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
