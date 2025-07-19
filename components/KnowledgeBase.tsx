import React, { useMemo, useState, useRef, useEffect } from 'react';
import { KnowledgeBaseEntry } from '../types';
import { TrashIcon, FileTextIcon, DownloadIcon, UploadIcon, PinIcon, PencilIcon, ExclamationTriangleIcon } from './icons';
import { KnowledgeBaseEntryForm } from './KnowledgeBaseEntryForm';

interface KnowledgeBaseProps {
  ownedEntries: KnowledgeBaseEntry[];
  pinnedIdeas: KnowledgeBaseEntry[];
  discoveredEntries: KnowledgeBaseEntry[];
  priorArtLibrary: KnowledgeBaseEntry[];
  onRemoveEntry: (id: string) => void;
  onAddEntry: (entryData: KnowledgeBaseEntry) => void;
  onPinEntry: (id: string) => void;
  onExportAll: () => void;
  onImportAll: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onUpdateEntry: (entryData: KnowledgeBaseEntry) => void;
  onRemovePinnedIdea: (id: string) => void;
  onAddNewPinnedIdea: (entryData: KnowledgeBaseEntry) => void;
  onUpdatePinnedIdea: (entryData: KnowledgeBaseEntry) => void;
  onRemovePriorArtLibraryEntry: (id: string) => void;
  onUpdatePriorArtLibraryEntry: (entryData: KnowledgeBaseEntry) => void;
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
    isLibraryArt?: boolean;
}

