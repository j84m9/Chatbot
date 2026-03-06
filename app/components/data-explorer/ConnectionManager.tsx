'use client';

import { useState } from 'react';

interface ConnectionManagerProps {
  connections: any[];
  activeConnectionId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onSave: (connection: any) => void;
  onClose: () => void;
}

export default function ConnectionManager({
  connections, activeConnectionId, onSelect, onDelete, onSave, onClose,
}: ConnectionManagerProps) {
  const [mode, setMode] = useState<'list' | 'add'>(connections.length === 0 ? 'add' : 'list');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-backdrop-in">
      <div className="w-full max-w-lg dark:bg-[#1a1b1c] bg-white border dark:border-[#2a2b2d] border-gray-200 rounded-2xl shadow-2xl overflow-hidden animate-modal-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-[#2a2b2d] border-gray-200">
          <h2 className="text-lg font-semibold dark:text-gray-100 text-gray-800">
            {mode === 'list' ? 'Connections' : 'Add Connection'}
          </h2>
          <div className="flex items-center gap-2">
            {mode === 'add' && connections.length > 0 && (
              <button
                onClick={() => setMode('list')}
                className="text-xs px-3 py-1.5 rounded-lg dark:text-gray-400 text-gray-500 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 transition-colors cursor-pointer"
              >
                Back
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg dark:hover:bg-[#2a2b2d] hover:bg-gray-100 dark:text-gray-400 text-gray-500 transition-colors cursor-pointer">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {mode === 'list' ? (
          <ConnectionList
            connections={connections}
            activeConnectionId={activeConnectionId}
            onSelect={(id) => { onSelect(id); onClose(); }}
            onDelete={onDelete}
            onAdd={() => setMode('add')}
          />
        ) : (
          <AddConnectionForm
            onSave={(conn) => { onSave(conn); setMode('list'); }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Connection List ─────────────────────────────────────────────────

function ConnectionList({
  connections, activeConnectionId, onSelect, onDelete, onAdd,
}: {
  connections: any[];
  activeConnectionId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/data-explorer/connections?id=${id}`, { method: 'DELETE' });
      if (res.ok) onDelete(id);
    } finally {
      setDeleting(false);
      setConfirmDeleteId(null);
    }
  };

  return (
    <>
      <div className="px-4 py-3 max-h-[50vh] overflow-y-auto">
        {connections.length === 0 ? (
          <p className="text-sm dark:text-gray-500 text-gray-400 text-center py-6">No connections yet</p>
        ) : (
          <div className="space-y-1">
            {connections.map(c => {
              const isActive = c.id === activeConnectionId;
              const isSqlite = c.db_type === 'sqlite';
              const subtitle = isSqlite
                ? c.file_path
                : [c.server, c.database_name !== 'default' ? c.database_name : null].filter(Boolean).join(' / ');

              return (
                <div
                  key={c.id}
                  className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    isActive
                      ? 'dark:bg-indigo-500/[0.08] bg-indigo-50 border border-indigo-500/20'
                      : 'dark:hover:bg-[#1e1f20] hover:bg-gray-50 border border-transparent'
                  }`}
                >
                  {/* Status dot */}
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    isActive ? 'bg-emerald-400 shadow-md shadow-emerald-400/50' : 'dark:bg-gray-600 bg-gray-300'
                  }`} />

                  {/* Connection info — clickable to select */}
                  <button
                    onClick={() => onSelect(c.id)}
                    className="flex-1 text-left min-w-0 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium truncate ${
                        isActive ? 'dark:text-indigo-300 text-indigo-600' : 'dark:text-gray-200 text-gray-700'
                      }`}>
                        {c.name}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        isSqlite
                          ? 'dark:bg-amber-500/10 bg-amber-50 dark:text-amber-400 text-amber-600'
                          : 'dark:bg-blue-500/10 bg-blue-50 dark:text-blue-400 text-blue-600'
                      }`}>
                        {isSqlite ? 'SQLite' : 'MSSQL'}
                      </span>
                    </div>
                    <p className="text-xs dark:text-gray-500 text-gray-400 truncate mt-0.5">{subtitle}</p>
                  </button>

                  {/* Delete */}
                  {confirmDeleteId === c.id ? (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleDelete(c.id)}
                        disabled={deleting}
                        className="text-[11px] px-2 py-1 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {deleting ? '...' : 'Delete'}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-[11px] px-2 py-1 rounded-md dark:text-gray-500 text-gray-400 dark:hover:bg-[#2a2b2d] hover:bg-gray-200 transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(c.id)}
                      className="p-1 rounded-md opacity-0 group-hover:opacity-100 dark:text-gray-500 text-gray-400 dark:hover:text-red-400 hover:text-red-500 hover:bg-red-500/10 transition-all cursor-pointer flex-shrink-0"
                      title="Delete connection"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.519.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 1 .7.798l-.35 5.25a.75.75 0 0 1-1.497-.1l.35-5.25a.75.75 0 0 1 .797-.699Zm2.84 0a.75.75 0 0 1 .798.699l.35 5.25a.75.75 0 0 1-1.498.1l-.35-5.25a.75.75 0 0 1 .7-.798Z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t dark:border-[#2a2b2d] border-gray-200">
        <button
          onClick={onAdd}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Connection
        </button>
      </div>
    </>
  );
}

// ─── Add Connection Form ─────────────────────────────────────────────

function AddConnectionForm({ onSave }: { onSave: (conn: any) => void }) {
  const [dbType, setDbType] = useState<'mssql' | 'sqlite'>('mssql');
  const [name, setName] = useState('');
  const [server, setServer] = useState('');
  const [database, setDatabase] = useState('');
  const [authType, setAuthType] = useState<'sql' | 'windows'>('sql');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [domain, setDomain] = useState('');
  const [encrypt, setEncrypt] = useState(true);
  const [trustCert, setTrustCert] = useState(true);
  const [filePath, setFilePath] = useState('');

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; version?: string; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const connectionPayload = dbType === 'sqlite'
    ? { dbType, name: name || filePath || 'SQLite DB', filePath }
    : {
        dbType, name: name || server || 'Connection', server, database,
        authType, username, password,
        ...(authType === 'windows' ? { domain } : {}),
        encrypt, trustServerCertificate: trustCert,
      };

  const canTest = dbType === 'sqlite'
    ? !!filePath
    : (!!server && !!username && !!password);
  const canSave = dbType === 'sqlite'
    ? !!filePath
    : (!!server && !!username && !!password);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/data-explorer/connections/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(connectionPayload),
      });
      if (!res.ok) {
        setTestResult({ success: false, error: `Server error (${res.status})` });
        return;
      }
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({ success: false, error: err.message || 'Network error — request may have timed out' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/data-explorer/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(connectionPayload),
      });
      if (res.ok) {
        const data = await res.json();
        onSave(data);
      }
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full text-sm dark:bg-[#111213] bg-gray-50 dark:text-gray-200 text-gray-800 border dark:border-[#2a2b2d] border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-colors";

  return (
    <>
      <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
        <div>
          <label className="text-xs font-medium dark:text-gray-400 text-gray-500 mb-1 block">Database Type</label>
          <select
            value={dbType}
            onChange={e => { setDbType(e.target.value as 'mssql' | 'sqlite'); setTestResult(null); }}
            className={inputClass + ' cursor-pointer'}
          >
            <option value="mssql">SQL Server (MSSQL)</option>
            <option value="sqlite">SQLite</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-medium dark:text-gray-400 text-gray-500 mb-1 block">
            Connection Name <span className="opacity-60 font-normal">(optional)</span>
          </label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={dbType === 'sqlite' ? 'Demo DB' : server || 'My Database'} className={inputClass} />
        </div>

        {dbType === 'sqlite' ? (
          <div>
            <label className="text-xs font-medium dark:text-gray-400 text-gray-500 mb-1 block">Database File Path</label>
            <input value={filePath} onChange={e => setFilePath(e.target.value)} placeholder="./data/demo.db" className={inputClass} />
            <p className="text-xs dark:text-gray-500 text-gray-400 mt-1">Path to the SQLite database file on the server</p>
          </div>
        ) : (
          <>
            <div>
              <label className="text-xs font-medium dark:text-gray-400 text-gray-500 mb-1 block">Server</label>
              <input value={server} onChange={e => setServer(e.target.value)} placeholder="localhost" className={inputClass} />
              <p className="text-xs dark:text-gray-500 text-gray-400 mt-1">
                e.g. localhost, server\instance, or server,port
              </p>
            </div>

            <div>
              <label className="text-xs font-medium dark:text-gray-400 text-gray-500 mb-1 block">
                Database <span className="opacity-60 font-normal">(optional)</span>
              </label>
              <input value={database} onChange={e => setDatabase(e.target.value)} placeholder="Default" className={inputClass} />
            </div>

            <div>
              <label className="text-xs font-medium dark:text-gray-400 text-gray-500 mb-1 block">Authentication Type</label>
              <select value={authType} onChange={e => setAuthType(e.target.value as 'sql' | 'windows')} className={inputClass + ' cursor-pointer'}>
                <option value="sql">SQL Login</option>
                <option value="windows">Windows Authentication</option>
              </select>
            </div>

            {authType === 'windows' && (
              <div>
                <label className="text-xs font-medium dark:text-gray-400 text-gray-500 mb-1 block">
                  Domain <span className="opacity-60 font-normal">(optional)</span>
                </label>
                <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="MYDOMAIN" className={inputClass} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium dark:text-gray-400 text-gray-500 mb-1 block">
                  {authType === 'windows' ? 'Windows User Name' : 'User Name'}
                </label>
                <input value={username} onChange={e => setUsername(e.target.value)} placeholder={authType === 'windows' ? 'jsmith' : 'sa'} className={inputClass} />
              </div>
              <div>
                <label className="text-xs font-medium dark:text-gray-400 text-gray-500 mb-1 block">Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="********" className={inputClass} />
              </div>
            </div>

            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm dark:text-gray-300 text-gray-600 cursor-pointer">
                <input type="checkbox" checked={encrypt} onChange={e => setEncrypt(e.target.checked)} className="rounded" />
                Encrypt
              </label>
              <label className="flex items-center gap-2 text-sm dark:text-gray-300 text-gray-600 cursor-pointer">
                <input type="checkbox" checked={trustCert} onChange={e => setTrustCert(e.target.checked)} className="rounded" />
                Trust Server Certificate
              </label>
            </div>
          </>
        )}

        {/* Test result */}
        {testResult && (
          <div className={`text-sm px-4 py-3 rounded-lg border ${
            testResult.success
              ? 'bg-emerald-500/10 border-emerald-500/20 dark:text-emerald-400 text-emerald-600'
              : 'bg-red-500/10 border-red-500/20 dark:text-red-400 text-red-600'
          }`}>
            {testResult.success
              ? `Connected successfully. ${testResult.version || ''}`
              : `Connection failed: ${testResult.error}`
            }
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t dark:border-[#2a2b2d] border-gray-200">
        <button
          onClick={handleTest}
          disabled={!canTest || testing}
          className="px-4 py-2 text-sm font-medium dark:text-gray-300 text-gray-600 dark:hover:bg-[#2a2b2d] hover:bg-gray-100 rounded-lg disabled:opacity-40 transition-colors cursor-pointer border dark:border-[#2a2b2d] border-gray-200"
        >
          {testing ? 'Testing...' : 'Test Connection'}
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg disabled:opacity-40 transition-colors cursor-pointer"
        >
          {saving ? 'Saving...' : 'Save Connection'}
        </button>
      </div>
    </>
  );
}
