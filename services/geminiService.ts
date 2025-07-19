



import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { GEMINI_MODEL_TEXT } from '../constants';
import { ProcessedFile, PatentApplication, KnowledgeBaseEntry, SuggestedPortfolioEntry, ExtractedInvention, AnalyzedInvention, GradedClaim, GeneratedFigure } from "../types";
import { sanitizeForApi } from "./utils";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error("Gemini API Key is not configured. Please set the API_KEY environment variable.");
}

const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;

let guideContentCache: string | null = null;

/**
 * Fetches the patent drafting best practices guide and caches it for subsequent use.
 * This content is used as a system instruction for the AI.
 * @returns {Promise<string>} The markdown content of the guide.
 */
const getBestPracticesGuideContent = async (): Promise<string> => {
    if (guideContentCache) {
        return guideContentCache;
    }
    try {
        const response = await fetch('/PATENT_DRAFTING_BEST_PRACTICES.md');
        if (!response.ok) {
            console.error(`Failed to fetch guide: ${response.statusText}`);
            // Return a minimal error message to be included in the prompt, so the failure is obvious
            return "CRITICAL ERROR: The main patent drafting guide could not be loaded. The following output may be incomplete or of low quality.";
        }
        const text = await response.text();
        guideContentCache = text;
        return text;
    } catch (error) {
        console.error("Could not load best practices guide for system prompt:", error);
        return `CRITICAL ERROR: The main patent drafting guide could not be loaded due to a network or parsing error: ${(error as Error).message}. The following output may be incomplete or of low quality.`;
    }
};

/**
 * Defines the structure for patent metadata expected from the Gemini API when analyzing a BATCH of files.
 */
interface PatentMetadataFromBatch {
  title: string;
  applicationNumber: string;
  filingDate: string; // YYYY-MM-DD
  type: 'provisional' | 'non-provisional';
  extractedClaims: string[];
  extractedEmbodiments: string[];
  isComplete: boolean;
  sourceFilenames: string[]; // Critical for mapping back to original files
}

/**
 * Analyzes a batch of document texts to extract and consolidate structured patent metadata.
 * It can correlate information across multiple files for a single patent application.
 * @param processedFiles An array of file objects with their name and text content.
 * @returns An array of SuggestedPortfolioEntry, ready for user review.
 */
