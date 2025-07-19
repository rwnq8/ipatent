import { KnowledgeBaseEntry, KnowledgeBaseUpdateResult, FullKnowledgeBase } from '../types';
import { normalizeApplicationNumber, sanitizeMessage } from './utils';
import pako from 'pako';

const KB_STORAGE_KEY = 'patentAnalyzerKnowledgeBase';
const PINNED_IDEAS_STORAGE_KEY = 'patentAnalyzerPinnedIdeas';
const PRIOR_ART_LIBRARY_KEY = 'patentAnalyzerPriorArtLibrary';


/**
 * Merges duplicate entries in a knowledge base. It uses a normalized application
 * number to identify duplicates and intelligently combines their data.
 * @param kb The knowledge base array, potentially with duplicates.
 * @returns A new knowledge base array with all duplicates merged.
 */
const deduplicateKnowledgeBase = (kb: KnowledgeBaseEntry[]): KnowledgeBaseEntry[] => {
    const entryMap = new Map<string, KnowledgeBaseEntry>();

    for (const currentEntry of kb) {
        // For non-owned prior art, the applicationNumber (which can be a URL) is a better key
        const uniqueKeySource = currentEntry.isOwner 
            ? normalizeApplicationNumber(currentEntry.applicationNumber)
            : currentEntry.applicationNumber;

        // Handle entries without a valid application number by treating their ID as the unique key
        const mapKey = uniqueKeySource || `id:${currentEntry.id}`;
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

// Generic loader function with decompression and backward compatibility
const loadItemsFromStorage = (key: string): KnowledgeBaseEntry[] => {
  try {
    const rawData = localStorage.getItem(key);
    if (!rawData) return [];
    
    let items;
    // Check if data is compressed (starts with our identifier)
    if (rawData.startsWith('pako:')) {
        const compressedData = atob(rawData.substring(5));
        const uint8Array = Uint8Array.from(compressedData, c => c.charCodeAt(0));
        const decompressed = pako.inflate(uint8Array, { to: 'string' });
        items = JSON.parse(decompressed);
    } else {
        // Backward compatibility: If not compressed, parse as plain JSON
        // and re-save it in the compressed format.
        items = JSON.parse(rawData);
        if (Array.isArray(items)) {
            console.log(`Migrating uncompressed data for key "${key}" to new compressed format.`);
            saveItemsToStorage(key, items); // This will compress and save
        }
    }

    if (Array.isArray(items)) {
      const migratedItems = items
        .map((item): KnowledgeBaseEntry | null => {
          if (typeof item === 'object' && item !== null && 'id' in item) {
             const newEntry: KnowledgeBaseEntry = {
              id: item.id,
              isOwner: typeof item.isOwner === 'boolean' ? item.isOwner : true,
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

      return deduplicateKnowledgeBase(migratedItems);
    }
    return [];
  } catch (error) {
    console.error(`Failed to load items from localStorage key "${key}"`, error);
    localStorage.removeItem(key);
    return [];
  }
};

// Generic save function with compression
const saveItemsToStorage = (key: string, items: KnowledgeBaseEntry[]): void => {
  try {
    const cleanItems = deduplicateKnowledgeBase(items);
    const jsonString = JSON.stringify(cleanItems);

    // Compress the data using pako
    const compressed = pako.deflate(jsonString);
    
    // Convert Uint8Array to a binary string iteratively to avoid stack overflow with large data sets.
    // The previous method using String.fromCharCode.apply() fails on large arrays.
    let binaryString = '';
    for (let i = 0; i < compressed.length; i++) {
        binaryString += String.fromCharCode(compressed[i]);
    }
    const compressedString = btoa(binaryString);
    
    // Add prefix to identify compressed data
    localStorage.setItem(key, `pako:${compressedString}`);

  } catch (error) {
    console.error(`Failed to save items to localStorage key "${key}"`, error);
    // Add specific check for QuotaExceededError
    if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.message.toLowerCase().includes('exceeded the quota'))) {
        alert(`Storage Limit Reached!\n\nThe data for "${key}" is too large to be saved in your browser, even after compression. Please export some of your data and clear it to free up space.`);
    }
  }
};


// Generic import function
const importItems = (jsonString: string, currentItems: KnowledgeBaseEntry[], defaultIsOwner: boolean): KnowledgeBaseUpdateResult => {
    let importedEntries;
    try {
        importedEntries = JSON.parse(jsonString);
        if (!Array.isArray(importedEntries)) {
            throw new Error("Imported data is not a valid JSON array.");
        }
    } catch (error) {
        console.error("Failed to parse imported JSON:", error);
        throw new Error(`Import failed during parsing: ${(error as Error).message}`);
    }

    const validatedNewEntries: Omit<KnowledgeBaseEntry, 'id'>[] = importedEntries.map(item => ({
        isOwner: typeof item.isOwner === 'boolean' ? item.isOwner : defaultIsOwner,
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
    
    const combinedKb = [...currentItems, ...validatedNewEntries.map(e => ({...e, id: `import-${Date.now()}-${Math.random()}`}))];
    const finalKb = deduplicateKnowledgeBase(combinedKb);

    const addedCount = finalKb.length - currentItems.length;

    return { updatedKb: finalKb, addedCount: Math.max(0, addedCount), updatedCount: 0, conflicts: [] };
};

// --- Main Knowledge Base (Portfolio) Functions ---

export const getKnowledgeBase = (): KnowledgeBaseEntry[] => loadItemsFromStorage(KB_STORAGE_KEY);
export const saveKnowledgeBase = (kb: KnowledgeBaseEntry[]): void => {
    const ownedEntries = kb.filter(e => e.isOwner);
    saveItemsToStorage(KB_STORAGE_KEY, ownedEntries);
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

// --- Pinned Ideas Functions ---

export const getPinnedIdeas = (): KnowledgeBaseEntry[] => loadItemsFromStorage(PINNED_IDEAS_STORAGE_KEY);
export const savePinnedIdeas = (ideas: KnowledgeBaseEntry[]): void => saveItemsToStorage(PINNED_IDEAS_STORAGE_KEY, ideas);
export const removePinnedIdea = (id: string): KnowledgeBaseEntry[] => {
  let ideas = getPinnedIdeas().filter(idea => idea.id !== id);
  savePinnedIdeas(ideas);
  return ideas;
};
export const addPinnedIdea = (idea: KnowledgeBaseEntry): KnowledgeBaseEntry[] => {
    const ideas = getPinnedIdeas();
    const newIdea = { ...idea, id: `idea-${Date.now()}-${Math.random()}` };
    const updatedIdeas = [...ideas, newIdea];
    savePinnedIdeas(updatedIdeas);
    return getPinnedIdeas();
};


// --- Prior Art Library Functions ---
export const getPriorArtLibrary = (): KnowledgeBaseEntry[] => loadItemsFromStorage(PRIOR_ART_LIBRARY_KEY);
export const savePriorArtLibrary = (library: KnowledgeBaseEntry[]): void => saveItemsToStorage(PRIOR_ART_LIBRARY_KEY, library);
export const removePriorArtLibraryEntry = (id: string): KnowledgeBaseEntry[] => {
  let library = getPriorArtLibrary().filter(entry => entry.id !== id);
  savePriorArtLibrary(library);
  return library;
};

// --- Consolidated Import/Export ---
export const exportFullKnowledgeBase = (): string => {
  const fullKb: FullKnowledgeBase = {
    portfolio: getKnowledgeBase(),
    priorArtLibrary: getPriorArtLibrary(),
    pinnedIdeas: getPinnedIdeas(),
  };
  return JSON.stringify(fullKb, null, 2);
};

export const importFullKnowledgeBase = (jsonString: string): { success: boolean, message: string } => {
  try {
    if (!jsonString || jsonString.trim() === '') {
        throw new Error("Import file is empty or contains only whitespace.");
    }
    const parsedData = JSON.parse(jsonString);

    if (!parsedData) {
        throw new Error("Imported JSON file is null or empty.");
    }

    // Check for the new, consolidated object format
    if (
      typeof parsedData === 'object' &&
      !Array.isArray(parsedData) &&
      'portfolio' in parsedData &&
      'priorArtLibrary' in parsedData &&
      'pinnedIdeas' in parsedData &&
      Array.isArray(parsedData.portfolio) &&
      Array.isArray(parsedData.priorArtLibrary) &&
      Array.isArray(parsedData.pinnedIdeas)
    ) {
      const fullKb = parsedData as FullKnowledgeBase;
      // This is a full restore, so we overwrite existing data.
      saveKnowledgeBase(fullKb.portfolio);
      savePriorArtLibrary(fullKb.priorArtLibrary);
      savePinnedIdeas(fullKb.pinnedIdeas);

      const counts = `Portfolio: ${fullKb.portfolio.length}, Library: ${fullKb.priorArtLibrary.length}, Ideas: ${fullKb.pinnedIdeas.length}`;
      return { success: true, message: `Successfully imported full knowledge base. Counts: ${counts}.` };
    }
    
    // Check for legacy, array-based format
    else if (Array.isArray(parsedData)) {
      console.warn("A legacy, array-based backup file was imported. Merging its contents into the current portfolio as a fallback.");
      const legacyEntries = parsedData as KnowledgeBaseEntry[];
      
      const currentPortfolio = getKnowledgeBase();
      const combined = [...currentPortfolio, ...legacyEntries];
      const finalPortfolio = deduplicateKnowledgeBase(combined);
      saveKnowledgeBase(finalPortfolio);

      const addedCount = finalPortfolio.length - currentPortfolio.length;
      return { success: true, message: `Imported legacy file and merged ${Math.max(0, addedCount)} entries into your main Portfolio.` };
    }

    // If neither format matches, it's an error.
    else {
      throw new Error("Invalid knowledge base file format. The file must be a JSON object with 'portfolio', 'priorArtLibrary', and 'pinnedIdeas' arrays, or a simple JSON array of portfolio entries.");
    }
  } catch (error) {
    console.error("Failed to import full knowledge base:", error);
    return { success: false, message: `Import failed: ${sanitizeMessage(error)}` };
  }
};


// DEPRECATED single-store functions for backward compatibility with App Manager, to be removed.
export const exportKnowledgeBase = (): string => JSON.stringify(getKnowledgeBase(), null, 2);
export const importKnowledgeBase = (jsonString: string): KnowledgeBaseUpdateResult => {
    const result = importItems(jsonString, getKnowledgeBase(), true);
    saveKnowledgeBase(result.updatedKb);
    return { ...result, updatedKb: getKnowledgeBase() };
};
export const exportPinnedIdeas = (): string => JSON.stringify(getPinnedIdeas(), null, 2);
export const importPinnedIdeas = (jsonString: string): KnowledgeBaseUpdateResult => {
    const result = importItems(jsonString, getPinnedIdeas(), true);
    savePinnedIdeas(result.updatedKb);
    return { ...result, updatedKb: getPinnedIdeas() };
};
export const exportPriorArtLibrary = (): string => JSON.stringify(getPriorArtLibrary(), null, 2);
export const importPriorArtLibrary = (jsonString: string): KnowledgeBaseUpdateResult => {
    const result = importItems(jsonString, getPriorArtLibrary(), false); // Prior art is not "owned"
    savePriorArtLibrary(result.updatedKb);
    return { ...result, updatedKb: getPriorArtLibrary() };
};
