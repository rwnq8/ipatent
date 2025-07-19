import { useReducer, useCallback, useEffect } from 'react';
import { processUploadedFiles } from '../services/fileParserService';
import {
  generateNonProvisionalPatentApplication,
  generateProvisionalPatentApplication,
  extractPortfolioEntriesFromBatch,
  extractInventions,
  generatePatentabilityReport,
  reviewProvisionalApplication,
  simulateProsecution,
  refinePatentApplication,
} from '../services/geminiService';
import {
  getKnowledgeBase,
  removeKnowledgeBaseEntry,
  saveKnowledgeBase,
  getPinnedIdeas,
  savePinnedIdeas,
  removePinnedIdea,
  addPinnedIdea,
  getPriorArtLibrary,
  savePriorArtLibrary,
  removePriorArtLibraryEntry,
  exportFullKnowledgeBase,
  importFullKnowledgeBase,
} from '../services/knowledgeBaseService';
import { sanitizeMessage, normalizeApplicationNumber, sanitizeForFilename } from '../services/utils';
import { AppState, Action, KnowledgeBaseEntry, KnowledgeBaseUpdateResult, PatentAnalysisReport, ExtractedInvention, PatentApplication } from '../types';


const IS_API_KEY_CONFIGURED = !!process.env.API_KEY;