function EntryDisplay({ entry, onRemoveEntry, onEditEntry, onPinEntry, disabled, level, isPinnedIdea = false, isLibraryArt = false }: EntryDisplayProps) {
  const files = entry.files || [];
  const claims = entry.extractedClaims || [];
  const embodiments = entry.extractedEmbodiments || [];

  let titleColor = "text-slate-700"; // Discovered (temporary) art
  if (isPinnedIdea) titleColor = 'text-cyan-700';
  else if (isLibraryArt) titleColor = 'text-purple-700';
  else if (entry.isOwner) titleColor = "text-indigo-700";

  const handleRemoveClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    // Bypassing confirm() due to sandbox restrictions.
    // The user action (clicking a trash icon) is considered sufficient intent.
    onRemoveEntry(entry.id);
  };

  return (
    <details className={`p-4 rounded-lg shadow-sm border ${level > 0 ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-200'}`} open={!entry.isOwner && !isPinnedIdea}>
      <summary className="font-medium text-slate-800 cursor-pointer flex justify-between items-center gap-2">
        <div className="flex-grow">
          <span className={titleColor}>{entry.title}</span>
          <span className="ml-4 text-sm text-slate-500">({entry.applicationNumber || 'N/A'})</span>
        </div>
        <div className="flex-shrink-0 flex items-center gap-2">
        {entry.isOwner || isLibraryArt ? (
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
                onClick={handleRemoveClick}
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
                <span className="text-sm">This entry appears to be incomplete. Edit to add the full specification text for a more accurate analysis.</span>
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
    priorArtLibrary, 
    onRemoveEntry, 
    onAddEntry,
    onPinEntry, 
    onExportAll, 
    onImportAll, 
    onUpdateEntry, 
    onRemovePinnedIdea,
    onAddNewPinnedIdea,
    onUpdatePinnedIdea,
    onRemovePriorArtLibraryEntry,
    onUpdatePriorArtLibraryEntry,
    disabled 
}: KnowledgeBaseProps) {
  const [activeTab, setActiveTab] = useState('portfolio');
  const [editingEntry, setEditingEntry] = useState<KnowledgeBaseEntry | null>(null);
  const [isAddingEntry, setIsAddingEntry] = useState(false);
  const [isAddingIdea, setIsAddingIdea] = useState(false);
  const [editingIdea, setEditingIdea] = useState<KnowledgeBaseEntry | null>(null);
  const [editingArt, setEditingArt] = useState<KnowledgeBaseEntry | null>(null);

  const formRef = useRef<HTMLDivElement>(null);
  const ideaFormRef = useRef<HTMLDivElement>(null);
  const artFormRef = useRef<HTMLDivElement>(null);

  const defaultNewEntry: Omit<KnowledgeBaseEntry, 'id'> = {
      isOwner: true,
      type: 'non-provisional',
      title: '',
      applicationNumber: '',
      filingDate: '',
      files: [],
      extractedClaims: [],
      extractedEmbodiments: [],
      isComplete: true, // Manually added entries are assumed to be user-vetted
      notes: '',
  };
  
  const defaultNewIdea: Omit<KnowledgeBaseEntry, 'id'> = {
      isOwner: true,
      type: 'provisional',
      title: '',
      applicationNumber: `IDEA-${Date.now()}`,
      filingDate: new Date().toISOString().slice(0, 10),
      files: [],
      extractedClaims: [],
      extractedEmbodiments: [],
      isComplete: true, 
      notes: '',
  };

  useEffect(() => {
    if ((editingEntry || isAddingEntry) && formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [editingEntry, isAddingEntry]);

  useEffect(() => {
    if ((editingIdea || isAddingIdea) && ideaFormRef.current) {
      ideaFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [editingIdea, isAddingIdea]);

  useEffect(() => {
    if (editingArt && artFormRef.current) {
      artFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [editingArt]);

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
  
  const handleStartEdit = (entry: KnowledgeBaseEntry) => { setIsAddingEntry(false); setEditingEntry(entry); };
  const handleCancelEdit = () => setEditingEntry(null);
  const handleSaveEdit = (formData: KnowledgeBaseEntry) => { onUpdateEntry(formData); handleCancelEdit(); };

  const handleStartAdd = () => { setEditingEntry(null); setIsAddingEntry(true); };
  const handleCancelAdd = () => setIsAddingEntry(false);
  const handleSaveAdd = (formData: KnowledgeBaseEntry) => { onAddEntry(formData); handleCancelAdd(); };
  
  const handleStartAddIdea = () => { setEditingIdea(null); setIsAddingIdea(true); };
  const handleCancelAddIdea = () => setIsAddingIdea(false);
  const handleSaveAddIdea = (formData: KnowledgeBaseEntry) => { onAddNewPinnedIdea(formData); handleCancelAddIdea(); };
  
  const handleStartEditIdea = (idea: KnowledgeBaseEntry) => { setIsAddingIdea(false); setEditingIdea(idea); };
  const handleCancelEditIdea = () => setEditingIdea(null);
  const handleSaveEditIdea = (formData: KnowledgeBaseEntry) => { onUpdatePinnedIdea(formData); handleCancelEditIdea(); };

  const handleStartEditArt = (art: KnowledgeBaseEntry) => setEditingArt(art);
  const handleCancelEditArt = () => setEditingArt(null);
  const handleSaveEditArt = (formData: KnowledgeBaseEntry) => { onUpdatePriorArtLibraryEntry(formData); handleCancelEditArt(); };

  const formToShow = isAddingEntry ? 'add' : editingEntry ? 'edit' : null;
  const ideaFormToShow = isAddingIdea ? 'add' : editingIdea ? 'edit' : null;

  const getTabClass = (tabName: string) => {
    return activeTab === tabName
      ? 'border-blue-600 text-blue-700 font-semibold'
      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300';
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg mt-8">
        <div className="flex flex-wrap justify-between items-center mb-2 gap-4">
            <h2 className="text-xl font-semibold text-slate-700">Knowledge Base</h2>
            <div className="flex items-center gap-2 flex-shrink-0">
                <button
                    onClick={onExportAll}
                    disabled={disabled}
                    className="inline-flex items-center gap-2 px-3 py-1.5 border rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50"
                    title="Export All Data to a Single JSON File"
                >
                    <DownloadIcon className="h-5 w-5" />
                    Export All
                </button>
                <label
                    htmlFor="kb-full-import-input"
                    className={`inline-flex items-center gap-2 px-3 py-1.5 border rounded-md shadow-sm text-slate-700 bg-white ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50 cursor-pointer'}`}
                    title="Import All Data from a Single Backup File"
                >
                    <UploadIcon className="h-5 w-5" />
                    Import All
                </label>
                <input
                    id="kb-full-import-input"
                    type="file"
                    onChange={onImportAll}
                    accept=".json"
                    className="hidden"
                    disabled={disabled}
                />
            </div>
        </div>

        <div className="border-b border-slate-200 mt-2">
            <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                <button
                    onClick={() => setActiveTab('portfolio')}
                    className={`whitespace-nowrap py-4 px-1 border-b-2 text-sm transition-colors duration-150 focus:outline-none ${getTabClass('portfolio')}`}
                >
                    My Portfolio ({ownedEntries.length})
                </button>
                 <button
                    onClick={() => setActiveTab('library')}
                    className={`whitespace-nowrap py-4 px-1 border-b-2 text-sm transition-colors duration-150 focus:outline-none ${getTabClass('library')}`}
                >
                    Prior Art Library ({priorArtLibrary.length})
                </button>
                <button
                    onClick={() => setActiveTab('ideas')}
                    className={`whitespace-nowrap py-4 px-1 border-b-2 text-sm transition-colors duration-150 focus:outline-none ${getTabClass('ideas')}`}
                >
                    Pinned Ideas ({pinnedIdeas.length})
                </button>
            </nav>
        </div>

        {/* Portfolio Tab */}
        <div className={activeTab === 'portfolio' ? 'mt-6' : 'hidden'}>
            <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
                <p className="text-sm text-slate-500 flex-grow">Your persistent portfolio of owned applications. It is automatically populated from your uploaded files.</p>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                        onClick={handleStartAdd}
                        disabled={disabled}
                        className="inline-flex items-center px-3 py-1.5 border border-blue-600 text-sm font-medium rounded-md shadow-sm text-blue-700 bg-white hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                        Add Entry
                    </button>
                </div>
            </div>

            {formToShow && (
                <div ref={formRef} className="mb-6">
                    <KnowledgeBaseEntryForm
                    key={formToShow === 'add' ? 'add-new' : `edit-kb-${editingEntry!.id}`}
                    initialData={formToShow === 'add' ? defaultNewEntry : editingEntry!}
                    mode={formToShow}
                    ownedEntries={ownedEntries}
                    onSave={formToShow === 'add' ? handleSaveAdd : handleSaveEdit}
                    onCancel={formToShow === 'add' ? handleCancelAdd : handleCancelEdit}
                    />
                </div>
            )}
            
            <div className="space-y-2">
                {hierarchicalOwnedEntries.length > 0 ? (
                    <RecursiveEntryRenderer entries={hierarchicalOwnedEntries} onRemoveEntry={onRemoveEntry} onEditEntry={handleStartEdit} disabled={disabled} />
                ) : (
                    !isAddingEntry && <p className="text-center text-slate-500 py-4">No portfolio entries found. Upload documents or add an entry manually to get started.</p>
                )}
            </div>
        </div>

        {/* Prior Art Library Tab */}
        <div className={activeTab === 'library' ? 'mt-6' : 'hidden'}>
            <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
                 <p className="text-sm text-slate-500 flex-grow">A persistent library of all prior art discovered across all analysis sessions. This library is used as context to inform future prior art searches.</p>
            </div>

            {editingArt && (
            <div ref={artFormRef} className="mb-6">
                <KnowledgeBaseEntryForm
                key={`edit-art-${editingArt.id}`}
                initialData={editingArt}
                mode={'edit'}
                ownedEntries={[]} 
                onSave={(data) => handleSaveEditArt(data as KnowledgeBaseEntry)}
                onCancel={handleCancelEditArt}
                />
            </div>
            )}

            <div className="space-y-2">
                {priorArtLibrary.length > 0 ? (
                    priorArtLibrary.map(art => (
                        <EntryDisplay key={art.id} entry={art} onRemoveEntry={onRemovePriorArtLibraryEntry} onEditEntry={handleStartEditArt} disabled={disabled} level={0} isLibraryArt={true}/>
                    ))
                ) : (
                    <p className="text-center text-slate-500 py-4">Your prior art library is empty. Analyze an invention to automatically populate it.</p>
                )}
            </div>
        </div>
        
        {/* Pinned Ideas Tab */}
        <div className={activeTab === 'ideas' ? 'mt-6' : 'hidden'}>
             <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
                <p className="text-sm text-slate-500 flex-grow">A list of ideas pinned from prior art or added manually. Use these for inspiration. They are not used as context for AI analysis.</p>
                 <div className="flex items-center gap-2 flex-shrink-0">
                     <button
                        onClick={handleStartAddIdea}
                        disabled={disabled}
                        className="inline-flex items-center px-3 py-1.5 border border-cyan-600 text-sm font-medium rounded-md shadow-sm text-cyan-700 bg-white hover:bg-cyan-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 disabled:opacity-50"
                    >
                        Add Idea
                    </button>
                </div>
            </div>

            {ideaFormToShow && (
                <div ref={ideaFormRef} className="mb-6">
                    <KnowledgeBaseEntryForm
                        key={ideaFormToShow === 'add' ? 'add-new-idea' : `edit-idea-${editingIdea!.id}`}
                        initialData={ideaFormToShow === 'add' ? defaultNewIdea : editingIdea!}
                        mode={ideaFormToShow}
                        ownedEntries={[]} 
                        onSave={ideaFormToShow === 'add' ? handleSaveAddIdea : handleSaveEditIdea}
                        onCancel={ideaFormToShow === 'add' ? handleCancelAddIdea : handleCancelEditIdea}
                    />
                </div>
            )}
            
            <div className="space-y-2">
                {pinnedIdeas.length > 0 ? (
                    pinnedIdeas.map(idea => (
                        <EntryDisplay key={idea.id} entry={idea} onRemoveEntry={onRemovePinnedIdea} onEditEntry={handleStartEditIdea} disabled={disabled} level={0} isPinnedIdea={true}/>
                    ))
                ) : (
                    !isAddingIdea && <p className="text-center text-slate-500 py-4">No ideas pinned yet. Analyze an invention to discover prior art that you can pin, or add a new idea manually.</p>
                )}
            </div>
        </div>
      
        {/* Discovered Prior Art Section */}
        {discoveredEntries.length > 0 && (
            <div className="mt-8 pt-6 border-t border-dashed border-slate-300">
                <h3 className="text-lg font-medium text-slate-800 mb-2">Discovered Prior Art ({discoveredEntries.length})</h3>
                <p className="text-sm text-slate-500 mb-4">Read-only list of prior art found during the last analysis. This list is temporary and will be replaced with each new analysis. New items found here are automatically added to your persistent "Prior Art Library". Click the pin icon to also add an item to your "Pinned Ideas" list.</p>
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