export const extractPortfolioEntriesFromBatch = async (processedFiles: ProcessedFile[]): Promise<SuggestedPortfolioEntry[]> => {
    if (!ai) {
      throw new Error("Gemini API client is not initialized.");
    }
    if (!processedFiles || processedFiles.length === 0) {
      return [];
    }

    const fileContentBlock = processedFiles.map(file => 
      `--- DOCUMENT: ${file.name} ---\n${sanitizeForApi(file.content).substring(0, 80000)}` // Sanitize and then truncate
    ).join('\n\n');

    const prompt = `You are an intelligent patent docketing assistant working within a complete, self-contained patent engine. Your primary function is to analyze documents to build a comprehensive knowledge base for patent prosecution. Analyze the following batch of documents. Each document is separated by "--- DOCUMENT: [filename] ---".

Your task is to identify all unique patent applications mentioned. Information for a single application might be spread across multiple files (e.g., an application number in a filing receipt and the title in the specification). You must correlate this information and merge it into a single, consolidated entry for each unique application.

Return your findings as a single JSON array, where each object in the array represents one unique patent application and has the following structure:
- title: The title of the invention.
- applicationNumber: The application or patent number. Standardize it if possible (e.g., US 12/345,678).
- filingDate: The primary filing or priority date in YYYY-MM-DD format.
- type: Either "provisional" or "non-provisional".
- extractedClaims: For NON-PROVISIONAL applications, an array of strings, with each string being a single, verbatim claim from the "CLAIMS" section. Return an empty array if no formal claims are found or for provisional applications.
- extractedEmbodiments: **CRITICAL for PROVISIONAL applications.** Adopt the most liberal interpretation of the text possible. Your goal is to extract every sentence, phrase, or concept that could *possibly* be used to support a future non-provisional claim, even if not explicitly labeled as an "embodiment" or "claim". Extract any text describing a feature, function, component, process step, alternative, or advantage. Be exhaustive to ensure no potential priority material is missed. For non-provisional applications, this should be an empty array.
- isComplete: A boolean flag. Set to true if the text from the source file(s) appears to be a full and detailed specification. Set to false if it seems to be only an abstract, summary, receipt, or is otherwise clearly incomplete.
- sourceFilenames: An array of strings containing the exact filenames of ALL documents that contributed information to this consolidated entry.

If a document does not appear to be patent-related or is part of an already identified application, do not create a separate entry for it.
If no patent-related documents are found at all, return an empty array [].

Your entire response must be ONLY the JSON array. All string values within the JSON, especially for titles, claims, and embodiments, must be properly escaped to handle special characters like quotes (") and backslashes (\\). Do not include any other text, explanations, or markdown fences.

--- BATCH OF DOCUMENTS ---
${fileContentBlock}
--- END BATCH OF DOCUMENTS ---
`;
    const patentMetadataSchema = {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "The title of the invention." },
        applicationNumber: { type: Type.STRING, description: "The application or patent number." },
        filingDate: { type: Type.STRING, description: "The filing date in YYYY-MM-DD format." },
        type: { type: Type.STRING, enum: ['provisional', 'non-provisional'] },
        extractedClaims: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Verbatim claims from the document."
        },
        extractedEmbodiments: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Potential claimable subject matter from a provisional."
        },
        isComplete: { type: Type.BOOLEAN, description: "True if the document appears to be a full specification." },
        sourceFilenames: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Filenames that contributed to this entry."
        }
      },
      required: ['title', 'applicationNumber', 'filingDate', 'type', 'extractedClaims', 'extractedEmbodiments', 'isComplete', 'sourceFilenames']
    };

    const batchResponseSchema = {
      type: Type.ARRAY,
      description: "An array of all unique patent applications found in the documents.",
      items: patentMetadataSchema
    };

    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: GEMINI_MODEL_TEXT,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: batchResponseSchema,
                temperature: 0.0,
            },
        });

        let jsonStr = response.text.trim();

        if (!jsonStr) {
            return [];
        }

        if (jsonStr.startsWith("```json")) {
            jsonStr = jsonStr.substring(7);
            if (jsonStr.endsWith("```")) {
                jsonStr = jsonStr.slice(0, -3);
            }
        }
        jsonStr = jsonStr.trim();
        
        if (!jsonStr || !jsonStr.startsWith('[')) {
            console.warn(`Gemini API returned a non-array JSON or non-JSON response for batch extraction: ${jsonStr}`);
            return [];
        }

        const parsedData = JSON.parse(jsonStr) as PatentMetadataFromBatch[];

        if (!Array.isArray(parsedData)) {
          console.error("Gemini API returned non-array data for batch extraction:", parsedData);
          return [];
        }

        const suggestions: SuggestedPortfolioEntry[] = [];
        const filesByName = new Map(processedFiles.map(f => [f.name, f]));

        for (const item of parsedData) {
            if (item.applicationNumber && item.sourceFilenames && item.sourceFilenames.length > 0) {
                const sourceFiles = item.sourceFilenames
                    .map(filename => filesByName.get(filename))
                    .filter((file): file is ProcessedFile => !!file)
                    .map(file => ({ id: file.id, name: file.name, content: file.content }));

                if (sourceFiles.length > 0) {
                    suggestions.push({
                        title: item.title || "Untitled",
                        applicationNumber: item.applicationNumber,
                        filingDate: item.filingDate || "",
                        type: item.type || 'non-provisional',
                        extractedClaims: item.extractedClaims || [],
                        extractedEmbodiments: item.extractedEmbodiments || [],
                        isComplete: item.isComplete || false,
                        notes: "Automatically suggested from uploaded document(s).",
                        priorityTo: undefined,
                        sourceFiles: sourceFiles,
                    });
                }
            }
        }
        return suggestions;

    } catch (error) {
        console.error("Error calling Gemini API for batch metadata extraction:", error);
        return [];
    }
};

