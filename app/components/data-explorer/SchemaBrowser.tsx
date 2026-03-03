'use client';

import { useState, useEffect } from 'react';

interface Column {
  name: string;
  type: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
}

interface Table {
  name: string;
  columns: Column[];
}

interface SchemaBrowserProps {
  connectionId: string;
  onInsertColumn?: (text: string) => void;
}

export default function SchemaBrowser({ connectionId, onInsertColumn }: SchemaBrowserProps) {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedTable, setExpandedTable] = useState<string | null>(null);

  useEffect(() => {
    if (!connectionId) return;
    setLoading(true);
    fetch(`/api/data-explorer/schema?connectionId=${connectionId}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setTables(data.map((t: any) => ({
            name: t.tableName || t.name,
            columns: (t.columns || []).map((c: any) => ({
              name: c.columnName || c.name,
              type: c.dataType || c.type || '',
              isPrimaryKey: c.isPrimaryKey || false,
              isForeignKey: c.isForeignKey || false,
            })),
          })));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [connectionId]);

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

  return (
    <div className="space-y-0.5 max-h-[300px] overflow-y-auto">
      {tables.map(table => (
        <div key={table.name}>
          <button
            onClick={() => setExpandedTable(expandedTable === table.name ? null : table.name)}
            className="flex items-center gap-1.5 w-full px-2 py-1 text-xs rounded-md dark:hover:bg-[#1e1f20] hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-2.5 h-2.5 dark:text-gray-500 text-gray-400 transition-transform flex-shrink-0 ${expandedTable === table.name ? 'rotate-90' : ''}`}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 text-indigo-400 flex-shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125" />
            </svg>
            <span className="dark:text-gray-300 text-gray-600 truncate">{table.name}</span>
            <span className="text-[10px] dark:text-gray-600 text-gray-400 ml-auto">{table.columns.length}</span>
          </button>

          {expandedTable === table.name && (
            <div className="ml-5 space-y-0.5 mt-0.5">
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
  );
}
