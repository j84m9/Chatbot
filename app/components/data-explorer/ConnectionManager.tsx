'use client';

import { useState } from 'react';

interface ConnectionManagerProps {
  onSave: (connection: any) => void;
  onClose: () => void;
}

export default function ConnectionManager({ onSave, onClose }: ConnectionManagerProps) {
  const [dbType, setDbType] = useState<'mssql' | 'sqlite'>('mssql');
  const [name, setName] = useState('');
  const [server, setServer] = useState('');
  const [database, setDatabase] = useState('');
  const [authType, setAuthType] = useState<'sql' | 'windows'>('sql');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [encrypt, setEncrypt] = useState(true);
  const [trustCert, setTrustCert] = useState(false);
  const [filePath, setFilePath] = useState('');

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; version?: string; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const connectionPayload = dbType === 'sqlite'
    ? { dbType, name, filePath }
    : {
        dbType, name, server, database,
        authType,
        ...(authType === 'sql' ? { username, password } : {}),
        encrypt, trustServerCertificate: trustCert,
      };

  const canTest = dbType === 'sqlite'
    ? !!filePath
    : (!!server && !!database && (authType === 'windows' || (!!username && !!password)));
  const canSave = dbType === 'sqlite'
    ? (!!name && !!filePath)
    : (!!name && !!server && !!database && (authType === 'windows' || (!!username && !!password)));

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/data-explorer/connections/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(connectionPayload),
      });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ success: false, error: 'Network error' });
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-backdrop-in">
      <div className="w-full max-w-lg dark:bg-[#1a1b1c] bg-white border dark:border-[#2a2b2d] border-gray-200 rounded-2xl shadow-2xl overflow-hidden animate-modal-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-[#2a2b2d] border-gray-200">
          <h2 className="text-lg font-semibold dark:text-gray-100 text-gray-800">Add Database Connection</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg dark:hover:bg-[#2a2b2d] hover:bg-gray-100 dark:text-gray-400 text-gray-500 transition-colors cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
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
            <label className="text-xs font-medium dark:text-gray-400 text-gray-500 mb-1 block">Connection Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder={dbType === 'sqlite' ? 'Demo DB' : 'My Database'} className={inputClass} />
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
                <label className="text-xs font-medium dark:text-gray-400 text-gray-500 mb-1 block">Database</label>
                <input value={database} onChange={e => setDatabase(e.target.value)} placeholder="MyDatabase" className={inputClass} />
              </div>

              <div>
                <label className="text-xs font-medium dark:text-gray-400 text-gray-500 mb-1 block">Authentication Type</label>
                <select value={authType} onChange={e => setAuthType(e.target.value as 'sql' | 'windows')} className={inputClass + ' cursor-pointer'}>
                  <option value="sql">SQL Login</option>
                  <option value="windows">Windows Authentication</option>
                </select>
              </div>

              {authType === 'sql' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium dark:text-gray-400 text-gray-500 mb-1 block">User Name</label>
                    <input value={username} onChange={e => setUsername(e.target.value)} placeholder="sa" className={inputClass} />
                  </div>
                  <div>
                    <label className="text-xs font-medium dark:text-gray-400 text-gray-500 mb-1 block">Password</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="********" className={inputClass} />
                  </div>
                </div>
              )}

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
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-red-500/10 border-red-500/20 text-red-400'
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
      </div>
    </div>
  );
}
