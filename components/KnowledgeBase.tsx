

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { KnowledgeBaseEntry } from '../types';
import { TrashIcon, FileTextIcon, DownloadIcon, UploadIcon, PinIcon, PencilIcon, ExclamationTriangleIcon } from './icons';
import { KnowledgeBaseEntryForm } from './KnowledgeBaseEntryForm';

interface KnowledgeBaseProps {
  ownedEntries: KnowledgeBaseEntry[];
  pinnedIdeas: KnowledgeBaseEntry[];
  discoveredEntries: KnowledgeBaseEntry[];
  onRemoveEntry: (id: string) => void;
  onUpdateEntry: (entryData: KnowledgeBaseEntry) => void;
  onExport: () => void;
  onImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onPinEntry: (id: string) => void;
  onRemovePinnedIdea: (id: string) => void;
  onUpdatePinnedIdea: (entryData: KnowledgeBaseEntry) => void;
  onExportPinnedIdeas: () => void;
  onImportPinnedIdeas: (event: React.ChangeEvent<HTMLInputElement>) => void;
  disabled: boolean;
}

interface EntryDisplayProps {
    entry: KnowledgeBaseEntry;
    onRemoveEntry: (id: string) => void;
    onEditEntry: (entry: KnowledgeBaseEntry) => void;
    onPinEntry?: (id: string) => void;
    disabled: boolean;
    level: number;
    isPinnedIdea?: boolean;
}