export const extractInventions = async (processedFiles: ProcessedFile[]): Promise<ExtractedInvention[]> => {
    if (!ai) throw new Error("Gemini API client is not initialized.");
    if (!processedFiles || processedFiles.length === 0) return [];

    const fileContentBlock = processedFiles.map(file => 
      `--- DOCUMENT: ${file.name} ---\n${sanitizeForApi(file.content).substring(0, 100000)}`
    ).join('\n\n');

    const prompt = `You are an expert patent analyst. Your task is to dissect the provided documents to identify distinct inventions.

Analyze the following batch of documents. Assume by default that all content pertains to a single invention unless there are clear, unambiguous indicators of separate, unrelated inventions (e.g., completely different technical fields).

For each distinct invention you identify, you must:
1.  Generate a concise title for the invention.
2.  Write a brief, one-paragraph description summarizing the invention's core concept.
3.  Extract two types of claims:
    a.  **'explicit' claims:** These are formally numbered claims found verbatim in a "CLAIMS" section of the documents.
    b.  **'inferred' claims:** This is critical. Scour the entire text (abstract, summary, detailed description, embodiments) for sentences or phrases that describe a specific feature, function, component, process, or advantage that could be formulated into a formal claim later. Be exhaustive. This is about capturing every potentially patentable idea.

Return your findings as a single JSON array of "invention" objects. The entire response must be ONLY this JSON array, with no other text, explanations, or markdown fences.

--- BATCH OF DOCUMENTS ---
${fileContentBlock}
--- END BATCH OF DOCUMENTS ---
`;

    const claimsSchema = {
      type: Type.OBJECT,
      properties: {
        text: { type: Type.STRING, description: "The full text of the claim." },
        type: { type: Type.STRING, enum: ['explicit', 'inferred'] },
      },
      required: ['text', 'type'],
    };

    const inventionSchema = {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "A concise title for the invention." },
        description: { type: Type.STRING, description: "A brief summary of the invention." },
        claims: {
            type: Type.ARRAY,
            description: "An array of all explicit and inferred claims for this invention.",
            items: claimsSchema,
        },
      },
      required: ['title', 'description', 'claims'],
    };

    const responseSchema = {
      type: Type.ARRAY,
      description: "An array of all unique inventions found in the documents.",
      items: inventionSchema,
    };

    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: GEMINI_MODEL_TEXT,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                temperature: 0.1,
            },
        });

        let jsonStr = response.text.trim();
        if (jsonStr.startsWith("```json")) {
            jsonStr = jsonStr.substring(7);
            if (jsonStr.endsWith("```")) {
                jsonStr = jsonStr.slice(0, -3);
            }
        }
        jsonStr = jsonStr.trim();
        
        const parsedData = JSON.parse(jsonStr) as any[];

        if (!Array.isArray(parsedData)) {
            throw new Error("Parsed data for invention extraction is not an array.");
        }

        return parsedData.map(item => ({
            title: item.title || "Untitled Invention",
            description: item.description || "No description provided.",
            claims: Array.isArray(item.claims) ? item.claims.map((claim: any) => ({
                text: claim.text || "Invalid claim text",
                type: (claim.type === 'explicit' || claim.type === 'inferred') ? claim.type : 'inferred',
                selected: true,
            })) : [],
            sourceContent: fileContentBlock, // Pass the full context along
        }));

    } catch (error) {
        console.error("Error calling Gemini API for invention extraction:", error);
        throw new Error(`Failed to extract inventions from documents: ${(error as Error).message}`);
    }
};

/**
 * First-pass analysis to get the summary and prior art for an invention.
 * This is called once per analysis.
 */
async function _getInventionAnalysisAndPriorArt(invention: ExtractedInvention, knowledgeBase: KnowledgeBaseEntry[]): Promise<{ analysisSummary: string, priorArt: Omit<KnowledgeBaseEntry, 'id'>[] }> {
    if (!ai) throw new Error("Gemini API client is not initialized.");
    
    const prompt = `
**Role:** World-Class Patent Attorney & Prior Art Specialist.

**Mission:** You will perform a high-level analysis of an invention. Your goal is to conduct a prior art search and provide an overall patentability summary. You will NOT grade individual claims in this step.

**Context: Knowledge Base (User's Own IP Portfolio)**
This information is for context ONLY. It is NOT prior art for rejecting the user's claims.
${formatKnowledgeBaseForPrompt(knowledgeBase)}
---

**Invention to Analyze:**
Title: ${invention.title}
Description: ${invention.description}
Full Disclosure Text (for context):
${invention.sourceContent.substring(0, 150000)}
---

**TASK & OUTPUT INSTRUCTIONS**

You will generate a single JSON object. This is your only output.

**JSON OUTPUT STRUCTURE:**
{
  "analysisSummary": "A one-paragraph summary of the overall patentability landscape for this invention based on your search.",
  "priorArt": [
    {
      "title": "...",
      "applicationNumber": "...",
      "filingDate": "...",
      "type": "'provisional' or 'non-provisional'",
      "notes": "A brief explanation of relevance."
    }
  ]
}

**CRITICAL REQUIREMENT:**
- Your entire response MUST be the JSON object described above, and nothing else.
- Do not write any introduction, summary, or text before the opening '{' of the JSON object.
`;
    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL_TEXT,
            contents: prompt,
            config: {
                temperature: 0.2,
                tools: [{ googleSearch: {} }],
            }
        });
        
        let jsonStr = response.text.trim();
        const firstBracket = jsonStr.indexOf('{');
        const lastBracket = jsonStr.lastIndexOf('}');
        if (firstBracket !== -1 && lastBracket > firstBracket) {
            jsonStr = jsonStr.substring(firstBracket, lastBracket + 1);
        }
        
        const parsedData = JSON.parse(jsonStr);
        return {
            analysisSummary: parsedData.analysisSummary || "No summary provided.",
            priorArt: parsedData.priorArt || [],
        };
    } catch (error) {
        console.error("Error during prior art analysis:", error);
        throw new Error(`Failed to perform prior art analysis: ${(error as Error).message}`);
    }
}


