
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

export interface GroundingChunkWeb {
  uri?: string; // Made optional to match @google/genai type
  title?: string;
}

export interface GroundingChunk {
  web?: GroundingChunkWeb;
  retrievalQuery?: string;
  retrievedContext?: { text: string }; // Changed from string to object { text: string }
  // Other types of chunks might exist
}

export interface GroundingMetadata {
  groundingChunks?: GroundingChunk[];
  searchQueries?: string[];
  // other search-related metadata
}

export interface PatentAnalysisReport {
  markdownContent: string;
  groundingMetadata?: GroundingMetadata;
}

export interface PatentApplication {
  type: 'provisional' | 'non-provisional';
  markdownContent: string;
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
  notes: string;
}

/**
 * Defines the shape of the data structure the AI is asked to return
 * when structuring the knowledge base from uploaded files.
 */
export interface StructuredKnowledgeBaseData {
    title: string;
    applicationNumber: string;
    filingDate: string;
    type: 'provisional' | 'non-provisional';
    extractedClaims: string[];
    fileNames: string[];
    notes: string;
    priorityTo?: string; // Application number it claims priority to
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