function EntryDisplay({ entry, onRemoveEntry, onEditEntry, onPinEntry, disabled, level, isPinnedIdea = false }: EntryDisplayProps) {
  const files = entry.files || [];
  const claims = entry.extractedClaims || [];
  const embodiments = entry.extractedEmbodiments || [];
  const titleColor = isPinnedIdea ? 'text-cyan-700' : (entry.isOwner ? "text-indigo-700" : "text-slate-700");

  return (
    <details className={`p-4 rounded-lg shadow-sm border ${level > 0 ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-200'}`} open={!entry.isOwner && !isPinnedIdea}>
      <summary className="font-medium text-slate-800 cursor-pointer flex justify-between items-center gap-2">
        <div className="flex-grow">
          <span className={titleColor}>{entry.title}</span>
          <span className="ml-4 text-sm text-slate-500">({entry.applicationNumber || 'N/A'})</span>
        </div>
        <div className="flex-shrink-0 flex items-center gap-2">
        {entry.isOwner ? (
            <>
              <button
                onClick={(e) => { e.preventDefault(); onEditEntry(entry); }}
                disabled={disabled}
                className="p-1 text-blue-600 hover:text-blue-800 disabled:text-slate-400"
                aria-label={`Edit ${entry.title}`}
                title={`Edit ${entry.title}`}
              >
                  <PencilIcon className="w-5 h-5"/>
              </button>
              <button
                onClick={(e) => { e.preventDefault(); onRemoveEntry(entry.id); }}
                disabled={disabled}
                className="p-1 text-red-500 hover:text-red-700 disabled:text-slate-400"
                aria-label={`Remove ${entry.title}`}
                title={`Remove ${entry.title}`}
              >
                <TrashIcon className="w-5 h-5" />
              </button>
            </>
        ) : (
           onPinEntry && (
              <button
                onClick={(e) => { e.preventDefault(); onPinEntry(entry.id); }}
                disabled={disabled}
                className="p-1 text-teal-600 hover:text-teal-800 disabled:text-slate-400"
                aria-label={`Pin ${entry.title} as an idea for exploration`}
                title={`Pin ${entry.title} as an idea for exploration`}
              >
                <PinIcon className="w-5 h-5" />
              </button>
           )
        )}
        </div>
      </summary>
      <div className="mt-4 pt-4 border-t border-slate-200 text-sm text-slate-600 space-y-3">
        {entry.isOwner && !entry.isComplete && !isPinnedIdea && (
            <div className="my-2 p-3 flex items-center gap-2 bg-yellow-50 border border-yellow-300 rounded-md text-yellow-800">
                <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0" />
                <span className="text-sm">This entry appears to be incomplete. Edit to add the full specification for a more accurate analysis.</span>
            </div>
        )}
        <p><strong>Type:</strong> <span className="font-mono bg-slate-200 px-1 rounded">{entry.type}</span></p>
        <p><strong>Filing Date:</strong> {entry.filingDate || 'N/A'}</p>
        {entry.isOwner && !isPinnedIdea && <p><strong>Claims Priority To:</strong> {entry.priorityTo || 'N/A'}</p>}
        <div><strong>Notes:</strong><pre className="whitespace-pre-wrap font-sans bg-white p-2 border rounded-md mt-1">{entry.notes || 'N/A'}</pre></div>
        <div>
          <strong>Source Files ({files.length}):</strong>
          {files.length > 0 ? (
            <ul className="list-disc list-inside mt-1">
              {files.map(f => f && <li key={f.name} className="flex items-center"><FileTextIcon className="w-4 h-4 mr-2 text-slate-400" />{f.name}</li>)}
            </ul>
          ) : <p className="text-slate-500 italic mt-1">No source files for this entry.</p>}
        </div>
        {entry.type === 'non-provisional' && claims.length > 0 && <div><strong>Extracted Claims ({claims.length}):</strong>
          <div className="whitespace-pre-wrap font-sans bg-white p-2 border rounded-md mt-1 max-h-60 overflow-y-auto">
            <ol className="list-decimal list-inside space-y-2">
                {claims.map((claim, i) => <li key={i}>{claim}</li>)}
            </ol>
          </div>
        </div>}
        {entry.type === 'provisional' && embodiments.length > 0 && <div><strong>Extracted Embodiments ({embodiments.length}):</strong>
          <div className="whitespace-pre-wrap font-sans bg-white p-2 border rounded-md mt-1 max-h-60 overflow-y-auto">
            <ol className="list-decimal list-inside space-y-2">
                {embodiments.map((embodiment, i) => <li key={i}>{embodiment}</li>)}
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
    onEditEntry: (entry: KnowledgeBaseEntry) => void;
    disabled: boolean;
};

function RecursiveEntryRenderer({ entries, onRemoveEntry, onEditEntry, disabled }: RecursiveEntryRendererProps) {
    return (
        <div className="space-y-2">
            {entries.map(entry => (
                <div key={entry.id}>
                    <EntryDisplay entry={entry} onRemoveEntry={onRemoveEntry} onEditEntry={onEditEntry} disabled={disabled} level={entry.level} />
                    {entry.children.length > 0 && (
                        <div className="mt-2 pl-4 ml-4 border-l-2 border-indigo-200">
                            <RecursiveEntryRenderer entries={entry.children} onRemoveEntry={onRemoveEntry} onEditEntry={onEditEntry} disabled={disabled} />
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

export function KnowledgeBase({ 
    ownedEntries, 
    pinnedIdeas,
    discoveredEntries, 
    onRemoveEntry, 
    onPinEntry, 
    onExport, 
    onImport, 
    onUpdateEntry, 
    onRemovePinnedIdea,
    onUpdatePinnedIdea,
    onExportPinnedIdeas,
    onImportPinnedIdeas,
    disabled 
}: KnowledgeBaseProps) {
  const [editingEntry, setEditingEntry] = useState<KnowledgeBaseEntry | null>(null);
  const [editingIdea, setEditingIdea] = useState<KnowledgeBaseEntry | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const ideaFormRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (editingEntry && formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [editingEntry]);

  useEffect(() => {
    if (editingIdea && ideaFormRef.current) {
      ideaFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [editingIdea]);
  
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
  
  const handleStartEdit = (entry: KnowledgeBaseEntry) => setEditingEntry(entry);
  const handleCancelEdit = () => setEditingEntry(null);
  const handleSaveEdit = (formData: KnowledgeBaseEntry) => {
    onUpdateEntry(formData);
    handleCancelEdit();
  }

  const handleStartEditIdea = (idea: KnowledgeBaseEntry) => setEditingIdea(idea);
  const handleCancelEditIdea = () => setEditingIdea(null);
  const handleSaveEditIdea = (formData: KnowledgeBaseEntry) => {
    onUpdatePinnedIdea(formData);
    handleCancelEditIdea();
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg mt-8">
      {/* Owned Portfolio Section */}
      <div className="mb-6">
        <div className="flex flex-wrap justify-between items-center mb-4 pb-4 border-b border-slate-200 gap-4">
            <h2 className="text-xl font-semibold text-slate-700">My Portfolio ({ownedEntries.length})</h2>
            <div className="flex items-center gap-2">
                <button onClick={onExport} disabled={disabled || ownedEntries.length === 0} className="p-1.5 border rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50" title="Export My Portfolio to JSON">
                  <DownloadIcon className="h-5 w-5" />
                </button>
                <label
                  htmlFor="kb-import-input"
                  className={`p-1.5 border rounded-md shadow-sm text-slate-700 bg-white ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50 cursor-pointer'}`}
                  title="Import portfolio from a 'patent_portfolio_knowledge_base_....json' file"
                >
                  <UploadIcon className="h-5 w-5" />
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

        {editingEntry && (
          <div ref={formRef} className="mb-6">
            <KnowledgeBaseEntryForm
              key={`edit-kb-${editingEntry.id}`}
              initialData={editingEntry}
              mode={'edit'}
              ownedEntries={ownedEntries}
              onSave={(data) => handleSaveEdit(data as KnowledgeBaseEntry)}
              onCancel={handleCancelEdit}
            />
          </div>
        )}
        
        <p className="text-sm text-slate-500 mb-4">Your persistent portfolio of owned applications. It is automatically populated from your uploaded files. Manage your entries below or use the buttons above to import or export your portfolio.</p>
        <div className="space-y-2">
            {hierarchicalOwnedEntries.length > 0 ? (
                <RecursiveEntryRenderer entries={hierarchicalOwnedEntries} onRemoveEntry={onRemoveEntry} onEditEntry={handleStartEdit} disabled={disabled} />
            ) : (
                <p className="text-center text-slate-500 py-4">No portfolio entries found. Upload documents that contain patent applications to get started.</p>
            )}
        </div>
      </div>

      {/* Pinned Ideas Section */}
      <div className="mt-8 pt-6 border-t border-dashed border-slate-300">
        <div className="flex flex-wrap justify-between items-center mb-4 pb-4 border-b border-slate-200 gap-4">
            <h2 className="text-xl font-semibold text-slate-700">Pinned Ideas for Exploration ({pinnedIdeas.length})</h2>
             <div className="flex items-center gap-2">
                <button onClick={onExportPinnedIdeas} disabled={disabled || pinnedIdeas.length === 0} className="p-1.5 border rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50" title="Export Pinned Ideas to JSON">
                  <DownloadIcon className="h-5 w-5" />
                </button>
                <label
                  htmlFor="ideas-import-input"
                  className={`p-1.5 border rounded-md shadow-sm text-slate-700 bg-white ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50 cursor-pointer'}`}
                  title="Import ideas from a 'pinned_ideas_....json' file"
                >
                  <UploadIcon className="h-5 w-5" />
                </label>
                <input
                  id="ideas-import-input"
                  type="file"
                  onChange={onImportPinnedIdeas}
                  accept=".json"
                  className="hidden"
                  disabled={disabled}
                />
            </div>
        </div>

        {editingIdea && (
          <div ref={ideaFormRef} className="mb-6">
            <KnowledgeBaseEntryForm
              key={`edit-idea-${editingIdea.id}`}
              initialData={editingIdea}
              mode={'edit'}
              ownedEntries={[]} 
              onSave={(data) => handleSaveEditIdea(data as KnowledgeBaseEntry)}
              onCancel={handleCancelEditIdea}
            />
          </div>
        )}

        <p className="text-sm text-slate-500 mb-4">A list of ideas pinned from discovered prior art. Use these for inspiration or to develop new embodiments. They are not part of your formal portfolio and are not used as context for AI analysis.</p>
        <div className="space-y-2">
            {pinnedIdeas.length > 0 ? (
                 pinnedIdeas.map(idea => (
                    <EntryDisplay key={idea.id} entry={idea} onRemoveEntry={onRemovePinnedIdea} onEditEntry={handleStartEditIdea} disabled={disabled} level={0} isPinnedIdea={true}/>
                ))
            ) : (
                <p className="text-center text-slate-500 py-4">No ideas pinned yet. Analyze an invention to discover prior art that you can pin.</p>
            )}
        </div>
      </div>
      
      {/* Discovered Prior Art Section */}
      {discoveredEntries.length > 0 && (
         <div className="mt-8 pt-6 border-t border-dashed border-slate-300">
            <h3 className="text-lg font-medium text-slate-800 mb-2">Discovered Prior Art ({discoveredEntries.length})</h3>
            <p className="text-sm text-slate-500 mb-4">Read-only list of prior art found during the last analysis. This list is temporary and will be replaced with each new analysis. Click the pin icon to add an item to your "Pinned Ideas" list.</p>
            <div className="space-y-2">
                {discoveredEntries.map(entry => (
                    <EntryDisplay key={entry.id} entry={entry} onRemoveEntry={() => {}} onEditEntry={() => {}} onPinEntry={onPinEntry} disabled={disabled} level={0} />
                ))}
            </div>
        </div>
      )}
    </div>
  );
}