/**
 * Second-pass analysis to grade a small chunk of claims using the context from the first pass.
 * This is called multiple times in a loop.
 */
async function _gradeClaimChunk(
    claimsToGrade: { id: number; text: string; type: string; }[], 
    invention: ExtractedInvention, 
    analysisContext: { analysisSummary: string, priorArt: Omit<KnowledgeBaseEntry, 'id'>[] }
): Promise<GradedClaim[]> {
    if (!ai) throw new Error("Gemini API client is not initialized.");

    const prompt = `
**Role:** World-Class Patent Attorney & Prior Art Specialist.

**Mission:** You will perform a focused analysis on a small batch of invention claims. Your goal is to provide a patentability assessment for **EACH** provided claim and suggest improvements for weak claims, based on the provided prior art context.

**Overall Invention Context:**
Title: ${invention.title}
Description: ${invention.description}

**Prior Art & Analysis Summary (for context ONLY):**
Summary: ${analysisContext.analysisSummary}
Prior Art Found: ${analysisContext.priorArt.map(p => p.applicationNumber).join(', ') || 'None'}
---

**Claims/Embodiments Batch to Evaluate (Count: ${claimsToGrade.length}):**
\`\`\`json
${JSON.stringify(claimsToGrade, null, 2)}
\`\`\`
---

**TASK & OUTPUT INSTRUCTIONS**

You will generate a single JSON array named \`gradedClaims\`. This is your only output.
Each object in the array MUST correspond to a claim from the input batch, in the same order.

**JSON ARRAY ITEM STRUCTURE:**
{
  "text": "The verbatim text of the original claim.",
  "type": "The verbatim type ('explicit' or 'inferred') of the original claim.",
  "grade": "Your patentability assessment grade (e.g., 'A (Green - Strong)', 'B (Yellow - Moderate)', 'C (Red - Weak)', 'F (Black - Unpatentable)').",
  "justification": "A brief explanation for the grade, referencing the provided prior art context if applicable.",
  "suggestedRevision": "CRITICAL: If grade is 'C' or 'F', you MUST provide an improved version of the claim text here to make it patentable (aim for a 'B' grade). Otherwise, this must be null.",
  "revisionJustification": "If you provided a 'suggestedRevision', you MUST explain here why your changes improve patentability. Otherwise, this must be null."
}

**CRITICAL REQUIREMENT:**
- The JSON array MUST contain exactly ${claimsToGrade.length} objects.
- Your entire response MUST be a single JSON array, starting with '[' and ending with ']'. Do not wrap it in a parent object or add any other text.
`;

    const gradedClaimSchema = {
        type: Type.OBJECT,
        properties: {
            text: { type: Type.STRING },
            type: { type: Type.STRING },
            grade: { type: Type.STRING },
            justification: { type: Type.STRING },
            suggestedRevision: { type: Type.STRING },
            revisionJustification: { type: Type.STRING },
        },
        required: ['text', 'type', 'grade', 'justification']
    };

    const responseSchema = {
        type: Type.ARRAY,
        items: gradedClaimSchema
    };

    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL_TEXT,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema,
                temperature: 0.2,
            }
        });

        const jsonStr = response.text.trim();
        const parsedData = JSON.parse(jsonStr) as any[];
        
        if (!Array.isArray(parsedData) || parsedData.length !== claimsToGrade.length) {
            console.error(`Claim chunk grading failed. Expected ${claimsToGrade.length}, got ${parsedData.length}.`);
            throw new Error(`Claim chunk grading failed. Expected ${claimsToGrade.length}, got ${parsedData.length}.`);
        }
        
        return parsedData.map(gc => ({
            ...gc,
            selected: true,
            suggestedRevision: gc.suggestedRevision || undefined,
            revisionJustification: gc.revisionJustification || undefined,
        }));
        
    } catch (error) {
        console.error("Error during claim chunk grading:", error);
        throw new Error(`Failed to grade claim chunk: ${(error as Error).message}`);
    }
}


