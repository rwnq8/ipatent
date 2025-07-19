
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { GEMINI_MODEL_TEXT } from '../constants';
import { ProcessedFile, PatentApplication, KnowledgeBaseEntry, SuggestedPortfolioEntry, ExtractedInvention, GeneratedFigure, PatentAnalysisReport } from "../types";
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

    const systemInstruction = `You are an intelligent patent docketing assistant working within a complete, self-contained patent engine. Your primary function is to analyze documents to build a comprehensive knowledge base for patent prosecution.
Your entire response must be ONLY a single, valid JSON array of objects. Do not include any other text, explanations, or markdown fences.
CRITICAL: All property keys in the JSON must be enclosed in double quotes (e.g., "title"). All string values must be properly escaped. For example, if a claim's text is 'The system of claim 1, wherein the "widget" is blue.', the corresponding JSON string value must be "The system of claim 1, wherein the \\"widget\\" is blue.". This escaping is non-negotiable for the output to be valid.`;

    const prompt = `Analyze the following batch of documents. Each document is separated by "--- DOCUMENT: [filename] ---".

Your task is to identify all unique patent applications mentioned. Information for a single application might be spread across multiple files (e.g., an application number in a filing receipt and the title in the specification). You must correlate this information and merge it into a single, consolidated entry for each unique application.

Each object in the returned JSON array represents one unique patent application and must have the following structure:
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

    let responseTextForError: string = '';
    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: GEMINI_MODEL_TEXT,
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: batchResponseSchema,
                temperature: 0.0,
            },
        });

        let jsonStr = response.text.trim();
        responseTextForError = jsonStr;

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
        const originalMessage = (error instanceof Error) ? error.message : String(error);
        const debugInfo = responseTextForError ? ` Raw model output snippet: ${responseTextForError.substring(0, 500)}...` : '';
        throw new Error(`Failed to parse patent metadata from documents. The AI may have returned a malformed response. Details: ${originalMessage}.${debugInfo}`);
    }
};

export const extractInventions = async (processedFiles: ProcessedFile[]): Promise<ExtractedInvention[]> => {
    if (!ai) throw new Error("Gemini API client is not initialized.");
    if (!processedFiles || processedFiles.length === 0) return [];

    const fileContentBlock = processedFiles.map(file => 
      `--- DOCUMENT: ${file.name} ---\n${sanitizeForApi(file.content).substring(0, 100000)}`
    ).join('\n\n');

    const systemInstruction = `You are an expert patent analyst. Your task is to dissect provided documents to identify distinct inventions.
