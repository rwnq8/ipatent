




import { useReducer, useCallback, useEffect } from 'react';
import { processUploadedFiles } from '../services/fileParserService';
import {
  generateNonProvisionalPatentApplication,
  generateProvisionalPatentApplication,
  extractPortfolioEntriesFromBatch,
  extractInventions,
  analyzeAndRefineInvention,
} from '../services/geminiService';
import {
  getKnowledgeBase,
  removeKnowledgeBaseEntry,
  exportKnowledgeBase,
  importKnowledgeBase,
  saveKnowledgeBase,
} from '../services/knowledgeBaseService';
import { sanitizeMessage, normalizeApplicationNumber } from '../services/utils';
import { AppState, Action, KnowledgeBaseEntry, KnowledgeBaseUpdateResult, GradedClaim } from '../types';


const IS_API_KEY_CONFIGURED = !!process.env.API_KEY;

const initialState: AppState = {
  status: 'idle',
  uploadedFiles: [],
  processedFileContents: [],
  extractedInventions: null,
  selectedInventionIndex: null,
  analyzedInvention: null,
  patentApplication: null,
  ownedKnowledgeBase: [],
  discoveredPriorArt: [],
  suggestedPortfolioEntries: [],
  error: null,
  success: null,
  apiKeyErrorDismissed: false,
};

/**
 * Merges a new or suggested entry into the knowledge base.
 */
const mergeEntryIntoKb = (kb: KnowledgeBaseEntry[], entryToAdd: KnowledgeBaseEntry, updateSource: 'suggestion' | 'pin'): { updatedKb: KnowledgeBaseEntry[], successMsg: string } => {
    const normalizedAppNum = normalizeApplicationNumber(entryToAdd.applicationNumber);
    const existingEntryIndex = kb.findIndex(e => normalizeApplicationNumber(e.applicationNumber) === normalizedAppNum && normalizedAppNum !== '');

    let updatedKb;
    let successMsg;

    if (existingEntryIndex > -1) {
        const existingEntry = kb[existingEntryIndex];
        const updatedEntry: KnowledgeBaseEntry = { 
            ...existingEntry,
            files: [...(existingEntry.files || [])],
            extractedClaims: [...(existingEntry.extractedClaims || [])],
            extractedEmbodiments: [...(existingEntry.extractedEmbodiments || [])],
        };
        
        if (entryToAdd.title && entryToAdd.title !== "Untitled") updatedEntry.title = entryToAdd.title;
        if (entryToAdd.filingDate) updatedEntry.filingDate = entryToAdd.filingDate;
        if (entryToAdd.isComplete) updatedEntry.isComplete = true;
        
        const existingFileNames = new Set(updatedEntry.files.map(f => f.name));
        (entryToAdd.files || []).forEach(newFile => {
            if (newFile && !existingFileNames.has(newFile.name)) updatedEntry.files.push(newFile);
        });

        const existingClaims = new Set(updatedEntry.extractedClaims);
        (entryToAdd.extractedClaims || []).forEach(newClaim => {
            if (newClaim && !existingClaims.has(newClaim)) updatedEntry.extractedClaims.push(newClaim);
        });

        const existingEmbodiments = new Set(updatedEntry.extractedEmbodiments);
        (entryToAdd.extractedEmbodiments || []).forEach(newEmbodiment => {
            if (newEmbodiment && !existingEmbodiments.has(newEmbodiment)) updatedEntry.extractedEmbodiments.push(newEmbodiment);
        });

        if (entryToAdd.notes && !(updatedEntry.notes || '').includes(entryToAdd.notes)) {
            const notePrefix = updateSource === 'pin' ? '[Update from Prior Art]' : '[Update from Suggestion]';
            updatedEntry.notes = `${updatedEntry.notes || ''}\n\n${notePrefix}: ${entryToAdd.notes}`.trim();
        }
        
        updatedKb = kb.map((e, i) => i === existingEntryIndex ? updatedEntry : e);
        successMsg = `Existing entry "${updatedEntry.title}" updated with new information.`;
    } else {
        const newEntry: KnowledgeBaseEntry = { ...entryToAdd, isOwner: true, files: entryToAdd.files || [], extractedClaims: entryToAdd.extractedClaims || [], extractedEmbodiments: entryToAdd.extractedEmbodiments || [] };
        updatedKb = [...kb, newEntry];
        successMsg = `Entry "${newEntry.title}" added to portfolio.`;
    }
    return { updatedKb, successMsg };
};

