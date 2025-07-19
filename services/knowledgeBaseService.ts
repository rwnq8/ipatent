import { KnowledgeBaseEntry, KnowledgeBaseUpdateResult } from '../types';
import { normalizeApplicationNumber } from './utils';

const KB_STORAGE_KEY = 'patentAnalyzerKnowledgeBase';

/**
 * Merges duplicate entries in a knowledge base. It uses a normalized application
 * number to identify duplicates and intelligently combines their data.
 * @param kb The knowledge base array, potentially with duplicates.
 * @returns A new knowledge base array with all duplicates merged.
 */
const deduplicateKnowledgeBase = (kb: KnowledgeBaseEntry[]): KnowledgeBaseEntry[] => {
    const entryMap = new Map<string, KnowledgeBaseEntry>();

    for (const currentEntry of kb) {
        const normalizedAppNum = normalizeApplicationNumber(currentEntry.applicationNumber);
        
        // Handle entries without a valid application number by treating their ID as the unique key
        const mapKey = normalizedAppNum || `id:${currentEntry.id}`;
        const existingEntry = entryMap.get(mapKey);

        if (existingEntry) {
            // --- Merge currentEntry into existingEntry ---

            // Prefer more descriptive titles
            if (currentEntry.title && currentEntry.title.toLowerCase() !== 'untitled' && (existingEntry.title.toLowerCase() === 'untitled' || currentEntry.title.length > existingEntry.title.length)) {
                existingEntry.title = currentEntry.title;
            }
            
            // Prefer later or more specific filing date
            if (currentEntry.filingDate && (!existingEntry.filingDate || currentEntry.filingDate > existingEntry.filingDate)) {
                 existingEntry.filingDate = currentEntry.filingDate;
            }

            // 'isComplete' status is "infectious" - once true, it stays true.
            if (currentEntry.isComplete) {
                existingEntry.isComplete = true;
            }
            
            // Merge files (unique names)
            const existingFileNames = new Set((existingEntry.files || []).map(f => f.name));
            (currentEntry.files || []).forEach(file => {
                if (file && !existingFileNames.has(file.name)) {
                    existingEntry.files.push(file);
                }
            });

            // Merge claims (unique content)
            const existingClaims = new Set(existingEntry.extractedClaims || []);
            (currentEntry.extractedClaims || []).forEach(claim => {
                if (claim && !existingClaims.has(claim)) {
                    existingEntry.extractedClaims.push(claim);
                }
            });

            // Merge embodiments (unique content)
            const existingEmbodiments = new Set(existingEntry.extractedEmbodiments || []);
            (currentEntry.extractedEmbodiments || []).forEach(embodiment => {
                if (embodiment && !existingEmbodiments.has(embodiment)) {
                    existingEntry.extractedEmbodiments.push(embodiment);
                }
            });

            // Combine notes
            if (currentEntry.notes && !(existingEntry.notes || '').includes(currentEntry.notes)) {
                existingEntry.notes = `${existingEntry.notes || ''}\n\n[Consolidated]: ${currentEntry.notes}`.trim();
            }

            // Take priority claim if the existing one doesn't have one
            if(currentEntry.priorityTo && !existingEntry.priorityTo) {
                existingEntry.priorityTo = currentEntry.priorityTo;
            }
        } else {
            // It's a new unique entry, add it to the map.
            // Create a defensive copy to ensure all array fields are initialized.
            entryMap.set(mapKey, { 
                ...currentEntry,
                files: [...(currentEntry.files || [])],
                extractedClaims: [...(currentEntry.extractedClaims || [])],
                extractedEmbodiments: [...(currentEntry.extractedEmbodiments || [])],
            });
        }
    }

    const dedupedList = Array.from(entryMap.values());
    
    // Final pass to resolve priorityTo fields, as some target IDs may have been removed during de-duplication.
    const finalIdMap = new Map(dedupedList.map(e => [normalizeApplicationNumber(e.applicationNumber), e.id]));
    
    for (const entry of dedupedList) {
        if (entry.priorityTo) {
            // A priorityTo can be an ID ('kb-...') or an application number. Normalize and check.
            const normalizedParentNum = normalizeApplicationNumber(entry.priorityTo);
            if (finalIdMap.has(normalizedParentNum)) {
                const correctId = finalIdMap.get(normalizedParentNum)!;
                if (entry.priorityTo !== correctId) {
                    entry.priorityTo = correctId; // Update to the canonical ID
                }
            }
        }
    }
    
    return dedupedList;
};

export const getKnowledgeBase = (): KnowledgeBaseEntry[] => {
  try {
    const rawData = localStorage.getItem(KB_STORAGE_KEY);
    if (!rawData) return [];
    const kb = JSON.parse(rawData);
    if (Array.isArray(kb)) {
      // Migrate data to ensure all entries have the new fields with default values
      const migratedKb = kb
        .map((item): KnowledgeBaseEntry | null => {
          if (typeof item === 'object' && item !== null && 'id' in item && 'isOwner' in item) {
            const newEntry: KnowledgeBaseEntry = {
              id: item.id,
              isOwner: item.isOwner,
              type: item.type || 'non-provisional',
              title: item.title || 'Untitled',
              applicationNumber: item.applicationNumber || 'N/A',
              filingDate: item.filingDate || '',
              files: Array.isArray(item.files) ? item.files : [],
              extractedClaims: Array.isArray(item.extractedClaims) ? item.extractedClaims : [],
              extractedEmbodiments: Array.isArray(item.extractedEmbodiments) ? item.extractedEmbodiments : [],
              isComplete: typeof item.isComplete === 'boolean' ? item.isComplete : false,
              notes: item.notes || '',
            };
            // Conditionally add optional property to match the type
            if (item.priorityTo) {
                newEntry.priorityTo = item.priorityTo;
            }
            return newEntry;
          }
          return null;
        })
        .filter((item): item is KnowledgeBaseEntry => item !== null);

      // CRITICAL: De-duplicate the loaded data to consolidate entries.
      return deduplicateKnowledgeBase(migratedKb);
    }
    return [];
  } catch (error) {
    console.error("Failed to load knowledge base from localStorage", error);
    localStorage.removeItem(KB_STORAGE_KEY);
    return [];
  }
};