const initialState: AppState = {
  status: 'idle',
  uploadedFiles: [],
  processedFileContents: [],
  extractedInventions: null,
  selectedInvention: null,
  patentAnalysisReport: null,
  patentApplication: null,
  applicationReviewReport: null,
  ownedKnowledgeBase: [],
  pinnedIdeas: [],
  discoveredPriorArt: [],
  priorArtLibrary: [],
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
        
        if (entryToAdd.priorityTo && !existingEntry.priorityTo) {
            updatedEntry.priorityTo = entryToAdd.priorityTo;
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

const stripPriorArtFromReport = (markdownContent: string): string => {
    if (!markdownContent) return '';
    let cleanedContent = markdownContent;

    const section2StartMarker = '## Section 2: Prior Art Search & Analysis';
    const section3StartMarker = '## Section 3: Strategic Landscape & Opportunities';

    const startIndex = cleanedContent.indexOf(section2StartMarker);
    if (startIndex !== -1) {
        const endIndex = cleanedContent.indexOf(section3StartMarker, startIndex);
        
        if (endIndex !== -1) {
            cleanedContent = cleanedContent.substring(0, startIndex) + cleanedContent.substring(endIndex);
        } else {
            cleanedContent = cleanedContent.substring(0, startIndex);
        }
    }
    return cleanedContent.trim();
};


const appReducer = (state: AppState, action: Action): AppState => {
  switch (action.type) {
    case 'SET_FILES':
      return {
        ...initialState, // Reset state on new file selection
        ownedKnowledgeBase: state.ownedKnowledgeBase,
        pinnedIdeas: state.pinnedIdeas,
        priorArtLibrary: state.priorArtLibrary,
        apiKeyErrorDismissed: state.apiKeyErrorDismissed,
        uploadedFiles: action.payload,
      };
    case 'PARSE_START':
      return { ...state, status: 'parsing', error: null, success: null, extractedInventions: null, patentApplication: null };
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
        return {
            ...state,
            selectedInvention: action.payload,
        };
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

      const newPinnedIdea: KnowledgeBaseEntry = { ...entryToPin, isOwner: true, priorityTo: undefined };
      const updatedIdeas = [...state.pinnedIdeas, newPinnedIdea];
      savePinnedIdeas(updatedIdeas);
      
      const newDiscoveredPriorArt = state.discoveredPriorArt.filter(e => e.id !== action.payload);
      
      return {
          ...state,
          pinnedIdeas: getPinnedIdeas(),
          discoveredPriorArt: newDiscoveredPriorArt,
          success: `"${newPinnedIdea.title}" pinned as an idea for exploration.`,
      };
    }
    case 'GENERATE_REPORT_START':
      return { ...state, status: 'generatingReport', error: null, success: null };
    case 'GENERATE_REPORT_SUCCESS': {
      const { report, priorArt } = action.payload;
      const updatedLibrary = [...state.priorArtLibrary, ...priorArt];
      savePriorArtLibrary(updatedLibrary);
      return { 
        ...state, 
        status: 'reportReady', 
        patentAnalysisReport: report, 
        discoveredPriorArt: priorArt, 
        priorArtLibrary: getPriorArtLibrary(), // reload to get deduped version
        success: "Patentability report generated successfully." 
      };
    }
    case 'UPDATE_REPORT_CONTENT':
      if (!state.patentAnalysisReport) return state;
      return {
          ...state,
          patentAnalysisReport: {
              ...state.patentAnalysisReport,
              markdownContent: action.payload
          },
          success: "Report content updated."
      };
    case 'GENERATE_APP_START':
      return { ...state, status: 'generatingApplication', error: null, success: null };
    case 'REVIEW_APP_START':
      return { ...state, status: 'reviewingApplication' };
    case 'GENERATE_APP_SUCCESS':
      const { application, reviewReport } = action.payload;
      return { ...state, status: 'applicationReady', patentApplication: application, applicationReviewReport: reviewReport, success: `Draft of ${application.type} application generated successfully.` };
    case 'REFINE_APP_START':
        return { ...state, status: 'refiningApplication', error: null, success: null };
    case 'REFINE_APP_SUCCESS':
        const { refinedApplication, newReviewReport } = action.payload;
        return { ...state, status: 'applicationReady', patentApplication: refinedApplication, applicationReviewReport: newReviewReport, success: 'Application draft refined by AI and re-analyzed.' };
    case 'START_NEW_ANALYSIS':
        return { 
            ...state,
            status: 'inventionsReadyForSelection', 
            patentApplication: null, 
            patentAnalysisReport: null,
            selectedInvention: null,
            discoveredPriorArt: [],
            error: null,
            success: null,
        };
    case 'START_NEW_DRAFT':
        return {
            ...state,
            status: 'reportReady',
            patentApplication: null,
            applicationReviewReport: null,
            error: null,
            success: null,
        };
    case 'REMOVE_KB_ENTRY': {
        const updatedKb = removeKnowledgeBaseEntry(action.payload);
        return { ...state, ownedKnowledgeBase: updatedKb, success: "Portfolio entry and its descendants removed." };
    }
    case 'INITIALIZE_KB':
      return { ...state, ownedKnowledgeBase: action.payload };
    case 'ADD_KB_ENTRY': {
        const updatedKb = [...state.ownedKnowledgeBase, action.payload];
        saveKnowledgeBase(updatedKb);
        return { ...state, ownedKnowledgeBase: getKnowledgeBase(), success: `Entry "${action.payload.title}" added.` };
    }
    case 'IMPORT_KB_SUCCESS': {
        const { updatedKb, addedCount } = action.payload;
        return { ...state, ownedKnowledgeBase: updatedKb, success: `Knowledge base imported. ${addedCount} new entries added.`, error: null };
    }
    case 'UPDATE_KB_ENTRY': {
        const updatedKb = state.ownedKnowledgeBase.map(entry => entry.id === action.payload.id ? action.payload : entry);
        saveKnowledgeBase(updatedKb);
        return { ...state, ownedKnowledgeBase: getKnowledgeBase(), success: `Entry "${action.payload.title}" updated.` };
    }
    case 'INITIALIZE_PINNED_IDEAS':
        return { ...state, pinnedIdeas: action.payload };
    case 'ADD_PINNED_IDEA': {
        const updatedIdeas = addPinnedIdea(action.payload);
        return { ...state, pinnedIdeas: updatedIdeas, success: `Idea "${action.payload.title}" added.` };
    }
    case 'REMOVE_PINNED_IDEA': {
        const updatedIdeas = removePinnedIdea(action.payload);
        return { ...state, pinnedIdeas: updatedIdeas, success: "Pinned idea removed." };
    }
    case 'UPDATE_PINNED_IDEA': {
        const updatedIdeas = state.pinnedIdeas.map(idea => idea.id === action.payload.id ? action.payload : idea);
        savePinnedIdeas(updatedIdeas);
        return { ...state, pinnedIdeas: getPinnedIdeas(), success: `Pinned idea "${action.payload.title}" updated.` };
    }
    case 'IMPORT_PINNED_IDEAS_SUCCESS': {
        const { updatedKb, addedCount } = action.payload;
        return { ...state, pinnedIdeas: updatedKb, success: `Pinned ideas imported. ${addedCount} new ideas added.`, error: null };
    }
    case 'INITIALIZE_PRIOR_ART_LIBRARY':
      return { ...state, priorArtLibrary: action.payload };
    case 'REMOVE_PRIOR_ART_LIBRARY_ENTRY': {
      const updatedLibrary = removePriorArtLibraryEntry(action.payload);
      return { ...state, priorArtLibrary: updatedLibrary, success: 'Prior art entry removed from library.' };
    }
    case 'UPDATE_PRIOR_ART_LIBRARY_ENTRY': {
      const updatedLibrary = state.priorArtLibrary.map(entry => entry.id === action.payload.id ? action.payload : entry);
      savePriorArtLibrary(updatedLibrary);
      return { ...state, priorArtLibrary: getPriorArtLibrary(), success: `Prior art entry "${action.payload.title}" updated.` };
    }
    case 'IMPORT_PRIOR_ART_LIBRARY_SUCCESS': {
      const { updatedKb, addedCount } = action.payload;
      return { ...state, priorArtLibrary: updatedKb, success: `Prior Art Library imported. ${addedCount} new entries added.`, error: null };
    }
    case 'SET_ASYNC_ERROR': {
      const message = sanitizeMessage(action.payload);
      // Reset to a stable, non-loading state
      const nextStatus = state.status === 'refiningApplication' ? 'applicationReady'
                       : state.status === 'generatingApplication' || state.status === 'reviewingApplication' ? 'reportReady' 
                       : state.status === 'generatingReport' ? 'inventionsReadyForSelection' 
                       : 'idle';
      return { ...state, status: nextStatus, error: message };
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
    dispatch({ type: 'INITIALIZE_PINNED_IDEAS', payload: getPinnedIdeas() });
    dispatch({ type: 'INITIALIZE_PRIOR_ART_LIBRARY', payload: getPriorArtLibrary() });
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

  const handleFilesSelected = useCallback((files: File[]) => dispatch({ type: 'SET_FILES', payload: files }), [dispatch]);

  const handleGenerateReport = useCallback(async (inventionToAnalyze: ExtractedInvention) => {
      dispatch({ type: 'GENERATE_REPORT_START' });
      try {
        const { report, priorArt } = await generatePatentabilityReport(inventionToAnalyze, state.ownedKnowledgeBase, state.priorArtLibrary);
        dispatch({ type: 'GENERATE_REPORT_SUCCESS', payload: { report, priorArt } });
      } catch (err) {
        dispatch({ type: 'SET_ASYNC_ERROR', payload: err });
      }
  }, [state.ownedKnowledgeBase, state.priorArtLibrary, dispatch]);

  const handleInventionSelection = useCallback((invention: ExtractedInvention | null) => {
    dispatch({ type: 'SELECT_INVENTION', payload: invention });
    if (invention) {
      // Immediately trigger the report generation upon selection.
      handleGenerateReport(invention);
    }
  }, [dispatch, handleGenerateReport]);

  const handleGenerateApplication = useCallback(async (type: 'provisional' | 'non-provisional') => {
    if (!state.selectedInvention || !state.patentAnalysisReport) {
        dispatch({ type: 'SET_ERROR', payload: "An analyzed invention and report are required." });
        return;
    }
    
    dispatch({ type: 'GENERATE_APP_START' });
    try {
      const generator = type === 'provisional' ? generateProvisionalPatentApplication : generateNonProvisionalPatentApplication;
      
      // CRITICAL FIX: Create a cleaned version of the report without prior art to avoid context leakage.
      const cleanedReportForDrafting: PatentAnalysisReport = {
          ...state.patentAnalysisReport,
          markdownContent: stripPriorArtFromReport(state.patentAnalysisReport.markdownContent),
      };

      const application = await generator(state.selectedInvention, cleanedReportForDrafting);
      
      dispatch({ type: 'REVIEW_APP_START' });
      
      const reviewer = type === 'provisional' ? reviewProvisionalApplication : simulateProsecution;
      const reviewReport = await reviewer(application.markdownContent);

      dispatch({ type: 'GENERATE_APP_SUCCESS', payload: { application, reviewReport } });
    } catch (err) {
      dispatch({ type: 'SET_ASYNC_ERROR', payload: err });
    }
  }, [state.selectedInvention, state.patentAnalysisReport, dispatch]);

  const handleRefineApplication = useCallback(async () => {
    if (!state.patentApplication || !state.applicationReviewReport) {
        dispatch({ type: 'SET_ERROR', payload: "Application and review report are required to refine." });
        return;
    }
    
    dispatch({ type: 'REFINE_APP_START' });
    try {
        const refinedApplication = await refinePatentApplication(state.patentApplication, state.applicationReviewReport);
        
        const reviewer = refinedApplication.type === 'provisional' ? reviewProvisionalApplication : simulateProsecution;
        const newReviewReport = await reviewer(refinedApplication.markdownContent);

        dispatch({ type: 'REFINE_APP_SUCCESS', payload: { refinedApplication, newReviewReport } });
    } catch (err) {
      dispatch({ type: 'SET_ASYNC_ERROR', payload: err });
    }
  }, [state.patentApplication, state.applicationReviewReport, dispatch]);

  const startNewAnalysis = useCallback(() => {
    dispatch({ type: 'START_NEW_ANALYSIS' });
  }, [dispatch]);

  const startNewDraft = useCallback(() => {
    dispatch({ type: 'START_NEW_DRAFT' });
  }, [dispatch]);

  const handleRemoveKbEntry = useCallback((id: string) => dispatch({ type: 'REMOVE_KB_ENTRY', payload: id }), [dispatch]);
  const handleAddNewKbEntry = useCallback((entry: KnowledgeBaseEntry) => dispatch({ type: 'ADD_KB_ENTRY', payload: entry }), [dispatch]);
  
  const handleUpdateKbEntry = useCallback((entry: KnowledgeBaseEntry) => dispatch({ type: 'UPDATE_KB_ENTRY', payload: entry }), [dispatch]);
  
  // --- Pinned Ideas Handlers ---
  const handlePinPriorArt = useCallback((id: string) => dispatch({ type: 'PIN_PRIOR_ART', payload: id }), [dispatch]);
  const handleAddNewPinnedIdea = useCallback((entry: KnowledgeBaseEntry) => dispatch({ type: 'ADD_PINNED_IDEA', payload: entry }), [dispatch]);
  const handleRemovePinnedIdea = useCallback((id: string) => dispatch({ type: 'REMOVE_PINNED_IDEA', payload: id }), [dispatch]);
  const handleUpdatePinnedIdea = useCallback((entry: KnowledgeBaseEntry) => dispatch({ type: 'UPDATE_PINNED_IDEA', payload: entry }), [dispatch]);

  // --- Prior Art Library Handlers ---
  const handleRemovePriorArtLibraryEntry = useCallback((id: string) => dispatch({ type: 'REMOVE_PRIOR_ART_LIBRARY_ENTRY', payload: id }), [dispatch]);
  const handleUpdatePriorArtLibraryEntry = useCallback((entry: KnowledgeBaseEntry) => dispatch({ type: 'UPDATE_PRIOR_ART_LIBRARY_ENTRY', payload: entry }), [dispatch]);

  const handleExportFullKb = useCallback(() => {
    try {
      const jsonString = exportFullKnowledgeBase();
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      a.download = `patent_analyzer_full_backup_${timestamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      dispatch({ type: 'SET_SUCCESS', payload: "Full knowledge base exported successfully." });
    } catch (err) {
      dispatch({ type: 'SET_ASYNC_ERROR', payload: err });
    }
  }, [dispatch]);

  const handleImportFullKb = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = e.target?.result as string;
            if (!text) throw new Error("File is empty.");
            const result = importFullKnowledgeBase(text);
            if (!result.success) {
                throw new Error(result.message);
            }
            // Reload state from storage after import
            dispatch({ type: 'INITIALIZE_KB', payload: getKnowledgeBase() });
            dispatch({ type: 'INITIALIZE_PINNED_IDEAS', payload: getPinnedIdeas() });
            dispatch({ type: 'INITIALIZE_PRIOR_ART_LIBRARY', payload: getPriorArtLibrary() });
            dispatch({ type: 'SET_SUCCESS', payload: result.message });
        } catch (err) {
            dispatch({ type: 'SET_ASYNC_ERROR', payload: `Full import failed: ${sanitizeMessage(err)}` });
        }
    };
    reader.readAsText(file);
    (event.target as HTMLInputElement).value = '';
  }, [dispatch]);


  // --- Analysis Session Handlers ---
  const handleExportExtractedInventions = useCallback(() => {
      if (!state.extractedInventions) return;
      try {
        const inventionsAsKbEntries = state.extractedInventions.map((inv, i) => {
            return {
                title: inv.title,
                applicationNumber: `ANALYSIS-STUB-${Date.now()}-${i}`,
                filingDate: new Date().toISOString().split('T')[0],
                type: 'provisional',
                files: [{
                    name: `${sanitizeForFilename(inv.title)}.source.txt`,
                    content: inv.sourceContent,
                }],
                extractedEmbodiments: inv.claims.map(c => `(${c.type}) ${c.text}`),
                isComplete: true,
                notes: `[SAVED ANALYSIS STUB]\nDescription: ${inv.description}`,
            };
        });
        const jsonString = JSON.stringify(inventionsAsKbEntries, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `analysis_session_${timestamp}.inventions.json`;
        a.href = url;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        dispatch({ type: 'SET_SUCCESS', payload: 'Analysis session exported.' });
      } catch (err) {
          dispatch({ type: 'SET_ASYNC_ERROR', payload: err });
      }
  }, [state.extractedInventions, dispatch]);

  const handleImportExtractedInventions = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = e.target?.result as string;
            if (!text) throw new Error("File is empty.");
            const parsed = JSON.parse(text);
            if (!Array.isArray(parsed)) throw new Error("Imported file is not a valid invention list.");

            const inventions: ExtractedInvention[] = parsed.map((entry: any) => {
                if (!entry.notes?.includes('[SAVED ANALYSIS STUB]')) return null;
                const sourceContent = entry.files?.[0]?.content || '';
                if (!sourceContent) return null;

                return {
                    title: entry.title,
                    description: (entry.notes || '').replace('[SAVED ANALYSIS STUB]\nDescription: ', '').trim(),
                    sourceContent: sourceContent,
                    claims: (entry.extractedEmbodiments || []).map((claimText: string) => {
                        const match = claimText.match(/^\((explicit|inferred)\)\s(.*)/);
                        return match 
                            ? { text: match[2], type: match[1] as 'explicit' | 'inferred', selected: true }
                            : { text: claimText, type: 'inferred', selected: true };
                    }),
                };
            }).filter((inv): inv is ExtractedInvention => !!inv);

            if (inventions.length === 0) throw new Error("No valid analysis stubs found in file.");
            
            dispatch({ type: 'EXTRACT_INVENTIONS_SUCCESS', payload: inventions });
            dispatch({ type: 'SET_SUCCESS', payload: `Successfully loaded ${inventions.length} inventions from session file.` });
        } catch(err) {
            dispatch({ type: 'SET_ASYNC_ERROR', payload: `Failed to load analysis session: ${sanitizeMessage(err)}` });
        }
    };
    reader.readAsText(file);
    (event.target as HTMLInputElement).value = '';
  }, [dispatch]);

  const handleAcceptSuggestion = useCallback((index: number) => dispatch({ type: 'ACCEPT_SUGGESTION', payload: index }), [dispatch]);
  const handleDismissSuggestion = useCallback((index: number) => dispatch({ type: 'DISMISS_SUGGESTION', payload: index }), [dispatch]);
  const handleDismissAllSuggestions = useCallback(() => dispatch({ type: 'DISMISS_ALL_SUGGESTIONS' }), [dispatch]);
  const handleUpdateReportContent = useCallback((content: string) => dispatch({ type: 'UPDATE_REPORT_CONTENT', payload: content }), [dispatch]);
  
  const getLoadingMessage = (status: AppState['status']): string => {
    switch (status) {
        case 'parsing': return 'Parsing files...';
        case 'extractingInventions': return 'Identifying distinct inventions from documents...';
        case 'generatingReport': return 'Performing deep analysis and generating patentability report... This may take several minutes.';
        case 'generatingApplication': return 'Generating application draft... This may take several minutes.';
        case 'reviewingApplication': return 'Performing automated review of the draft...';
        case 'refiningApplication': return 'Revising application based on AI review... This may take a minute.';
        default: return '';
    }
  }

  const isLoading = ['parsing', 'extractingInventions', 'generatingReport', 'generatingApplication', 'reviewingApplication', 'refiningApplication'].includes(state.status);

  return {
    // State
    status: state.status,
    isLoading,
    loadingMessage: getLoadingMessage(state.status),
    error: state.error,
    success: state.success,
    apiKeyErrorDismissed: state.apiKeyErrorDismissed,
    patentAnalysisReport: state.patentAnalysisReport,
    patentApplication: state.patentApplication,
    applicationReviewReport: state.applicationReviewReport,
    ownedKnowledgeBase: state.ownedKnowledgeBase,
    pinnedIdeas: state.pinnedIdeas,
    discoveredPriorArt: state.discoveredPriorArt,
    priorArtLibrary: state.priorArtLibrary,
    suggestedPortfolioEntries: state.suggestedPortfolioEntries,
    extractedInventions: state.extractedInventions,
    selectedInvention: state.selectedInvention,
    
    // Setters
    setApiKeyErrorDismissed: useCallback(() => dispatch({ type: 'DISMISS_API_KEY_ERROR' }), [dispatch]),
    setError: useCallback((message: string | null) => dispatch({ type: 'SET_ERROR', payload: message }), [dispatch]),
    setSuccess: useCallback((message: string | null) => dispatch({ type: 'SET_SUCCESS', payload: message }), [dispatch]),
    
    // Handlers
    handleFilesSelected,
    handleInventionSelection,
    handleGenerateApplication,
    handleRefineApplication,
    handleUpdateReportContent,
    startNewAnalysis,
    startNewDraft,
    handleRemoveKbEntry,
    handleAddNewKbEntry,
    handleUpdateKbEntry,
    handlePinPriorArt,
    handleAcceptSuggestion,
    handleDismissSuggestion,
    handleDismissAllSuggestions,
    handleAddNewPinnedIdea,
    handleRemovePinnedIdea,
    handleUpdatePinnedIdea,
    handleRemovePriorArtLibraryEntry,
    handleUpdatePriorArtLibraryEntry,
    handleExportExtractedInventions,
    handleImportExtractedInventions,
    handleExportFullKb,
    handleImportFullKb,
  };
};