export const analyzeAndRefineInvention = async (invention: ExtractedInvention, knowledgeBase: KnowledgeBaseEntry[]): Promise<AnalyzedInvention> => {
    if (!ai) throw new Error("Gemini API client is not initialized.");

    // Step 1: Get overall analysis and prior art
    const analysisContext = await _getInventionAnalysisAndPriorArt(invention, knowledgeBase);

    // Step 2: Grade claims in chunks for robustness
    const allClaims = invention.claims.map((claim, index) => ({
        id: index,
        text: claim.text,
        type: claim.type
    }));
    
    const CHUNK_SIZE = 20; // Process 20 claims at a time for reliability
    const allGradedClaims: GradedClaim[] = [];

    for (let i = 0; i < allClaims.length; i += CHUNK_SIZE) {
        const chunk = allClaims.slice(i, i + CHUNK_SIZE);
        console.log(`Grading claims ${i + 1} to ${i + chunk.length} of ${allClaims.length}...`);
        const gradedChunk = await _gradeClaimChunk(chunk, invention, analysisContext);
        
        if (gradedChunk.length !== chunk.length) {
            // This check is critical for ensuring the AI followed instructions for the chunk
            throw new Error(`Critical Error: Claim grading chunk failed. The AI did not return the correct number of graded claims for a batch. Expected ${chunk.length}, but received ${gradedChunk.length}.`);
        }
        allGradedClaims.push(...gradedChunk);
    }
    
    if (allGradedClaims.length !== allClaims.length) {
         // Final sanity check
         throw new Error(`Critical Error: Final claim count mismatch after chunking. Expected ${allClaims.length}, got ${allGradedClaims.length}. Please try again.`);
    }

    return {
        originalInvention: invention,
        analysisSummary: analysisContext.analysisSummary,
        priorArt: analysisContext.priorArt,
        gradedClaims: allGradedClaims,
    };
};


const formatKnowledgeBaseForPrompt = (kb: KnowledgeBaseEntry[]): string => {
  if (!kb || kb.length === 0) {
    return "The user has not provided an existing IP portfolio.";
  }
  const MAX_KB_ENTRY_CONTENT_LENGTH = 20000;
  return `\n--- START USER KNOWLEDGE BASE ---\n${kb.map(entry => `
**Portfolio Entry: "${entry.title}"**
- Application Number: ${entry.applicationNumber}
- Filing Date: ${entry.filingDate}
- Type: ${entry.type}
- Content Snippet:
\`\`\`text
${sanitizeForApi(entry.files[0]?.content || 'Content not available.').substring(0, MAX_KB_ENTRY_CONTENT_LENGTH)}
\`\`\`
`).join('\n---\n')}\n--- END USER KNOWLEDGE BASE ---\n`;
};


const generateFiguresForApplication = async (markdownContent: string, sourceContent: string): Promise<GeneratedFigure[] | undefined> => {
    if (!ai) return undefined;

    // Quick pre-check to see if figure generation is even plausible
    const hasFigureReference = /\b(fig|figure)\b\.?\s*\d+/i.test(markdownContent);
    if (!hasFigureReference) {
        return undefined;
    }

    try {
        console.log("Figure references found, initiating figure generation workflow...");

        // Step 1: Get a list of figures to generate
        const listFiguresPrompt = `Analyze the provided patent application text and its original source material. Identify all explicit and implicit references to figures (e.g., FIG. 1, figure 2, item 102, reference numeral 24).
Return a JSON array of objects. Each object must represent a single figure and have the following structure:
{
  "figureNumber": <integer>,
  "description": "A detailed, one-sentence description of what this specific figure should illustrate, mentioning all key components and their reference numerals as described in the text."
}
If no figures or reference numerals are mentioned, return an empty array []. Your response must be ONLY the JSON array.

--- APPLICATION TEXT ---
${markdownContent.substring(0, 50000)}

--- SOURCE MATERIAL ---
${sourceContent.substring(0, 50000)}
`;
        const figureListResponse = await ai.models.generateContent({
            model: GEMINI_MODEL_TEXT,
            contents: listFiguresPrompt,
            config: { responseMimeType: "application/json" }
        });

        const figureListStr = figureListResponse.text.trim();
        const figuresToGenerate = JSON.parse(figureListStr) as { figureNumber: number, description: string }[];

        if (!figuresToGenerate || figuresToGenerate.length === 0) {
            console.log("AI analysis concluded no figures needed.");
            return undefined;
        }
        console.log(`AI identified ${figuresToGenerate.length} figures to generate.`);

        const generatedFigures: GeneratedFigure[] = [];

        for (const fig of figuresToGenerate) {
            // Step 2: Generate a specialized prompt for the image model
            const imagePromptGenPrompt = `You are an expert prompt engineer for a text-to-image model that creates patent drawings. Based on the following description, create a single, concise prompt for the 'imagen-3.0-generate-002' model.

The prompt MUST command the model to create a formal, USPTO-compliant patent line drawing.
Key requirements for the output image:
- Black lines on a plain white background.
- NO shading, gradients, or colors.
- Use clear, simple, solid lines.
- All components mentioned in the description must be clearly drawn.
- All reference numerals mentioned must be included as clear, legible labels pointing to the correct component.
- The style should be that of a technical schematic or block diagram.