Return your findings as a single, valid JSON array of "invention" objects. The entire response MUST be ONLY this JSON array, with no other text, explanations, or markdown fences.
CRITICAL: All property keys in the JSON must be enclosed in double quotes (e.g., "title"). All string values must be properly escaped. For example, if a claim's text is 'The system of claim 1, wherein the "widget" is blue.', the corresponding JSON string value must be "The system of claim 1, wherein the \\"widget\\" is blue.". This escaping is non-negotiable for the output to be valid.`;

    const prompt = `Analyze the following batch of documents. Each document is separated by "--- DOCUMENT: [filename] ---". You MUST identify all unique inventions. If two documents describe completely different technologies (e.g., one about quantum security, one about machine learning resource allocation), they are two separate inventions.

For each distinct invention you identify, you must:
1.  Generate a concise title for the invention.
2.  Write a brief, one-paragraph description summarizing the invention's core concept.
3.  Extract two types of claims:
    a.  **'explicit' claims:** These are formally numbered claims found verbatim in a "CLAIMS" section of the documents.
    b.  **'inferred' claims:** This is critical. Scour the entire text (abstract, summary, detailed description, embodiments) for sentences or phrases that describe a specific feature, function, component, process, or advantage that could be formulated into a formal claim later. Be exhaustive. This is about capturing every potentially patentable idea.
4.  **CRITICAL:** List the exact filenames of all source documents that contributed information to this invention.

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
        sourceFilenames: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "An array of filenames that are the source for this invention."
        }
      },
      required: ['title', 'description', 'claims', 'sourceFilenames'],
    };

    const responseSchema = {
      type: Type.ARRAY,
      description: "An array of all unique inventions found in the documents.",
      items: inventionSchema,
    };

    let responseTextForError: string = '';
    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: GEMINI_MODEL_TEXT,
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                temperature: 0.1,
            },
        });

        let jsonStr = response.text.trim();
        responseTextForError = jsonStr;

        if (jsonStr.startsWith("```json")) {
            jsonStr = jsonStr.substring(7);
            if (jsonStr.endsWith("```")) {
                jsonStr = jsonStr.slice(0, -3);
            }
        }
        jsonStr = jsonStr.trim();
        
        if (!jsonStr) {
            console.warn("Gemini API returned an empty response for invention extraction.");
            return [];
        }

        const parsedData = JSON.parse(jsonStr) as any[];

        if (!Array.isArray(parsedData)) {
            throw new Error("Parsed data for invention extraction is not an array.");
        }

        const filesByName = new Map(processedFiles.map(f => [f.name, f]));

        return parsedData.map(item => {
            const sourceFilenames = Array.isArray(item.sourceFilenames) ? item.sourceFilenames : [];
            const relevantFiles = sourceFilenames
                .map((filename: string) => filesByName.get(filename))
                .filter((file): file is ProcessedFile => !!file);
            
            // If mapping fails, the content will be empty, preventing context bleed from other files.
            const relevantContent = relevantFiles.map(file => 
                `--- DOCUMENT: ${file.name} ---\n${sanitizeForApi(file.content)}`
            ).join('\n\n');

            return {
                title: item.title || "Untitled Invention",
                description: item.description || "No description provided.",
                claims: Array.isArray(item.claims) ? item.claims.map((claim: any) => ({
                    text: claim.text || "Invalid claim text",
                    type: (claim.type === 'explicit' || claim.type === 'inferred') ? claim.type : 'inferred',
                    selected: true,
                })) : [],
                sourceContent: relevantContent, // Use the filtered content now
            };
        });

    } catch (error) {
        console.error("Error calling Gemini API for invention extraction:", error);
        const originalMessage = (error instanceof Error) ? error.message : String(error);
        const debugInfo = responseTextForError ? ` Raw model output snippet: ${responseTextForError.substring(0, 500)}...` : '';
        throw new Error(`Failed to extract inventions from documents. The AI may have returned a malformed response. Details: ${originalMessage}.${debugInfo}`);
    }
};