export const saveKnowledgeBase = (kb: KnowledgeBaseEntry[]): void => {
  try {
    // CRITICAL: De-duplicate before saving to ensure data integrity.
    const cleanKb = deduplicateKnowledgeBase(kb);
    const ownedEntries = cleanKb.filter(e => e.isOwner);
    localStorage.setItem(KB_STORAGE_KEY, JSON.stringify(ownedEntries));
  } catch (error) {
    console.error("Failed to save knowledge base to localStorage", error);
  }
};

const mergeKnowledgeBases = (existingKb: KnowledgeBaseEntry[], newEntries: Omit<KnowledgeBaseEntry, 'id'>[]): KnowledgeBaseUpdateResult => {
  const updatedKb = [...existingKb];
  const conflicts: string[] = [];
  let addedCount = 0;
  let updatedCount = 0;

  const existingAppNumbers = new Map(updatedKb.map(e => [normalizeApplicationNumber(e.applicationNumber), e]));

  for (const newEntryData of newEntries) {
    const normalizedNewAppNum = normalizeApplicationNumber(newEntryData.applicationNumber);
    if (normalizedNewAppNum && existingAppNumbers.has(normalizedNewAppNum)) {
      // Entry exists, let the main de-duplication handle the merge.
      // We just add it to the list to be processed.
    } else {
      addedCount++;
    }
    // Add all new entries to be de-duplicated later.
    const newEntry: KnowledgeBaseEntry = {
        ...newEntryData,
        id: `kb-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    };
    updatedKb.push(newEntry);
  }

  // The final de-duplication will resolve conflicts and merge data.
  const finalKb = deduplicateKnowledgeBase(updatedKb);
  
  // Note: addedCount/updatedCount might be less accurate now, but the outcome is a clean KB.
  // A simple way to recount:
  const finalCount = finalKb.length;
  const initialCount = existingKb.length;
  if(finalCount > initialCount) {
    addedCount = finalCount - initialCount;
    updatedCount = initialCount - (new Set([...existingKb.map(e => e.id), ...finalKb.map(e => e.id)]).size - finalCount);
  } else {
    addedCount = 0;
    updatedCount = finalCount;
  }
  
  return { updatedKb: finalKb, addedCount, updatedCount, conflicts };
};

export const addSingleKnowledgeBaseEntry = (entry: KnowledgeBaseEntry): KnowledgeBaseEntry[] => {
  const kb = getKnowledgeBase();
  const updatedKb = [...kb, { ...entry, isOwner: true }];
  saveKnowledgeBase(updatedKb); // saveKnowledgeBase will handle de-duplication
  return getKnowledgeBase(); // return the clean, re-read version
};

export const removeKnowledgeBaseEntry = (id: string): KnowledgeBaseEntry[] => {
  let kb = getKnowledgeBase();
  const entryToRemove = kb.find(e => e.id === id);
  if(!entryToRemove) return kb;

  // Remove the entry itself
  kb = kb.filter(entry => entry.id !== id);
  // Also remove any children that claim priority to it
  kb = kb.filter(entry => entry.priorityTo !== id);

  saveKnowledgeBase(kb);
  return kb;
};

export const exportKnowledgeBase = (): string => {
    const kb = getKnowledgeBase(); // Ensures exported data is clean
    return JSON.stringify(kb, null, 2);
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

    const validatedNewEntries: Omit<KnowledgeBaseEntry, 'id'>[] = importedEntries.map(item => ({
        isOwner: true,
        type: item.type || 'non-provisional',
        title: item.title || 'Untitled',
        applicationNumber: item.applicationNumber || 'N/A',
        filingDate: item.filingDate || '',
        priorityTo: item.priorityTo,
        files: Array.isArray(item.files) ? item.files : [],
        extractedClaims: Array.isArray(item.extractedClaims) ? item.extractedClaims : [],
        extractedEmbodiments: Array.isArray(item.extractedEmbodiments) ? item.extractedEmbodiments : [],
        isComplete: typeof item.isComplete === 'boolean' ? item.isComplete : false,
        notes: item.notes || '',
    }));
    
    // Combine and let the save operation handle the final de-duplication
    const combinedKb = [...currentKb, ...validatedNewEntries.map(e => ({...e, id: `import-${Date.now()}-${Math.random()}`}))];
    saveKnowledgeBase(combinedKb);
    const finalKb = getKnowledgeBase();

    const addedCount = finalKb.length - currentKb.length;

    return { updatedKb: finalKb, addedCount: Math.max(0, addedCount), updatedCount: 0, conflicts: [] };
};