Description: "${fig.description}"

Your entire output must be ONLY the generated prompt text for the image model.`;

            const imagePromptResponse = await ai.models.generateContent({
                model: GEMINI_MODEL_TEXT,
                contents: imagePromptGenPrompt,
            });
            const imagePrompt = imagePromptResponse.text;
            console.log(`Generated image prompt for FIG. ${fig.figureNumber}:`, imagePrompt);

            // Step 3: Generate the image
            const imageResponse = await ai.models.generateImages({
                model: 'imagen-3.0-generate-002',
                prompt: imagePrompt,
                config: {
                    numberOfImages: 1,
                    outputMimeType: 'image/png',
                    aspectRatio: '4:3',
                },
            });
            
            const base64ImageBytes = imageResponse.generatedImages[0].image.imageBytes;
            const imageUrl = `data:image/png;base64,${base64ImageBytes}`;

            generatedFigures.push({
                figureNumber: fig.figureNumber,
                description: fig.description,
                imageUrl: imageUrl,
            });
            console.log(`Successfully generated image for FIG. ${fig.figureNumber}.`);
        }

        return generatedFigures.sort((a,b) => a.figureNumber - b.figureNumber);

    } catch (error) {
        console.error("Error during figure generation workflow:", error);
        // Don't block application generation if figures fail
        return undefined;
    }
};

/**
 * A robust helper function to generate a specific section of a patent application.
 * It enforces a JSON response from the model to guarantee structure.
 * @param prompt The specific prompt for the section.
 * @param schema The response schema to enforce.
 * @param systemInstruction The overall system instruction/guide.
 * @returns The content of the generated section as a string.
 */
const generateSection = async (prompt: string, schema: any, systemInstruction: string): Promise<string> => {
    if (!ai) throw new Error("Gemini API client not initialized.");
    let responseTextForError = "No response text available.";
    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL_TEXT,
            contents: prompt,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: schema,
                temperature: 0.3,
            }
        });

        let jsonStr = response.text.trim();
        responseTextForError = jsonStr; // Capture for potential error logging

        // Defensive stripping of markdown fences if the model adds them
        if (jsonStr.startsWith("```json")) {
            jsonStr = jsonStr.substring(7);
            if (jsonStr.endsWith("```")) {
                jsonStr = jsonStr.slice(0, -3);
            }
        }
        jsonStr = jsonStr.trim();
        
        const parsed = JSON.parse(jsonStr);
        return parsed.content || '';
    } catch (error) {
        console.error("Failed to generate section:", error);
        // Return a noticeable error string to be included in the final doc for debugging
        return `[ERROR: This section could not be generated due to a JSON parsing issue. Reason: ${(error as Error).message}. Raw model output was: ${responseTextForError.substring(0, 500)}...]`;
    }
};

/**
 * Takes a block of text and programmatically prepends USPTO-compliant paragraph numbers.
 * @param text The block of text for a section (e.g., Background).
 * @param startNum The starting paragraph number.
 * @returns An object containing the numbered text and the next available paragraph number.
 */
const addParagraphNumbers = (text: string, startNum: number): { numberedText: string; nextNum: number } => {
    if (!text || !text.trim()) return { numberedText: text, nextNum: startNum };
    let currentNum = startNum;
    const lines = text.split('\n');
    const numberedLines = lines.map(line => {
        const trimmedLine = line.trim();
        // Add number only to non-empty lines that are not headings, lists, or already numbered.
        const isHeading = trimmedLine.startsWith('#');
        const isAlreadyNumbered = trimmedLine.startsWith('[');
        // Basic check for list items. More complex lists may not be caught but this handles common cases.
        const isListItem = /^\s*(\*|-|\d+\.)\s+/.test(line);

        if (trimmedLine.length > 0 && !isHeading && !isAlreadyNumbered && !isListItem) {
            const paraNum = `[${String(currentNum++).padStart(4, '0')}]`;
            return `${paraNum} ${line}`;
        }
        return line;
    });
    return { numberedText: numberedLines.join('\n'), nextNum: currentNum };
};

