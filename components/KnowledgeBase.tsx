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
  onUpdateEntry: (entryData: KnowledgeBaseEntry) => void;
  onExportAll: () => void;
  onImportAll: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onPinEntry: (id: string) => void;
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
    let message = `Are you sure you want to remove the portfolio entry "${entry.title}"? This will also remove any entries that claim priority to it.`;
    if (isPinnedIdea) message = `Are you sure you want to remove the pinned idea "${entry.title}"?`;
    if (isLibraryArt) message = `Are you sure you want to remove the prior art entry "${entry.title}" from your library?`;
    
    if (window.confirm(message)) {
      onRemoveEntry(entry.id);
    }
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
                className="p-1 text-teal-600 hover: