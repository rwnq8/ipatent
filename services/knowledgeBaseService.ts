import { KnowledgeBaseEntry, StructuredKnowledgeBaseData, ProcessedFile, KnowledgeBaseUpdateResult } from '../types';

const KB_STORAGE_KEY = 'patentAnalyzerKnowledgeBase';

export const getKnowledgeBase = (): KnowledgeBaseEntry[] => {
  try {
    const rawData = localStorage.getItem(KB_STORAGE_KEY);
    if (!rawData) return [];
    const kb = JSON.parse(rawData);
    if (Array.isArray(kb)) {
      // A simple check to ensure it's an array of objects with an 'id' and 'isOwner'
      return kb.filter(item => typeof item === 'object' && item !== null && 'id' in item && 'isOwner' in item);
    }
    return [];
  } catch (error) {
    console.error("Failed to load knowledge base from localStorage", error);
    localStorage.removeItem(KB_STORAGE_KEY); // Clear potentially corrupted data
    return [];
  }
};

export const saveKnowledgeBase = (kb: KnowledgeBaseEntry[]): void => {
  try {
    // Only save entries that are owned by the user
    const ownedEntries = kb.filter(e => e.isOwner);
    localStorage.setItem(KB_STORAGE_KEY, JSON.stringify(ownedEntries));
  } catch (error) {
    console.error("Failed to save knowledge base to localStorage", error);
    // Potentially alert user that storage failed (e.g., quota exceeded)
  }
};

/**
 * Merges a list of new entries into an existing knowledge base non-destructively.
 * @param existingKb The current knowledge base.
 * @param newEntries The new entries to merge in.
 * @returns A result object with the merged KB and stats on the operation.
 */
const mergeKnowledgeBases = (existingKb: KnowledgeBaseEntry[], newEntries: Omit<KnowledgeBaseEntry, 'id'>[]): KnowledgeBaseUpdateResult => {
  const updatedKb = [...existingKb];
  const conflicts: string[] = [];
  let addedCount = 0;
  let updatedCount = 0;

  const existingAppNumbers = new Map(updatedKb.map(e => [e.applicationNumber, e]));

  for (const newEntryData of newEntries) {
    if (newEntryData.applicationNumber && existingAppNumbers.has(newEntryData.applicationNumber)) {
      // Entry exists, check for conflicts and merge
      const existingEntry = existingAppNumbers.get(newEntryData.applicationNumber)!;
      const itemConflicts: string[] = [];

      if (newEntryData.title && existingEntry.title && newEntryData.title !== existingEntry.title) {
        itemConflicts.push(`Title mismatch ('${newEntryData.title}' vs '${existingEntry.title}')`);
      }
      if (newEntryData.filingDate && existingEntry.filingDate && newEntryData.filingDate !== existingEntry.filingDate) {
        itemConflicts.push(`Filing Date mismatch ('${newEntryData.filingDate}' vs '${existingEntry.filingDate}')`);
      }

      if (itemConflicts.length > 0) {
        conflicts.push(`Application ${newEntryData.applicationNumber}: ${itemConflicts.join(', ')}. Skipped update.`);
        continue;
      }

      // No conflicts, perform merge
      updatedCount++;
      const existingFileNames = new Set(existingEntry.files.map(f => f.name));
      const newFilesToAdd = newEntryData.files.filter(f => !existingFileNames.has(f.name));
      existingEntry.files.push(...newFilesToAdd);

      const existingClaims = new Set(existingEntry.extractedClaims);
      const newClaimsToAdd = newEntryData.extractedClaims.filter(c => !existingClaims.has(c));
      existingEntry.extractedClaims.push(...newClaimsToAdd);

      if (newEntryData.notes && !existingEntry.notes.includes(newEntryData.notes)) {
        existingEntry.notes = `${existingEntry.notes}\n\n[Update]: ${newEntryData.notes}`;
      }

    } else {
      // New entry
      addedCount++;
      const newEntry: KnowledgeBaseEntry = {
        ...newEntryData,
        id: `kb-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      };
      updatedKb.push(newEntry);
    }
  }

  // Post-process to link priorityTo fields to actual IDs across the entire set
  const finalAppNumToIdMap = new Map(updatedKb.map(e => e.applicationNumber ? [e.applicationNumber, e.id] : [null, null]));
  updatedKb.forEach(e => {
    // If priorityTo is an application number, resolve it to an ID
    if (e.priorityTo && finalAppNumToIdMap.has(e.priorityTo)) {
      e.priorityTo = finalAppNumToIdMap.get(e.priorityTo)!;
    }
  });

  return { updatedKb, addedCount, updatedCount, conflicts };
};


export const addKnowledgeBaseEntriesFromStructuredData = (
  newData: StructuredKnowledgeBaseData[],
  allNewFiles: ProcessedFile[]
): KnowledgeBaseUpdateResult => {
  const currentKb = getKnowledgeBase();

  const newEntries: Omit<KnowledgeBaseEntry, 'id'>[] = newData.map(data => {
    const relevantFiles = allNewFiles.filter(pf => data.fileNames.includes(pf.name));
    return {
      isOwner: true,
      title: data.title,
      applicationNumber: data.applicationNumber,
      filingDate: data.filingDate,
      type: data.type,
      extractedClaims: data.extractedClaims,
      notes: data.notes,
      files: relevantFiles.map(rf => ({ name: rf.name, content: rf.content })),
      priorityTo: data.priorityTo,
    };
  });

  const result = mergeKnowledgeBases(currentKb, newEntries);
  saveKnowledgeBase(result.updatedKb);
  return result;
};


export const removeKnowledgeBaseEntry = (id: string): KnowledgeBaseEntry[] => {
  const kb = getKnowledgeBase();
  const updatedKb = kb.filter(entry => entry.id !== id);
  saveKnowledgeBase(updatedKb);
  return updatedKb;
};

export const exportKnowledgeBase = (): string => {
    const kb = getKnowledgeBase();
    return JSON.stringify(kb, null, 2); // Pretty-print the JSON
};

export const importKnowledgeBase = (jsonString: string): KnowledgeBaseUpdateResult => {
    const currentKb = getKnowledgeBase();
    let importedEntries;
    try {
        importedEntries = JSON.parse(jsonString);
        if (!Array.isArray(importedEntries)) {
            throw new Error("Imported data is not a valid JSON array.");
        }
    } catch (error) {
        console.error("Failed to parse imported knowledge base:", error);
        throw new Error(`Import failed during parsing: ${(error as Error).message}`);
    }

    // Validate and coerce into correct type, ensuring isOwner is true
    const validatedNewEntries: Omit<KnowledgeBaseEntry, 'id'>[] = importedEntries.map(item => ({
        ...item,
        isOwner: true, // Force all imported entries to be owned
    }));
    
    const result = mergeKnowledgeBases(currentKb, validatedNewEntries);
    saveKnowledgeBase(result.updatedKb);
    return result;
};