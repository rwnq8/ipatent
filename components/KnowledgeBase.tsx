import React, { useState, useMemo } from 'react';
import { KnowledgeBaseEntry } from '../types';
import { TrashIcon, FileTextIcon, DownloadIcon, UploadIcon } from './icons';
import { ACCEPTED_FILE_TYPES } from '../constants';
import { Spinner } from './Spinner';

interface KnowledgeBaseProps {
  ownedEntries: KnowledgeBaseEntry[];
  discoveredEntries: KnowledgeBaseEntry[];
  onBuildFromFiles: (files: File[]) => void;
  onRemoveEntry: (id: string) => void;
  onExport: () => void;
  onImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
  disabled: boolean;
  isBuilding: boolean;
}

interface BuildKnowledgeBaseFormProps {
  onBuild: (files: File[]) => void;
  isBuilding: boolean;
}

function BuildKnowledgeBaseForm({ onBuild, isBuilding }: BuildKnowledgeBaseFormProps) {
  const [tempFiles, setTempFiles] = useState<File[]>([]);
  const acceptedTypesString = Object.values(ACCEPTED_FILE_TYPES).flat().join(',');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    // Prevent duplicates
    const newFiles = files.filter(f1 => !tempFiles.some(f2 => f1.name === f2.name && f1.size === f2.size));
    setTempFiles(prev => [...prev, ...newFiles]);
    e.target.value = ''; // Allow re-upload
  };

  const handleBuildClick = () => {
    if (tempFiles.length === 0) return;
    onBuild(tempFiles);
    setTempFiles([]); // Clear after starting build
  };
  
  const handleRemoveFile = (fileName: string) => {
    setTempFiles(files => files.filter(file => file.name !== fileName));
  };


  if (isBuilding) {
    return <div className="p-4"><Spinner message="AI is structuring your portfolio... This may take a moment." /></div>;
  }
  
  return (
    <div className="p-4 border border-slate-200 rounded-md bg-slate-50 space-y-4 mb-6">
      <h3 className="text-lg font-medium text-slate-800">Build Your Portfolio from Files</h3>
      <p className="text-sm text-slate-600">Upload all your existing application files (.txt, .pdf, .docx). The AI will analyze them, group them into distinct applications, and structure them into a knowledge base automatically.</p>
      <div>
        <label htmlFor="kb-file-upload-input" className="block text-sm font-medium text-slate-700">
          Upload Portfolio Files
        </label>
        <input
          id="kb-file-upload-input"
          type="file"
          multiple
          accept={acceptedTypesString}
          onChange={handleFileChange}
          className="mt-1 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
        />
      </div>
      {tempFiles.length > 0 && (
          <div className="mt-2">
              <h4 className="text-sm font-medium text-slate-700">Files to process:</h4>
              <ul role="list" className="mt-1 border border-slate-200 rounded-md divide-y divide-slate-200 bg-white">
                {tempFiles.map(file => (
                  <li key={`${file.name}-${file.size}`} className="pl-3 pr-4 py-2 flex items-center justify-between text-sm">
                    <div className="w-0 flex-1 flex items-center">
                      <FileTextIcon className="flex-shrink-0 h-5 w-5 text-slate-400" aria-hidden="true" />
                      <span className="ml-2 flex-1 w-0 truncate text-slate-700">{file.name}</span>
                    </div>
                    <div className="ml-4 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(file.name)}
                        className="font-medium text-red-600 hover:text-red-500"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
          </div>
        )}
      <div className="mt-4 flex justify-end gap-3">
        <button type="button" onClick={handleBuildClick} disabled={tempFiles.length === 0 || isBuilding} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-slate-400">
            Build Knowledge Base with AI
        </button>
      </div>
    </div>
  );
}

interface EntryDisplayProps {
    entry: KnowledgeBaseEntry;
    onRemoveEntry: (id: string) => void;
    disabled: boolean;
    level: number;
}

function EntryDisplay({ entry, onRemoveEntry, disabled, level }: EntryDisplayProps) {
  return (
    <details className={`p-4 rounded-lg shadow-sm border ${level > 0 ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-200'}`} open={!entry.isOwner}>
      <summary className="font-medium text-slate-800 cursor-pointer flex justify-between items-center">
        <div>
          <span className={entry.isOwner ? "text-indigo-700" : "text-slate-700"}>{entry.title}</span>
          <span className="ml-4 text-sm text-slate-500">({entry.applicationNumber || 'N/A'})</span>
        </div>
        {entry.isOwner && (
            <button
              onClick={(e) => { e.preventDefault(); onRemoveEntry(entry.id); }}
              disabled={disabled}
              className="p-1 text-red-500 hover:text-red-700 disabled:text-slate-400"
              aria-label={`Remove ${entry.title}`}
            >
              <TrashIcon className="w-5 h-5" />
            </button>
        )}
      </summary>
      <div className="mt-4 pt-4 border-t border-slate-200 text-sm text-slate-600 space-y-3">
        <p><strong>Type:</strong> <span className="font-mono bg-slate-200 px-1 rounded">{entry.type}</span></p>
        <p><strong>Filing Date:</strong> {entry.filingDate || 'N/A'}</p>
        {entry.isOwner && <p><strong>Claims Priority To:</strong> {entry.priorityTo || 'N/A'}</p>}
        <div><strong>Notes:</strong><pre className="whitespace-pre-wrap font-sans bg-white p-2 border rounded-md mt-1">{entry.notes || 'N/A'}</pre></div>
        <div>
          <strong>Source Files ({entry.files.length}):</strong>
          <ul className="list-disc list-inside mt-1">
            {entry.files.map(f => <li key={f.name} className="flex items-center"><FileTextIcon className="w-4 h-4 mr-2 text-slate-400" />{f.name}</li>)}
          </ul>
        </div>
         {entry.extractedClaims.length > 0 && <div><strong>Extracted Claims ({entry.extractedClaims.length}):</strong>
          <div className="whitespace-pre-wrap font-sans bg-white p-2 border rounded-md mt-1 max-h-60 overflow-y-auto">
            <ol className="list-decimal list-inside space-y-2">
                {entry.extractedClaims.map((claim, i) => <li key={i}>{claim}</li>)}
            </ol>
          </div>
        </div>}
      </div>
    </details>
  );
}

type HierarchicalEntry = KnowledgeBaseEntry & { children: HierarchicalEntry[], level: number };

interface RecursiveEntryRendererProps {
    entries: HierarchicalEntry[];
    onRemoveEntry: (id: string) => void;
    disabled: boolean;
};

function RecursiveEntryRenderer({ entries, onRemoveEntry, disabled }: RecursiveEntryRendererProps) {
    return (
        <div className="space-y-2">
            {entries.map(entry => (
                <div key={entry.id}>
                    <EntryDisplay entry={entry} onRemoveEntry={onRemoveEntry} disabled={disabled} level={entry.level} />
                    {entry.children.length > 0 && (
                        <div className="mt-2 pl-4 ml-4 border-l-2 border-indigo-200">
                            <RecursiveEntryRenderer entries={entry.children} onRemoveEntry={onRemoveEntry} disabled={disabled} />
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

export function KnowledgeBase({ ownedEntries, discoveredEntries, onBuildFromFiles, onRemoveEntry, onExport, onImport, disabled, isBuilding }: KnowledgeBaseProps) {
  const [isFormVisible, setIsFormVisible] = useState(false);

  const hierarchicalOwnedEntries = useMemo((): HierarchicalEntry[] => {
      const entryMap: Map<string, HierarchicalEntry> = new Map(
          ownedEntries.map(e => [e.id, { ...e, children: [], level: 0 }])
      );
      const roots: HierarchicalEntry[] = [];

      for (const entry of entryMap.values()) {
          if (entry.priorityTo && entryMap.has(entry.priorityTo)) {
              const parent = entryMap.get(entry.priorityTo)!;
              entry.level = parent.level + 1;
              parent.children.push(entry);
          } else {
              roots.push(entry);
          }
      }
      
      const sortByDate = (a: { filingDate: string }, b: { filingDate: string }) => new Date(a.filingDate).getTime() - new Date(b.filingDate).getTime();
      roots.sort(sortByDate);
      entryMap.forEach(entry => {
        if(entry.children.length > 1) {
          entry.children.sort(sortByDate);
        }
      });
      
      return roots;
  }, [ownedEntries]);
  
  return (
    <div className="bg-white p-6 rounded-lg shadow-lg mt-8">
      <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-200">
        <h2 className="text-xl font-semibold text-slate-700">Portfolio Knowledge Base</h2>
        <div className="flex items-center gap-2">
            <button onClick={() => setIsFormVisible(!isFormVisible)} disabled={disabled} className="px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-slate-400">
              {isFormVisible ? 'Cancel Build' : '+ Build from Files'}
            </button>
            <button onClick={onExport} disabled={disabled || ownedEntries.length === 0} className="p-1.5 border rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50" title="Export My Portfolio to JSON">
              <DownloadIcon className="h-4 w-4" />
            </button>
            <label
              htmlFor="kb-import-input"
              className={`p-1.5 border rounded-md shadow-sm text-slate-700 bg-white ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50 cursor-pointer'}`}
              title="Import My Portfolio from JSON"
            >
              <UploadIcon className="h-4 w-4" />
            </label>
            <input
              id="kb-import-input"
              type="file"
              onChange={onImport}
              accept=".json"
              className="hidden"
              disabled={disabled}
            />
        </div>
      </div>
      
      {isFormVisible && (
        <BuildKnowledgeBaseForm onBuild={onBuildFromFiles} isBuilding={isBuilding} />
      )}
      
      {/* Owned Portfolio Section */}
      <div className="mb-6">
        <h3 className="text-lg font-medium text-slate-800 mb-2">My Portfolio ({ownedEntries.length})</h3>
        <p className="text-sm text-slate-500 mb-4">Your persistent portfolio of owned applications. Use the buttons above to build, import, or export.</p>
        <div className="space-y-2">
            {hierarchicalOwnedEntries.length > 0 ? (
                <RecursiveEntryRenderer entries={hierarchicalOwnedEntries} onRemoveEntry={onRemoveEntry} disabled={disabled} />
            ) : (
                !isBuilding && <p className="text-center text-slate-500 py-4">No portfolio entries found. Click "Build from Files" to start.</p>
            )}
        </div>
      </div>
      
      {/* Discovered Prior Art Section */}
      {discoveredEntries.length > 0 && (
         <div className="mt-8 pt-6 border-t border-dashed border-slate-300">
            <h3 className="text-lg font-medium text-slate-800 mb-2">Discovered Prior Art ({discoveredEntries.length})</h3>
            <p className="text-sm text-slate-500 mb-4">Read-only list of prior art found during the last analysis. This list is temporary and will be replaced with each new analysis.</p>
            <div className="space-y-2">
                {discoveredEntries.map(entry => (
                    <EntryDisplay key={entry.id} entry={entry} onRemoveEntry={onRemoveEntry} disabled={disabled} level={0} />
                ))}
            </div>
        </div>
      )}
    </div>
  );
}