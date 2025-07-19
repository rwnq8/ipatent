

export interface ProcessedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  content: string; // Parsed text content
}

export interface FileProcessingResult {
  successfulFiles: ProcessedFile[];
  errors: { fileName: string; message: string }[];
}

export interface GeneratedFigure {
  figureNumber: number;
  description: string;
  imageUrl: string; // data:image/png;base64,...
}

export interface PatentApplication {
  type: 'provisional' | 'non-provisional';
  markdownContent: string;
  figures?: GeneratedFigure[];
}

export interface KnowledgeBaseFile {
  name: string;
  content: string;
}

export interface KnowledgeBaseEntry {
  id: string;
  isOwner: boolean; // Flag to distinguish user's portfolio from discovered prior art
  type: 'provisional' | 'non-provisional';
  title: string;
  applicationNumber: string;
  filingDate: string; // "YYYY-MM-DD"
  priorityTo?: string; // ID of the KB Entry it claims priority to
  files: KnowledgeBaseFile[];
  extractedClaims: string[];
  extractedEmbodiments: string[]; // For provisional applications
  isComplete: boolean; // True if the source document was a full specification
  notes: string;
}

/**
 * Defines a portfolio entry suggested from an uploaded file, before it's accepted by the user.
 */
export interface SuggestedPortfolioEntry extends Omit<KnowledgeBaseEntry, 'id' | 'isOwner' | 'files'> {
  sourceFiles: {
    id: string;
    name: string;
    content: string;
  }[];
}

/**
 * Defines the result of a non-destructive update to the knowledge base.
 */
export interface KnowledgeBaseUpdateResult {
  updatedKb: KnowledgeBaseEntry[];
  addedCount: number;
  updatedCount: number;
  conflicts: string[];
}


// --- Types for unused components being fixed ---
export interface GroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
  retrievedContext?: {
    text?: string;
  };
  retrievalQuery?: string;
}

export interface PatentAnalysisReport {
  markdownContent: string;
  groundingMetadata?: {
    groundingChunks?: GroundingChunk[];
    webSearchQueries?: string[];
  };
}


// --- Types for the new single-invention workflow ---
export interface ExtractedClaim {
  text: string;
  type: 'explicit' | 'inferred';
  selected: boolean;
}

export interface ExtractedInvention {
  title: string;
  description: string;
  claims: ExtractedClaim[];
  // Used to retain the full context for the deep analysis phase
  sourceContent: string;
}

// --- State Machine Types for useAppManager ---

export type AppStatus =
  | 'idle'
  | 'parsing'
  | 'extractingInventions'
  | 'inventionsReadyForSelection'
  | 'generatingReport'
  | 'reportReady'
  | 'generatingApplication'
  | 'applicationReady';


export interface AppState {
  status: AppStatus;
  uploadedFiles: File[];
  processedFileContents: ProcessedFile[];
  extractedInventions: ExtractedInvention[] | null;
  selectedInvention: ExtractedInvention | null;
  patentAnalysisReport: PatentAnalysisReport | null;
  patentApplication: PatentApplication | null;
  ownedKnowledgeBase: KnowledgeBaseEntry[];
  pinnedIdeas: KnowledgeBaseEntry[];
  discoveredPriorArt: KnowledgeBaseEntry[];
  suggestedPortfolioEntries: SuggestedPortfolioEntry[];
  error: string | null;
  success: string | null;
  apiKeyErrorDismissed: boolean;
}

export type Action =
  | { type: 'SET_FILES'; payload: File[] }
  | { type: 'PARSE_START' }
  | { type: 'PARSE_COMPLETE'; payload: { successfulFiles: ProcessedFile[], errors: { fileName: string; message: string }[] } }
  | { type: 'EXTRACT_INVENTIONS_START' }
  | { type: 'EXTRACT_INVENTIONS_SUCCESS'; payload: ExtractedInvention[] }
  | { type: 'SELECT_INVENTION'; payload: number }
  | { type: 'SUGGESTIONS_READY'; payload: SuggestedPortfolioEntry[] }
  | { type: 'ACCEPT_SUGGESTION'; payload: number }
  | { type: 'DISMISS_SUGGESTION'; payload: number }
  | { type: 'DISMISS_ALL_SUGGESTIONS' }
  | { type: 'PIN_PRIOR_ART'; payload: string }
  | { type: 'GENERATE_REPORT_START' }
  | { type: 'GENERATE_REPORT_SUCCESS'; payload: PatentAnalysisReport }
  | { type: 'GENERATE_APP_START' }
  | { type: 'GENERATE_APP_SUCCESS'; payload: PatentApplication }
  | { type: 'START_NEW_ANALYSIS' }
  | { type: 'REMOVE_KB_ENTRY'; payload: string }
  | { type: 'IMPORT_KB_SUCCESS'; payload: KnowledgeBaseUpdateResult }
  | { type: 'INITIALIZE_KB'; payload: KnowledgeBaseEntry[] }
  | { type: 'ADD_KB_ENTRY'; payload: KnowledgeBaseEntry }
  | { type: 'UPDATE_KB_ENTRY'; payload: KnowledgeBaseEntry }
  | { type: 'INITIALIZE_PINNED_IDEAS'; payload: KnowledgeBaseEntry[] }
  | { type: 'REMOVE_PINNED_IDEA'; payload: string }
  | { type: 'UPDATE_PINNED_IDEA'; payload: KnowledgeBaseEntry }
  | { type: 'IMPORT_PINNED_IDEAS_SUCCESS'; payload: KnowledgeBaseUpdateResult }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_ASYNC_ERROR'; payload: unknown }
  | { type: 'SET_SUCCESS'; payload: string | null }
  | { type: 'DISMISS_API_KEY_ERROR' };