export const generateNonProvisionalPatentApplication = async (analyzedInvention: AnalyzedInvention, selectedClaims: GradedClaim[], knowledgeBase: KnowledgeBaseEntry[]): Promise<PatentApplication> => {
  if (!ai) throw new Error("Gemini API client is not initialized. Check API Key configuration.");
  if (!analyzedInvention || !selectedClaims || selectedClaims.length === 0) throw new Error("Analyzed invention data and selected claims are required.");

  const bestPracticesGuide = await getBestPracticesGuideContent();
  const selectedClaimsText = selectedClaims.map(c => c.text).join('\n');
  const basePromptContext = `
**Source Invention Full Disclosure:**
${analyzedInvention.originalInvention.sourceContent.substring(0, 150000)}

**Prior Art Analysis Summary:**
${analyzedInvention.analysisSummary}

**User-Selected "Best Mode" Independent Claims to build upon:**
${selectedClaimsText}
`;

  const systemInstruction = `${bestPracticesGuide}\n\n**Your Role:** You are the world-class patent attorney from the guide. Your task is to generate ONE specific section of a **non-provisional patent application** based on the provided context.`;
  const contentSchema = { type: Type.OBJECT, properties: { content: { type: Type.STRING } }, required: ['content'] };

  // Generate all section content first
  const titleContent = await generateSection(`Generate ONLY the "TITLE OF THE INVENTION" for the application.\n\n${basePromptContext}`, contentSchema, systemInstruction);
  const backgroundContent = await generateSection(`Generate ONLY the "BACKGROUND OF THE INVENTION" section text.\n\n${basePromptContext}`, contentSchema, systemInstruction);
  const summaryContent = await generateSection(`Generate ONLY the "SUMMARY OF THE INVENTION" section text.\n\n${basePromptContext}`, contentSchema, systemInstruction);
  const descriptionContent = await generateSection(`Generate ONLY the "DETAILED DESCRIPTION" section text. Be exhaustive and ensure full antecedent basis for all claim terms.\n\n${basePromptContext}`, contentSchema, systemInstruction);
  const claimsContent = await generateSection(`Generate ONLY the formal "CLAIMS" section. Take the user-selected claims, strengthen them, and add 3-5 dependent claims for each independent claim.\n\n${basePromptContext}`, contentSchema, systemInstruction);
  const abstractContent = await generateSection(`Generate ONLY the "ABSTRACT OF THE DISCLOSURE" section text.\n\n${basePromptContext}`, contentSchema, systemInstruction);
  
  // Create a combined context for better figure generation
  const fullSpecTextForFigGen = `${titleContent}\n${backgroundContent}\n${summaryContent}\n${descriptionContent}\n${claimsContent}`;
  const figures = await generateFiguresForApplication(fullSpecTextForFigGen, analyzedInvention.originalInvention.sourceContent);

  // Assemble the document programmatically and apply numbering in the correct order
  let markdownContent = ``;
  let paraCounter = 1;

  markdownContent += `TITLE OF THE INVENTION\n\n${titleContent}\n\n`;
  
  markdownContent += `BACKGROUND OF THE INVENTION\n\n`;
  const { numberedText: bgText, nextNum: bgNext } = addParagraphNumbers(backgroundContent, paraCounter);
  markdownContent += `${bgText}\n\n`;
  paraCounter = bgNext;

  markdownContent += `SUMMARY OF THE INVENTION\n\n`;
  const { numberedText: sumText, nextNum: sumNext } = addParagraphNumbers(summaryContent, paraCounter);
  markdownContent += `${sumText}\n\n`;
  paraCounter = sumNext;

  if (figures && figures.length > 0) {
      let figureDescriptionText = 'BRIEF DESCRIPTION OF THE SEVERAL VIEWS OF THE DRAWING\n\n';
      figures.forEach(fig => {
          figureDescriptionText += `FIG. ${fig.figureNumber} is a drawing illustrating ${fig.description.toLowerCase()}.\n`;
      });
      const { numberedText: figDescText, nextNum: figNext } = addParagraphNumbers(figureDescriptionText, paraCounter);
      markdownContent += `${figDescText}\n\n`;
      paraCounter = figNext;
  }
  
  markdownContent += `DETAILED DESCRIPTION OF THE INVENTION\n\n`;
  const { numberedText: descText, nextNum: descNext } = addParagraphNumbers(descriptionContent, paraCounter);
  markdownContent += `${descText}\n\n`;
  paraCounter = descNext;
  
  markdownContent += `CLAIMS\n\n${claimsContent}\n\n`;
  
  // Abstract is not numbered
  markdownContent += `ABSTRACT OF THE DISCLOSURE\n\n${abstractContent}\n\n`;

  return { type: 'non-provisional', markdownContent, figures };
};