export const generatePatentabilityReport = async (
  invention: ExtractedInvention,
  knowledgeBase: KnowledgeBaseEntry[]
): Promise<PatentAnalysisReport> => {
  if (!ai) throw new Error("Gemini API client is not initialized.");
  if (!invention) throw new Error("Invention data is required.");

  const bestPracticesGuide = await getBestPracticesGuideContent();
  const baseContext = `
**Context: Invention to Analyze**
- **Title:** ${invention.title}
- **Description:** ${invention.description}
- **Initially Extracted Claims/Embodiments for Analysis:**
${invention.claims.map(c => `- (${c.type}) ${c.text}`).join('\n')}

**Context: User's Existing IP Portfolio (for context ONLY, NOT prior art)**
${formatKnowledgeBaseForPrompt(knowledgeBase)}
`;

  // --- Step 1: Generate the preliminary report (Sections 1-4) ---
  const preliminaryReportPrompt = `
**Role:** You are a world-class patent attorney and prior art specialist with deep expertise in technology and global patent law, as detailed in the provided "Global Patent Playbook".

**Mission:** Generate the first part of a "Patentability & Prior Art Analysis Report" in Markdown format for the invention detailed below. Your analysis must be thorough, strategic, and grounded in the principles of the playbook. You must use Google Search to find relevant prior art.

${baseContext}
---
**TASK & OUTPUT INSTRUCTIONS**

Your entire output MUST be a single Markdown document. You must generate content for Sections 1 through 4 ONLY. Do not generate Section 5 or beyond. STOP after you have finished writing Section 4.

---
# Patentability & Prior Art Analysis Report for: "${invention.title}"

## Section 1: Analysis of Initial Claims
- Provide a detailed critique of the initial claims/embodiments.
- Identify strengths (e.g., specific technical limitations) and weaknesses (e.g., vagueness, broadness, business method character).
- Discuss potential §101 (Alice/Mayo), §102 (novelty), and §103 (obviousness) issues.

## Section 2: Prior Art Search & Analysis
- Detail the findings from your Google Search.
- For the top 3-5 most relevant prior art references found, provide a detailed analysis.
- Explain why each reference is relevant and which specific claims it potentially reads on.

## Section 3: Strategic Landscape & Opportunities
- Based on the prior art, analyze the competitive landscape. Is the field crowded or open?
- Identify potential "white space" or avenues for innovation.
- Discuss potential design-around strategies that a competitor might use against the initial claims.
- Suggest strategic directions for the invention to enhance its defensibility and commercial value.

## Section 4: Claim Broadening & Narrowing Strategy
- Based on the prior art, provide concrete advice on claim strategy.
- Which claim elements could be broadened without hitting prior art?
- Which claims need to be narrowed with additional specific limitations to ensure patentability? Provide examples.
`;

  const preliminaryReportResponse = await ai.models.generateContent({
    model: GEMINI_MODEL_TEXT,
    contents: preliminaryReportPrompt,
    config: {
      systemInstruction: bestPracticesGuide,
      temperature: 0.4,
      tools: [{ googleSearch: {} }],
    },
  });

  const preliminaryReportContent = preliminaryReportResponse.text;
  const groundingMetadata = {
    groundingChunks: preliminaryReportResponse.candidates?.[0]?.groundingMetadata?.groundingChunks,
    webSearchQueries: preliminaryReportResponse.candidates?.[0]?.groundingMetadata?.webSearchQueries,
  };
  
  if (!preliminaryReportContent) {
    throw new Error("The preliminary report generation (Sections 1-4) failed and returned no content.");
  }

  // --- Step 2: Generate the concluding sections (Section 5) ---
  const section5Prompt = `
**Role:** You are a world-class patent attorney, and you are continuing your work on a patentability report.

**Mission:** Generate ONLY Section 5 of the "Patentability & Prior Art Analysis Report" and the Appendices section. This is a highly focused task to draft the final claims, create a comparison chart, and provide a strategic recommendation based on the previously completed analysis.

**Full Context from Prior Sections (for your reference):**
\`\`\`markdown
${preliminaryReportContent}
\`\`\`

---
**TASK & OUTPUT INSTRUCTIONS**

Your entire output must be ONLY the markdown for Section 5 and the Appendices section. Do not repeat the title or Sections 1-4.

## Section 5: "Best Mode" Claim Set & Go/No-Go Assessment

### A. "Best Mode" Revised Claims
- Draft a new, revised set of 3-5 claims that you believe represent the strongest, most defensible version of this invention based on the analysis in the context provided.

### B. Claim Chart vs. Closest Art
- **CRITICAL:** Create a complete, detailed markdown table comparing your top revised independent claim (from part A above) against the single closest prior art reference identified in the context.
- **ACTION:** You MUST use the following markdown table structure exactly. Populate every feature and analysis cell with specific, detailed information. Do not use placeholders, omit details, or use dotted lines.

\`\`\`markdown
| Feature of Revised Independent Claim 1 | Analysis vs. Closest Prior Art (Novelty / Inventive Step) |
| :--- | :--- |
| [Break down Claim 1 into its first essential feature or limitation here] | [Provide your detailed analysis for this feature against the prior art, explaining why it is novel or non-obvious] |
| [Break down Claim 1 into its second essential feature or limitation here] | [Provide your detailed analysis for this feature against the prior art, explaining why it is novel or non-obvious] |
| ... (continue for all essential features) | ... (continue analysis for each feature) |
\`\`\`

### C. Strategic Go/No-Go Recommendation
- Provide a final, clear recommendation (e.g., High Confidence GO, Cautious GO, NO-GO).
- Justify your recommendation based on the expected scope of protection, the difficulty of prosecution, and the commercial landscape.

--- APPENDICES ---

## Appendix A: Detailed Prior Art & FTO Analysis
- You may leave this section with a placeholder message like "Detailed FTO analysis not performed."
`;
  
  const section5Response = await ai.models.generateContent({
      model: GEMINI_MODEL_TEXT,
      contents: section5Prompt,
      config: {
          systemInstruction: bestPracticesGuide,
          temperature: 0.3, 
      },
  });

  let section5Content = section5Response.text;
  if (!section5Content) {
      // Gracefully handle failure of this step
      section5Content = `\n\n## Section 5: "Best Mode" Claim Set & Go/No-Go Assessment\n\n[ERROR: The AI failed to generate this section.]`;
  }

  const mainReportContent = `${preliminaryReportContent.trim()}\n\n${section5Content.trim()}`;

  // --- Step 3: Generate the Red Team Analysis ---
  const redTeamPrompt = `
**Role:** You are a skeptical "Red Team" patent attorney. Your sole purpose is to find the weaknesses and unstated assumptions in the following patentability report prepared by your colleague. Your critique must be sharp, insightful, and constructive.

**Mission:** Generate ONLY the "Red Team Analysis" markdown section. Follow the structure below exactly.

**Report to Analyze:**
\`\`\`markdown
${mainReportContent}
\`\`\`

---
**TASK & OUTPUT INSTRUCTIONS**

Your entire output must be ONLY the markdown for the "Red Team Analysis" section. Do not include any other text or explanation.

## Red Team Analysis: A Mandatory Self-Critique
- **CRITICAL:** What are the weakest points in the analysis provided above? What unstated assumptions were made?
- If an opposing counsel were to attack this report, which specific arguments would they use?
- What's the most likely reason a patent office would reject the proposed "Best Mode" claims?
- This section demonstrates intellectual honesty and is non-negotiable.
`;

  const redTeamResponse = await ai.models.generateContent({
      model: GEMINI_MODEL_TEXT,
      contents: redTeamPrompt,
      config: {
          systemInstruction: bestPracticesGuide,
          temperature: 0.5,
      },
  });

  const redTeamContent = redTeamResponse.text;

  const finalMarkdownContent = `${mainReportContent}\n\n${redTeamContent || '## Red Team Analysis: A Mandatory Self-Critique\n\n[ERROR: The AI failed to generate the Red Team self-critique section.]'}`;

  return {
    markdownContent: finalMarkdownContent,
    groundingMetadata: groundingMetadata,
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
 * This version robustly splits text into paragraphs (not just lines) and strips any
 * existing paragraph numbers to ensure correct, sequential numbering.
 * @param text The block of text for a section (e.g., Background).
 * @param startNum The starting paragraph number.
 * @returns An object containing the numbered text and the next available paragraph number.
 */
const addParagraphNumbers = (text: string, startNum: number): { numberedText: string; nextNum: number } => {
    if (!text || !text.trim()) return { numberedText: text, nextNum: startNum };
    let currentNum = startNum;

    // Split text into paragraphs based on two or more newlines.
    // Filter out any empty strings that result from the split.
    const paragraphs = text.split(/\n{2,}/).filter(p => p.trim().length > 0);

    const numberedParagraphs = paragraphs.map(para => {
        // Check conditions on the paragraph.
        const isHeading = para.startsWith('#');
        const isListItem = /^\s*(\*|-|\d+\.)\s+/.test(para);
        
        // Aggressively strip any existing paragraph numbers like [0001] from the start.
        const cleanPara = para.replace(/^\[\d{4,}\]\s*/, '');
        
        // Don't number headings or list items.
        if (!isHeading && !isListItem) {
            const paraNum = `[${String(currentNum++).padStart(4, '0')}]`;
            return `${paraNum} ${cleanPara}`;
        }
        // Return the paragraph as is (with numbering stripped if it was a heading/list that had it)
        return cleanPara;
    });
    
    // Join with double newlines to preserve paragraph separation.
    return { numberedText: numberedParagraphs.join('\n\n'), nextNum: currentNum };
};

const getBestModeClaimsFromReport = (report: PatentAnalysisReport): string => {
    const content = report.markdownContent;
    const bestModeHeader = '### A. "Best Mode" Revised Claims';
    const claimChartHeader = '### B. Claim Chart vs. Closest Art';
    
    const startIndex = content.indexOf(bestModeHeader);
    if (startIndex === -1) return "No 'Best Mode' claims found in report.";

    const contentAfterHeader = content.substring(startIndex + bestModeHeader.length);
    const endIndex = contentAfterHeader.indexOf(claimChartHeader);

    const claimsSection = (endIndex === -1 ? contentAfterHeader : contentAfterHeader.substring(0, endIndex)).trim();
    return claimsSection;
};

export const generateNonProvisionalPatentApplication = async (invention: ExtractedInvention, report: PatentAnalysisReport, knowledgeBase: KnowledgeBaseEntry[]): Promise<PatentApplication> => {
  if (!ai) throw new Error("Gemini API client is not initialized. Check API Key configuration.");
  if (!invention || !report) throw new Error("Invention and report data are required.");

  const bestPracticesGuide = await getBestPracticesGuideContent();
  const bestModeClaims = getBestModeClaimsFromReport(report);

  const basePromptContext = `
**Source Invention Full Disclosure:**
${invention.sourceContent.substring(0, 150000)}

**Analysis Report Summary & "Best Mode" Claims to build upon:**
${report.markdownContent.substring(0, 150000)}
`;

  const systemInstruction = `${bestPracticesGuide}\n\n**Your Role:** You are the world-class patent attorney from the guide. Your task is to generate ONE specific section of a **non-provisional patent application** based on the provided context, adhering strictly to the principles in the "Global Patent Playbook" provided. **CRITICAL:** You MUST generate the full, complete text for the requested section. Do NOT use placeholder text such as "Placeholder for..." or "[Insert details here]". You must write the actual content.`;
  const contentSchema = { type: Type.OBJECT, properties: { content: { type: Type.STRING } }, required: ['content'] };

  // Generate all section content first
  const titleContent = await generateSection(`Generate ONLY the "TITLE OF THE INVENTION" for the application.\n\n${basePromptContext}`, contentSchema, systemInstruction);
  const backgroundContent = await generateSection(`Generate ONLY the "BACKGROUND OF THE INVENTION" section text. Do NOT use placeholders.\n\n${basePromptContext}`, contentSchema, systemInstruction);
  const summaryContent = await generateSection(`Generate ONLY the "SUMMARY OF THE INVENTION" section text. Do NOT use placeholders.\n\n${basePromptContext}`, contentSchema, systemInstruction);
  const descriptionContent = await generateSection(`Generate ONLY the "DETAILED DESCRIPTION" section text. Be exhaustive and ensure full antecedent basis for all claim terms, describing multiple embodiments as per the playbook. Do NOT use placeholders; write the full content.\n\n${basePromptContext}`, contentSchema, systemInstruction);
  
  // Use a more focused prompt for the claims section
  const claimsPrompt = `Based on the provided context and the principles of the "Global Patent Playbook", generate ONLY the formal "CLAIMS" section for a non-provisional application.
  
  Your primary task is to use the "Best Mode" claims identified in the analysis report as the independent claims. Then, for each independent claim, you MUST add 3-5 logical, narrowing dependent claims that add further inventive limitations, following the hierarchical structure principle from the playbook.
  
  **"Best Mode" Claims from Report:**
  ${bestModeClaims}
  
  **Full Context:**
  ${basePromptContext}
  `;
  const claimsContent = await generateSection(claimsPrompt, contentSchema, systemInstruction);
  const abstractContent = await generateSection(`Generate ONLY the "ABSTRACT OF THE DISCLOSURE" section text.\n\n${basePromptContext}`, contentSchema, systemInstruction);
  
  // Create a combined context for better figure generation
  const fullSpecTextForFigGen = `${titleContent}\n${backgroundContent}\n${summaryContent}\n${descriptionContent}\n${claimsContent}`;
  const figures = await generateFiguresForApplication(fullSpecTextForFigGen, invention.sourceContent);

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

export const generateProvisionalPatentApplication = async (invention: ExtractedInvention, report: PatentAnalysisReport, knowledgeBase: KnowledgeBaseEntry[]): Promise<PatentApplication> => {
    if (!ai) throw new Error("Gemini API client is not initialized.");
    if (!invention || !report) throw new Error("Invention and report data are required.");

    const bestPracticesGuide = await getBestPracticesGuideContent();
    
    // The base context now includes the report, which is crucial for a high-quality narrative.
    const basePromptContext = `
**Source Invention Full Disclosure:**
This is the primary source of truth. Your entire output must be derived from and expand upon the details within this section.
\`\`\`
${invention.sourceContent.substring(0, 200000)}
\`\`\`

**Analysis Report Summary & "Best Mode" Claims:**
This report provides strategic context and a refined articulation of the invention's core concepts. Use it to guide the narrative, focus, and structure of the application draft.
\`\`\`
${report.markdownContent.substring(0, 150000)}
\`\`\`
`;

    // A more sophisticated system instruction for provisional drafting.
    const provisionalSystemInstruction = `${bestPracticesGuide}\n\n**Your Role:** You are the world-class patent attorney from the guide. Your task is to generate ONE specific section of a **provisional patent application**. Your primary goal is to create a rich, detailed, and comprehensive technical disclosure to establish the strongest possible priority date.

**CRITICAL DIRECTIVES FOR PROVISIONAL DRAFTING:**
1.  **Maximize Disclosure:** While formal claims are not required, every sentence you write should be aimed at supporting future claims. Describe every feature, alternative, and embodiment in painstaking detail.
2.  **Narrative is Key:** Do not just create a list. You must write clear, descriptive prose that explains the invention's context, purpose, components, and operation. The goal is a complete technical document, not just a list of features.
3.  **No Placeholders:** You must write the full, complete text for the requested section. Do NOT use placeholders like "[Insert details here]".`;

    const contentSchema = { type: Type.OBJECT, properties: { content: { type: Type.STRING } }, required: ['content'] };

    // Generate each section individually for better quality and control.
    const titleContent = await generateSection(`Generate ONLY the "TITLE OF THE INVENTION" for the application.\n\n${basePromptContext}`, contentSchema, provisionalSystemInstruction);
    const backgroundContent = await generateSection(`Generate ONLY the "BACKGROUND OF THE INVENTION" section. Explain the technical field, problems with existing solutions, and the context that makes this invention necessary and useful.\n\n${basePromptContext}`, contentSchema, provisionalSystemInstruction);
    const summaryContent = await generateSection(`Generate ONLY the "SUMMARY OF THE INVENTION" section. Provide a high-level overview of the invention, its main components, and its key advantages and benefits.\n\n${basePromptContext}`, contentSchema, provisionalSystemInstruction);
    
    const descriptionPrompt = `Generate ONLY the "DETAILED DESCRIPTION OF THE INVENTION" section. This is the most critical part of the provisional application. Your task is to create an exhaustive and descriptive narrative.
    
Follow these rules:
1.  **Write in Rich Prose:** Describe the invention's structure, components, and operation in clear paragraphs. Explain *how* the different parts work together.
2.  **Be Exhaustive:** Weave in detailed descriptions of every conceivable alternative, variation, and embodiment from the source material. Use the "Best Mode" claims from the report as a guide for the core concepts, but expand far beyond them into every nook and cranny of the disclosure.
3.  **Include an Embodiments List (Optional but Encouraged):** In addition to the prose, you may include a numbered list of specific embodiments (e.g., "1. A system comprising...") to explicitly capture key features. This list should supplement, not replace, the descriptive prose.
4.  **Connect to Drawings:** If figures are implied in the source material, refer to them hypothetically (e.g., "As may be depicted in FIG. 1, the system includes...").

The goal is to create a rich document that provides maximum support for a future non-provisional application by establishing clear antecedent basis for a wide range of potential claims.
---
${basePromptContext}
`;
    const descriptionContent = await generateSection(descriptionPrompt, contentSchema, provisionalSystemInstruction);
    
    // Abstract generation remains the same.
    const abstractPrompt = `Based on the following technical specification, write a brief, one-paragraph "ABSTRACT OF THE DISCLOSURE" that broadly summarizes the technology.
    
--- SPECIFICATION ---
${titleContent}\n${summaryContent}\n${descriptionContent.substring(0, 20000)}
`;
    const abstractContent = await generateSection(abstractPrompt, contentSchema, "You are a helpful assistant summarizing a technical document.");

    // Figure generation remains the same.
    const fullSpecTextForFigGen = `${titleContent}\n${backgroundContent}\n${summaryContent}\n${descriptionContent}`;
    const figures = await generateFiguresForApplication(fullSpecTextForFigGen, invention.sourceContent);

    // Assemble the document without paragraph numbering.
    let markdownContent = ``;
    markdownContent += `TITLE OF THE INVENTION\n\n${titleContent}\n\n`;
    markdownContent += `BACKGROUND OF THE INVENTION\n\n${backgroundContent}\n\n`;
    markdownContent += `SUMMARY OF THE INVENTION\n\n${summaryContent}\n\n`;

    if (figures && figures.length > 0) {
        let figureDescriptionText = 'BRIEF DESCRIPTION OF THE SEVERAL VIEWS OF THE DRAWING\n\n';
        figures.forEach(fig => {
            figureDescriptionText += `FIG. ${fig.figureNumber} is a drawing illustrating ${fig.description.toLowerCase()}.\n`;
        });
        markdownContent += `${figureDescriptionText}\n\n`;
    }
    
    markdownContent += `DETAILED DESCRIPTION OF THE INVENTION\n\n${descriptionContent}\n\n`;
    
    markdownContent += `ABSTRACT OF THE DISCLOSURE\n\n${abstractContent}\n\n`;
    
    return { type: 'provisional', markdownContent, figures };
};