const getGradeStrength = (grade: string): number => {
    const lowerGrade = grade.toLowerCase();
    if (lowerGrade.includes('green')) return 4;
    if (lowerGrade.includes('yellow')) return 3;
    if (lowerGrade.includes('red')) return 2;
    if (lowerGrade.includes('black')) return 1;
    return 0;
};

const appReducer = (state: AppState, action: Action): AppState => {
  switch (action.type) {
    case 'SET_FILES':
      return {
        ...initialState, // Reset state on new file selection
        ownedKnowledgeBase: state.ownedKnowledgeBase,
        apiKeyErrorDismissed: state.apiKeyErrorDismissed,
        uploadedFiles: action.payload,
      };
    case 'PARSE_START':
      return { ...state, status: 'parsing', error: null, success: null, extractedInventions: null, analyzedInvention: null, patentApplication: null };
    case 'PARSE_COMPLETE': {
      const { successfulFiles, errors } = action.payload;
      let errorMessage: string | null = null;
      if (errors.length > 0) {
        errorMessage = `Could not process some files:\n${errors.map(e => `- ${e.fileName}: ${e.message}`).join('\n')}`;
      }
      return { ...state, processedFileContents: successfulFiles, error: errorMessage };
    }
    case 'EXTRACT_INVENTIONS_START':
        return { ...state, status: 'extractingInventions' };
    case 'EXTRACT_INVENTIONS_SUCCESS':
        return { ...state, status: 'inventionsReadyForSelection', extractedInventions: action.payload };
    case 'SELECT_INVENTION':
        return { ...state, selectedInventionIndex: action.payload };
    case 'ANALYZE_INVENTION_START':
        return { ...state, status: 'analyzingInvention' };
    case 'ANALYZE_INVENTION_SUCCESS': {
        const processedAnalysis = JSON.parse(JSON.stringify(action.payload));
        
        // Auto-apply revisions for weak claims
        processedAnalysis.gradedClaims.forEach((claim: GradedClaim) => {
            if (claim.suggestedRevision && claim.revisionJustification) {
                const grade = claim.grade.toLowerCase();
                 if (grade.includes('red') || grade.includes('black')) {
                    claim.originalText = claim.text;
                    claim.originalJustification = claim.justification;
                    claim.text = claim.suggestedRevision;
                    claim.justification = claim.revisionJustification;
                    claim.grade = "B (Yellow - Moderate) [Auto-Revised]";
                    delete claim.suggestedRevision;
                    delete claim.revisionJustification;
                }
            }
        });

        // Sort claims by strength
        processedAnalysis.gradedClaims.sort((a: GradedClaim, b: GradedClaim) => {
            return getGradeStrength(b.grade) - getGradeStrength(a.grade);
        });
        
        // The `art` object from the API will only have a subset of properties.
        // We must manually construct a full `KnowledgeBaseEntry` to avoid downstream errors.
        const discoveredPriorArt: KnowledgeBaseEntry[] = (processedAnalysis.priorArt || []).map((art: Partial<KnowledgeBaseEntry>) => ({
            id: `kb-discovered-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            isOwner: false,
            title: art.title || 'Untitled Prior Art',
            applicationNumber: art.applicationNumber || 'N/A',
            filingDate: art.filingDate || '',
            type: art.type || 'non-provisional',
            notes: art.notes || '',
            priorityTo: art.priorityTo,
            // Ensure array properties are always initialized
            files: art.files || [],
            extractedClaims: art.extractedClaims || [],
            extractedEmbodiments: art.extractedEmbodiments || [],
            isComplete: typeof art.isComplete === 'boolean' ? art.isComplete : false,
        }));

        return { ...state, status: 'claimsReadyForReview', analyzedInvention: processedAnalysis, discoveredPriorArt };
    }
    case 'TOGGLE_GRADED_CLAIM': {
        if (!state.analyzedInvention) return state;
        const newAnalyzedInvention = JSON.parse(JSON.stringify(state.analyzedInvention));
        // The index is now relative to the *sorted* array in the state
        const claim = newAnalyzedInvention.gradedClaims[action.payload];
        if (claim) {
            claim.selected = !claim.selected;
        }
        return { ...state, analyzedInvention: newAnalyzedInvention };
    }
    case 'SUGGESTIONS_READY':
        return { ...state, suggestedPortfolioEntries: action.payload };
    case 'ACCEPT_SUGGESTION': {
      const suggestion = state.suggestedPortfolioEntries[action.payload];
      if (!suggestion) return state;
      const { sourceFiles, ...suggestionData } = suggestion;
      const entryToAdd: KnowledgeBaseEntry = {
          ...suggestionData,
          id: `kb-auto-${Date.now()}`,
          isOwner: true,
          files: sourceFiles.map(sf => ({ name: sf.name, content: sf.content })),
      };
      const { updatedKb, successMsg } = mergeEntryIntoKb(state.ownedKnowledgeBase, entryToAdd, 'suggestion');
      saveKnowledgeBase(updatedKb);
      return {
          ...state,
          ownedKnowledgeBase: updatedKb,
          suggestedPortfolioEntries: state.suggestedPortfolioEntries.filter((_, i) => i !== action.payload),
          success: successMsg
      };
    }
    case 'DISMISS_SUGGESTION':
      return { ...state, suggestedPortfolioEntries: state.suggestedPortfolioEntries.filter((_, i) => i !== action.payload) };
    case 'DISMISS_ALL_SUGGESTIONS':
        return { ...state, suggestedPortfolioEntries: [] };
    case 'PIN_PRIOR_ART': {
      const entryToPin = state.discoveredPriorArt.find(e => e.id === action.payload);
      if (!entryToPin) return state;

      const newOwnedEntry: KnowledgeBaseEntry = { ...entryToPin, isOwner: true };
      
      const { updatedKb, successMsg } = mergeEntryIntoKb(state.ownedKnowledgeBase, newOwnedEntry, 'pin');
      saveKnowledgeBase(updatedKb);
      
      const newDiscoveredPriorArt = state.discoveredPriorArt.filter(e => e.id !== action.payload);
      
      return {
          ...state,
          ownedKnowledgeBase: updatedKb,
          discoveredPriorArt: newDiscoveredPriorArt,
          success: successMsg,
      };
    }
    case 'GENERATE_APP_START':
      return { ...state, status: 'generatingApplication', error: null, success: null };
    case 'GENERATE_APP_SUCCESS':
      return { ...state, status: 'applicationReady', patentApplication: action.payload, success: `Draft of ${action.payload.type} application generated successfully.` };
    case 'REMOVE_KB_ENTRY': {
        const updatedKb = removeKnowledgeBaseEntry(action.payload);
        return { ...state, ownedKnowledgeBase: updatedKb, success: "Portfolio entry and its descendants removed." };
    }
    case 'INITIALIZE_KB':
      return { ...state, ownedKnowledgeBase: action.payload };
    case 'IMPORT_KB_SUCCESS': {
        const { updatedKb, addedCount } = action.payload;
        return { ...state, ownedKnowledgeBase: updatedKb, success: `Knowledge base imported. ${addedCount} new entries added.`, error: null };
    }
    case 'UPDATE_KB_ENTRY': {
        const updatedKb = state.ownedKnowledgeBase.map(entry => entry.id === action.payload.id ? action.payload : entry);
        saveKnowledgeBase(updatedKb);
        return { ...state, ownedKnowledgeBase: getKnowledgeBase(), success: `Entry "${action.payload.title}" updated.` };
    }
    case 'SET_ASYNC_ERROR': {
      const message = sanitizeMessage(action.payload);
      return { ...state, status: 'idle', error: message, selectedInventionIndex: null, analyzedInvention: null };
    }
    case 'SET_ERROR':
      return { ...state, status: 'idle', error: action.payload };
    case 'SET_SUCCESS':
      return { ...state, success: action.payload };
    case 'DISMISS_API_KEY_ERROR':
      return { ...state, apiKeyErrorDismissed: true };
    default:
      return state;
  }
};

export const useAppManager = () => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  useEffect(() => {
    dispatch({ type: 'INITIALIZE_KB', payload: getKnowledgeBase() });
  }, []);
  
  useEffect(() => {
    if (state.success) {
      const timer = setTimeout(() => dispatch({ type: 'SET_SUCCESS', payload: null }), 8000);
      return () => clearTimeout(timer);
    }
  }, [state.success]);
  useEffect(() => {
    if (state.error) {
      const timer = setTimeout(() => dispatch({ type: 'SET_ERROR', payload: null }), 15000);
      return () => clearTimeout(timer);
    }
  }, [state.error]);

  useEffect(() => {
    if (state.uploadedFiles.length === 0) return;
    
    const processAndExtract = async () => {
        dispatch({ type: 'PARSE_START' });
        try {
            const parsePayload = await processUploadedFiles(state.uploadedFiles);
            dispatch({ type: 'PARSE_COMPLETE', payload: parsePayload });
            
            if (!IS_API_KEY_CONFIGURED) {
                 dispatch({ type: 'SET_ERROR', payload: 'API Key not set. Cannot proceed.'});
                 return;
            }

            if (parsePayload.successfulFiles.length > 0) {
                dispatch({ type: 'EXTRACT_INVENTIONS_START' });
                const inventions = await extractInventions(parsePayload.successfulFiles);
                dispatch({ type: 'EXTRACT_INVENTIONS_SUCCESS', payload: inventions });
                
                const suggestions = await extractPortfolioEntriesFromBatch(parsePayload.successfulFiles);
                const currentKb = getKnowledgeBase();
                const kbMap = new Map(currentKb.map(e => [normalizeApplicationNumber(e.applicationNumber), e]));
                const newUniqueSuggestions = suggestions.filter(s => {
                  const normalizedNewAppNum = normalizeApplicationNumber(s.applicationNumber);
                  if (!normalizedNewAppNum) return false;
                  if (!kbMap.has(normalizedNewAppNum)) return true;
                  const existingEntry = kbMap.get(normalizedNewAppNum)!;
                  return !existingEntry.isComplete && s.isComplete;
                });
                dispatch({ type: 'SUGGESTIONS_READY', payload: newUniqueSuggestions });
            }
        } catch (err) {
            dispatch({ type: 'SET_ASYNC_ERROR', payload: err });
        }
    };
    
    processAndExtract();
    
  }, [state.uploadedFiles]);

  const handleFilesSelected = useCallback((files: File[]) => dispatch({ type: 'SET_FILES', payload: files }), []);

  const handleInventionSelection = useCallback(async (index: number) => {
    if (!state.extractedInventions) return;
    dispatch({ type: 'SELECT_INVENTION', payload: index });
    dispatch({ type: 'ANALYZE_INVENTION_START' });
    try {
      const inventionToAnalyze = state.extractedInventions[index];
      const result = await analyzeAndRefineInvention(inventionToAnalyze, state.ownedKnowledgeBase);
      dispatch({ type: 'ANALYZE_INVENTION_SUCCESS', payload: result });
    } catch (err) {
      dispatch({ type: 'SET_ASYNC_ERROR', payload: err });
    }
  }, [state.extractedInventions, state.ownedKnowledgeBase]);

  const handleToggleGradedClaim = useCallback((claimIndex: number) => {
    dispatch({ type: 'TOGGLE_GRADED_CLAIM', payload: claimIndex });
  }, []);
  
  const handleGenerateApplication = useCallback(async (type: 'provisional' | 'non-provisional') => {
    if (!state.analyzedInvention) {
        dispatch({ type: 'SET_ERROR', payload: "An analyzed invention is required." });
        return;
    }
    const selectedClaims: GradedClaim[] = state.analyzedInvention.gradedClaims
        .filter(c => c.selected);

    if (selectedClaims.length === 0 && type === 'non-provisional') {
        dispatch({ type: 'SET_ERROR', payload: "At least one graded claim must be selected to generate a non-provisional application." });
        return;
    }

    dispatch({ type: 'GENERATE_APP_START' });
    try {
      const generator = type === 'provisional' ? generateProvisionalPatentApplication : generateNonProvisionalPatentApplication;
      const generatedApplication = await generator(state.analyzedInvention, selectedClaims, state.ownedKnowledgeBase);
      dispatch({ type: 'GENERATE_APP_SUCCESS', payload: generatedApplication });
    } catch (err) {
      dispatch({ type: 'SET_ASYNC_ERROR', payload: err });
    }
  }, [state.analyzedInvention, state.ownedKnowledgeBase]);

  const goBackToClaimReview = useCallback(() => {
    if(state.analyzedInvention) {
        // Reset application but keep the analysis to allow generating the other type
        dispatch({ type: 'GENERATE_APP_SUCCESS', payload: { type: 'provisional', markdownContent: '' } }); // hack to clear application
        dispatch({ type: 'ANALYZE_INVENTION_SUCCESS', payload: state.analyzedInvention });
    }
  }, [state.analyzedInvention]);

  const handleRemoveKbEntry = useCallback((id: string) => dispatch({ type: 'REMOVE_KB_ENTRY', payload: id }), []);
  
  const handleExportKb = useCallback(() => {
    try {
      const jsonString = exportKnowledgeBase();
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      a.download = `patent_portfolio_knowledge_base_${timestamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      dispatch({ type: 'SET_SUCCESS', payload: "Knowledge base exported successfully." });
    } catch (err) {
      dispatch({ type: 'SET_ASYNC_ERROR', payload: err });
    }
  }, []);

  const handleImportKb = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) throw new Error("File is empty.");
        const result = importKnowledgeBase(text);
        dispatch({ type: 'IMPORT_KB_SUCCESS', payload: result });
      } catch (err) {
        dispatch({ type: 'SET_ASYNC_ERROR', payload: err });
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }, []);

  const handleUpdateKbEntry = useCallback((entry: KnowledgeBaseEntry) => dispatch({ type: 'UPDATE_KB_ENTRY', payload: entry }), []);
  const handlePinPriorArt = useCallback((id: string) => dispatch({ type: 'PIN_PRIOR_ART', payload: id }), []);
  const handleAcceptSuggestion = useCallback((index: number) => dispatch({ type: 'ACCEPT_SUGGESTION', payload: index }), []);
  const handleDismissSuggestion = useCallback((index: number) => dispatch({ type: 'DISMISS_SUGGESTION', payload: index }), []);
  const handleDismissAllSuggestions = useCallback(() => dispatch({ type: 'DISMISS_ALL_SUGGESTIONS' }), []);
  
  const getLoadingMessage = (status: AppState['status']): string => {
    switch (status) {
        case 'parsing': return 'Parsing files...';
        case 'extractingInventions': return 'Identifying distinct inventions from documents...';
        case 'analyzingInvention': return `Performing deep analysis... This includes a prior art search and may take several minutes.`;
        case 'generatingApplication': return 'Generating application draft... This may take several minutes.';
        default: return '';
    }
  }

  const isLoading = ['parsing', 'extractingInventions', 'analyzingInvention', 'generatingApplication'].includes(state.status);

  return {
    // State
    status: state.status,
    isLoading,
    loadingMessage: getLoadingMessage(state.status),
    error: state.error,
    success: state.success,
    apiKeyErrorDismissed: state.apiKeyErrorDismissed,
    patentApplication: state.patentApplication,
    ownedKnowledgeBase: state.ownedKnowledgeBase,
    discoveredPriorArt: state.discoveredPriorArt,
    suggestedPortfolioEntries: state.suggestedPortfolioEntries,
    extractedInventions: state.extractedInventions,
    analyzedInvention: state.analyzedInvention,
    
    // Setters
    setApiKeyErrorDismissed: useCallback(() => dispatch({ type: 'DISMISS_API_KEY_ERROR' }), []),
    setError: useCallback((message: string | null) => dispatch({ type: 'SET_ERROR', payload: message }), []),
    setSuccess: useCallback((message: string | null) => dispatch({ type: 'SET_SUCCESS', payload: message }), []),
    
    // Handlers
    handleFilesSelected,
    handleInventionSelection,
    handleToggleGradedClaim,
    handleGenerateApplication,
    goBackToClaimReview,
    handleRemoveKbEntry,
    handleExportKb,
    handleImportKb,
    handleUpdateKbEntry,
    handlePinPriorArt,
    handleAcceptSuggestion,
    handleDismissSuggestion,
    handleDismissAllSuggestions,
  };
};
