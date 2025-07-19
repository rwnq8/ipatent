import { KnowledgeBaseEntry, KnowledgeBaseUpdateResult } from '../types';
import { normalizeApplicationNumber } from './utils';

const KB_STORAGE_KEY = 'patentAnalyzerKnowledgeBase';
const PINNED_IDEAS_STORAGE_KEY = 'patentAnalyzerPinnedIdeas';

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

// --- Main Knowledge Base (Portfolio) Functions ---

export const getKnowledgeBase = (): KnowledgeBaseEntry[] => {
  try {
    const rawData = localStorage.getItem(KB_STORAGE_KEY);
    if (!rawData) return [];
    const kb = JSON.parse(rawData);
    if (Array.isArray(kb)) {
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
            if (item.priorityTo) {
                newEntry.priorityTo = item.priorityTo;
            }
            return newEntry;
          }
          return null;
        })
        .filter((item): item is KnowledgeBaseEntry => item !== null);

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
    const cleanKb = deduplicateKnowledgeBase(kb);
    const ownedEntries = cleanKb.filter(e => e.isOwner);
    localStorage.setItem(KB_STORAGE_KEY, JSON.stringify(ownedEntries));
  } catch (error) {
    console.error("Failed to save knowledge base to localStorage", error);
  }
};

export const removeKnowledgeBaseEntry = (id: string): KnowledgeBaseEntry[] => {
  let kb = getKnowledgeBase();
  const entryToRemove = kb.find(e => e.id === id);
  if(!entryToRemove) return kb;

  kb = kb.filter(entry => entry.id !== id);
  kb = kb.filter(entry => entry.priorityTo !== id);

  saveKnowledgeBase(kb);
  return kb;
};

export const exportKnowledgeBase = (): string => {
    const kb = getKnowledgeBase();
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
    
    const combinedKb = [...currentKb, ...validatedNewEntries.map(e => ({...e, id: `import-${Date.now()}-${Math.random()}`}))];
    saveKnowledgeBase(combinedKb);
    const finalKb = getKnowledgeBase();

    const addedCount = finalKb.length - currentKb.length;

    return { updatedKb: finalKb, addedCount: Math.max(0, addedCount), updatedCount: 0, conflicts: [] };
};


// --- Pinned Ideas Functions ---

export const getPinnedIdeas = (): KnowledgeBaseEntry[] => {
  try {
    const rawData = localStorage.getItem(PINNED_IDEAS_STORAGE_KEY);
    if (!rawData) return [];
    const ideas = JSON.parse(rawData);
    if (Array.isArray(ideas)) {
      return deduplicateKnowledgeBase(ideas);
    }
    return [];
  } catch (error) {
    console.error("Failed to load pinned ideas from localStorage", error);
    localStorage.removeItem(PINNED_IDEAS_STORAGE_KEY);
    return [];
  }
};

export const savePinnedIdeas = (ideas: KnowledgeBaseEntry[]): void => {
  try {
    const cleanIdeas = deduplicateKnowledgeBase(ideas);
    localStorage.setItem(PINNED_IDEAS_STORAGE_KEY, JSON.stringify(cleanIdeas));
  } catch (error) {
    console.error("Failed to save pinned ideas to localStorage", error);
  }
};

export const removePinnedIdea = (id: string): KnowledgeBaseEntry[] => {
  let ideas = getPinnedIdeas();
  ideas = ideas.filter(idea => idea.id !== id);
  savePinnedIdeas(ideas);
  return ideas;
};

export const exportPinnedIdeas = (): string => {
    const ideas = getPinnedIdeas();
    return JSON.stringify(ideas, null, 2);
};

export const importPinnedIdeas = (jsonString: string): KnowledgeBaseUpdateResult => {
    const currentIdeas = getPinnedIdeas();
    let importedEntries;
    try {
        importedEntries = JSON.parse(jsonString);
        if (!Array.isArray(importedEntries)) {
            throw new Error("Imported data is not a valid JSON array.");
        }
    } catch (error) {
        console.error("Failed to parse imported ideas:", error);
        throw new Error(`Import failed during parsing: ${(error as Error).message}`);
    }

    const validatedNewEntries: KnowledgeBaseEntry[] = importedEntries.map(item => ({
        id: item.id || `import-idea-${Date.now()}-${Math.random()}`,
        isOwner: true, // Treat as "owned" within the pinned list
        type: item.type || 'non-provisional',
        title: item.title || 'Untitled',
        applicationNumber: item.applicationNumber || 'N/A',
        filingDate: item.filingDate || '',
        priorityTo: undefined, // Pinned ideas don't have priority claims
        files: Array.isArray(item.files) ? item.files : [],
        extractedClaims: Array.isArray(item.extractedClaims) ? item.extractedClaims : [],
        extractedEmbodiments: Array.isArray(item.extractedEmbodiments) ? item.extractedEmbodiments : [],
        isComplete: typeof item.isComplete === 'boolean' ? item.isComplete : false,
        notes: item.notes || '',
    }));
    
    const combinedIdeas = [...currentIdeas, ...validatedNewEntries];
    savePinnedIdeas(combinedIdeas);
    const finalIdeas = getPinnedIdeas();

    const addedCount = finalIdeas.length - currentIdeas.length;

    return { updatedKb: finalIdeas, addedCount: Math.max(0, addedCount), updatedCount: 0, conflicts: [] };
};