export const generateProvisionalPatentApplication = async (analyzedInvention: AnalyzedInvention, selectedClaims: GradedClaim[], knowledgeBase: KnowledgeBaseEntry[]): Promise<PatentApplication> => {
  if (!ai) throw new Error("Gemini API client is not initialized.");
  if (!analyzedInvention) throw new Error("Analyzed invention data is required.");

  const bestPracticesGuide = await getBestPracticesGuideContent();
  const claimsToEmphasize = selectedClaims.map((c, i) => `Claim ${i + 1} (Grade: ${c.grade}): ${c.text}`).join('\n');
  const basePromptContext = `
**Source Invention Full Disclosure:**
${analyzedInvention.originalInvention.sourceContent.substring(0, 150000)}

**Prior Art Analysis Summary:**
${analyzedInvention.analysisSummary}

**"Best Mode" Concepts/Claims to Emphasize (with Patentability Grades):**
${claimsToEmphasize}
`;

  const systemInstruction = `${bestPracticesGuide}\n\n**Your Role:** You are the seasoned patent agent from the guide. Your task is to generate ONE specific section of a **provisional patent application** based on the provided context.`;
  const contentSchema = { type: Type.OBJECT, properties: { content: { type: Type.STRING } }, required: ['content'] };

  // Generate all section content first
  const titleContent = await generateSection(`Generate ONLY the "TITLE OF THE INVENTION" for the application.\n\n${basePromptContext}`, contentSchema, systemInstruction);
  const backgroundContent = await generateSection(`Generate ONLY the "BACKGROUND OF THE INVENTION" section text.\n\n${basePromptContext}`, contentSchema, systemInstruction);
  const summaryContent = await generateSection(`Generate ONLY the "SUMMARY OF THE INVENTION" section text.\n\n${basePromptContext}`, contentSchema, systemInstruction);
  const descriptionContent = await generateSection(`Generate ONLY the "DETAILED DESCRIPTION" section text. This is a provisional, so adopt a "kitchen sink" approach. Be exhaustive. Describe every component, function, step, and all possible alternative embodiments from the source material to provide maximum support for future claims. Weave in concepts from any weak claims as speculative possibilities.\n\n${basePromptContext}`, contentSchema, systemInstruction);
  const embodimentsContent = await generateSection(`Generate ONLY a numbered list of "EMBODIMENTS" that read like claims. Only include concepts from claims graded 'A' or 'B'. Do not include a "CLAIMS" section heading.\n\n${basePromptContext}`, contentSchema, systemInstruction);
  const abstractContent = await generateSection(`Generate ONLY the "ABSTRACT OF THE DISCLOSURE" section text.\n\n${basePromptContext}`, contentSchema, systemInstruction);

  // Create a combined context for better figure generation
  const fullSpecTextForFigGen = `${titleContent}\n${backgroundContent}\n${summaryContent}\n${descriptionContent}\n${embodimentsContent}`;
  const figures = await generateFiguresForApplication(fullSpecTextForFigGen, analyzedInvention.originalInvention.sourceContent);

  // Assemble the document programmatically and apply numbering in the correct order
  let markdownContent = ``;
  let paraCounter = 1;

  markdownContent += `TITLE OF THE INVENTION\n\n${titleContent}\n\n`;
  
  markdownContent += `BACKGROUND OF THE INVENTION\n\n`;
  const { numberedText: bgText, nextNum: bgNext } = addParagraphNumbers(backgroundContent, paraCounter);
  markdownContent += `${bgText}\n\n`;
  paraCounter = bgNext;

  markdownContent += `SUMMARY OF THE INVENTION\n\n`;
  const { numberedText: sumText, nextNum: sumNext } = addParagraphNumbers(summaryContent, paraCounter);
  markdownContent += `${sumText}\n\n`;
  paraCounter = sumNext;
  
  if (figures && figures.length > 0) {
      let figureDescriptionText = 'BRIEF DESCRIPTION OF THE SEVERAL VIEWS OF THE DRAWING\n\n';
      figures.forEach(fig => {
          figureDescriptionText += `FIG. ${fig.figureNumber} is a drawing illustrating ${fig.description.toLowerCase()}.\n`;
      });
      const { numberedText: figDescText, nextNum: figNext } = addParagraphNumbers(figureDescriptionText, paraCounter);
      markdownContent += `${figDescText}\n\n`;
      paraCounter = figNext;
  }

  markdownContent += `DETAILED DESCRIPTION OF THE INVENTION\n\n`;
  const { numberedText: descText, nextNum: descNext } = addParagraphNumbers(descriptionContent, paraCounter);
  markdownContent += `${descText}\n\n`;
  paraCounter = descNext;

  // Embodiments are not numbered with [000x]
  markdownContent += `EMBODIMENTS\n\n${embodimentsContent}\n\n`;

  // Abstract is not numbered
  markdownContent += `ABSTRACT OF THE DISCLOSURE\n\n${abstractContent}\n\n`;
  
  return { type: 'provisional', markdownContent, figures };
};