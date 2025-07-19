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

NON-NEGOTIABLE FINAL CHECK: Before outputting, you MUST internally review your own generated response to ensure it is a single, valid JSON array. All property keys and string values must be enclosed in double quotes, and all special characters within string values (like other double quotes or backslashes) must be properly escaped (e.g., \\" or \\\\). This is a critical requirement to prevent parsing errors.`;

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

    let responseTextForError: string = '';
    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: GEMINI_MODEL_TEXT,
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
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
        
        const startIndex = jsonStr.indexOf('[');
        const endIndex = jsonStr.lastIndexOf(']');
        if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
            try {
                const tempParsed = JSON.parse(jsonStr);
                const key = Object.keys(tempParsed).find(k => Array.isArray(tempParsed[k]));
                if(key) {
                    jsonStr = JSON.stringify(tempParsed[key]);
                } else {
                     console.warn(`Gemini API returned a non-array JSON or non-JSON response for batch extraction: ${jsonStr}`);
                     return [];
                }
            } catch {
                 console.warn(`Gemini API returned a non-array JSON or non-JSON response for batch extraction: ${jsonStr}`);
                 return [];
            }
        } else {
             jsonStr = jsonStr.substring(startIndex, endIndex + 1);
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

/**
 * Defines the structure for a single claim extracted by the Gemini API.
 */
interface ApiExtractedClaim {
    text: string;
    type: 'explicit' | 'inferred';
}

/**
 * Defines the structure for a single invention object expected from the Gemini API.
 */
interface ApiExtractedInvention {
    title: string;
    description: string;
    claims: ApiExtractedClaim[];
    sourceFilenames: string[];
}

export const extractInventions = async (processedFiles: ProcessedFile[]): Promise<ExtractedInvention[]> => {
    if (!ai) throw new Error("Gemini API client is not initialized.");
    if (!processedFiles || processedFiles.length === 0) return [];

    const fileContentBlock = processedFiles.map(file => 
      `--- DOCUMENT: ${file.name} ---\n${sanitizeForApi(file.content).substring(0, 100000)}`
    ).join('\n\n');
    
    const systemInstruction = `You are an expert patent analysis AI. Your task is to extract inventions from provided documents.
Your entire response MUST be ONLY a single, valid JSON array of objects. Do not include any other text, explanations, or markdown fences.

NON-NEGOTIABLE FINAL CHECK: Before outputting, you MUST internally review your own generated response to ensure it is a single, valid JSON array. All property keys and string values must be enclosed in double quotes, and all special characters within string values (like other double quotes or backslashes) must be properly escaped (e.g., \\" or \\\\). This is a critical requirement to prevent parsing errors.`;
    
    const prompt = `Analyze the following batch of documents. Your primary task is to identify and extract distinct inventions and return them as a single JSON array.

**Non-Negotiable Rule:** Your absolute highest priority is to find text that represents claims or embodiments. If you find a numbered list under a heading like "CLAIMS", "WHAT IS CLAIMED IS", or "EMBODIMENTS", each item in that list MUST be extracted as a claim of type 'explicit'. This is not optional. You MUST find them if they exist. Failure to do so is a critical error.

**JSON Schema for each object in the array:**
{
  "title": "A concise, descriptive title for this specific invention.",
  "description": "A brief, one-paragraph summary of the invention's core concept, purpose, and key features.",
  "claims": [ { "text": "The full, verbatim text of the claim or embodiment.", "type": "'explicit' or 'inferred'" } ],
  "sourceFilenames": ["The exact filename where this invention was found."]
}

**Claim Extraction Logic:**
1.  **Explicit Claims (Mandatory):** Search for formal claim sets or numbered embodiment lists. Extract each item verbatim and assign \`type: "explicit"\`.
2.  **Inferred Claims:** From the rest of the text, extract sentences describing key features or functions that could form the basis of a future claim. Assign \`type: "inferred"\`.

If no inventions or claims are found, return an empty array [].

--- BATCH OF DOCUMENTS ---
${fileContentBlock}
--- END BATCH OF DOCUMENTS ---
`;
    
    let responseTextForError: string = '';
    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: GEMINI_MODEL_TEXT,
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.1,
            },
        });

        let jsonStr = response.text.trim();
        responseTextForError = jsonStr;
        
        if (!jsonStr) {
            console.warn("Gemini API returned an empty response for invention extraction.");
            return [];
        }

        if (jsonStr.startsWith("```json")) {
            jsonStr = jsonStr.substring(7);
            if (jsonStr.endsWith("```")) {
                jsonStr = jsonStr.slice(0, -3);
            }
        }
        jsonStr = jsonStr.trim();

        const startIndex = jsonStr.indexOf('[');
        const endIndex = jsonStr.lastIndexOf(']');
        if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
            try {
                // Sometimes the model returns an object with a key like "inventions"
                const tempParsed = JSON.parse(jsonStr);
                const key = Object.keys(tempParsed).find(k => Array.isArray(tempParsed[k]));
                if(key) {
                    jsonStr = JSON.stringify(tempParsed[key]);
                } else {
                     throw new Error("Response is not a JSON array and does not contain an array key.");
                }
            } catch {
                 throw new Error("Response is not a valid JSON array.");
            }
        } else {
            jsonStr = jsonStr.substring(startIndex, endIndex + 1);
        }

        const parsedData = JSON.parse(jsonStr) as ApiExtractedInvention[];

        if (!Array.isArray(parsedData)) {
            throw new Error("Parsed data for invention extraction is not an array.");
        }

        const filesByName = new Map(processedFiles.map(f => [f.name, f]));

        return parsedData.map(item => {
            const sourceFilenames = Array.isArray(item.sourceFilenames) ? item.sourceFilenames : [];
            const relevantFiles = sourceFilenames
                .map((filename: string) => filesByName.get(filename))
                .filter((file): file is ProcessedFile => !!file);
            
            const relevantContent = relevantFiles.map(file => 
                `--- DOCUMENT: ${file.name} ---\n${sanitizeForApi(file.content)}`
            ).join('\n\n');

            return {
                title: item.title || "Untitled Invention",
                description: item.description || "No description provided.",
                claims: Array.isArray(item.claims) ? item.claims.map((claim: ApiExtractedClaim) => ({
                    text: claim.text || "Invalid claim text",
                    type: (claim.type === 'explicit' || claim.type === 'inferred') ? claim.type : 'inferred',
                    selected: true,
                })) : [],
                sourceContent: relevantContent,
            };
        });

    } catch (error) {
        console.error("Error calling Gemini API for invention extraction:", error);
        const originalMessage = (error instanceof Error) ? error.message : String(error);
        const debugInfo = responseTextForError ? ` Raw model output snippet: ${responseTextForError.substring(0, 500)}...` : '';
        throw new Error(`Failed to extract inventions from documents. The AI may have returned a malformed response. Details: ${originalMessage}.${debugInfo}`);
    }
};

/**
 * After a report is generated, this function takes the URLs from the grounding
 * metadata and performs a deep analysis to extract structured prior art information.
 * @param report The generated patent analysis report.
 * @param inventionContext The original source content of the invention for context.
 * @returns A promise that resolves to an array of structured KnowledgeBaseEntry objects.
 */
const analyzePriorArtFromReport = async (report: PatentAnalysisReport, inventionContext: string): Promise<KnowledgeBaseEntry[]> => {
    if (!ai) return [];
    
    const urls = report.groundingMetadata?.groundingChunks
        ?.map(c => c.web?.uri)
        .filter((uri): uri is string => !!uri) ?? [];
    
    const uniqueUrls = [...new Set(urls)];

    if (uniqueUrls.length === 0) return [];

    const systemInstruction = `You are an expert patent analyst. Your task is to analyze the content at the provided URLs in the context of a given invention disclosure. For each URL, you will extract structured information and return it in a single JSON array. Your entire response MUST be ONLY the JSON array, with no other text, explanations, or markdown fences.

NON-NEGOTIABLE FINAL CHECK: Before outputting, you MUST internally review your own generated response to ensure it is a single, valid JSON array. All property keys and string values must be enclosed in double quotes, and all special characters within string values (like other double quotes) must be properly escaped (e.g., \\"). This is a critical requirement.`;

    const prompt = `
In the context of the following invention disclosure, analyze the web content at each of the provided URLs.

**INVENTION CONTEXT:**
\`\`\`
${inventionContext.substring(0, 20000)}
\`\`\`

**URLS TO ANALYZE:**
${uniqueUrls.map(u => `- ${u}`).join('\n')}

**TASK:**
For each URL, read its content and determine if it is relevant prior art. Create a JSON object for each URL.
- If the URL points to a patent document, extract its title, application/patent number, and filing/publication date. Summarize the key technical teachings in the 'notes' and extract potential 'extractedEmbodiments'.
- If the URL is a technical article or blog post, use its title, set the 'applicationNumber' to the URL itself, and summarize its content in the 'notes'.
- If a URL is irrelevant, broken, or inaccessible, you may omit it from the final JSON array.

Return a single, valid JSON array of these objects. Your entire response MUST be ONLY this JSON array. The schema for each object in the array MUST be:
{
  "title": "string",
  "applicationNumber": "string",
  "filingDate": "string (YYYY-MM-DD or N/A)",
  "type": "string ('provisional' or 'non-provisional')",
  "notes": "string (detailed summary)",
  "extractedEmbodiments": ["string"]
}
`;

    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL_TEXT,
            contents: prompt,
            config: {
                systemInstruction,
                temperature: 0.1,
                tools: [{ googleSearch: {} }] // Ensure web access
            }
        });

        let jsonStr = response.text.trim();
        
        if (jsonStr.startsWith("```json")) {
            jsonStr = jsonStr.substring(7);
            if (jsonStr.endsWith("```")) {
                jsonStr = jsonStr.slice(0, -3);
            }
        }
        jsonStr = jsonStr.trim();
        
        if (!jsonStr) return [];
        
        const parsed = JSON.parse(jsonStr) as any[];
        
        return parsed.map((item, index) => ({
            id: `kb-discovered-${Date.now()}-${index}`,
            isOwner: false,
            title: item.title || "Untitled Prior Art",
            applicationNumber: item.applicationNumber || "N/A",
            filingDate: item.filingDate || "N/A",
            type: item.type || 'non-provisional',
            notes: item.notes || "No summary extracted.",
            extractedClaims: [], // Schema does not extract formal claims
            extractedEmbodiments: item.extractedEmbodiments || [],
            isComplete: false,
            files: [],
        }));
    } catch (error) {
        console.error("Error analyzing prior art URLs:", error);
        return []; // Return empty on failure to avoid crashing the flow
    }
};

export const generatePatentabilityReport = async (
  invention: ExtractedInvention,
  knowledgeBase: KnowledgeBaseEntry[],
  priorArtLibrary: KnowledgeBaseEntry[]
): Promise<{ report: PatentAnalysisReport; priorArt: KnowledgeBaseEntry[] }> => {
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
${formatKnowledgeBaseForPrompt(knowledgeBase, "Portfolio Entry")}

**Context: Known Prior Art Library (from previous analyses, treat as known art)**
${formatKnowledgeBaseForPrompt(priorArtLibrary, "Known Prior Art Entry")}
`;

  // --- Step 1: Generate the preliminary report (Sections 1-4) ---
  const preliminaryReportPrompt = `
**Role:** You are a world-class patent attorney and prior art specialist with deep expertise in technology and global patent law, as detailed in the provided "Global Patent Playbook".

**Mission:** Generate the first part of a "Patentability & Prior Art Analysis Report" in Markdown format for the invention detailed below. Your analysis must be thorough, strategic, and grounded in the principles of the playbook. You must use Google Search to find relevant prior art that is NOT already listed in the "Known Prior Art Library" context.

${baseContext}
---
**TASK & OUTPUT INSTRUCTIONS**

Your entire output MUST be a single Markdown document. You must generate content for Sections 1 through 4 ONLY. Do not generate Section 5 or beyond. STOP after you have finished writing Section 4.

---
# Patentability & Prior Art Analysis Report for: "${invention.title}"

## Section 1: Analysis of Initial Claims
- Provide a detailed critique of the initial claims/embodiments.
- Identify strengths (e.g., specific technical limitations) and weaknesses (e.g., vagueness, broadness, business method character).
- Discuss potential §101 (Alice/Mayo), §102 (novelty), and §103 (obviousness) issues based on the known art and your new search.

## Section 2: Prior Art Search & Analysis
- Detail the findings from your Google Search. **Focus on finding new art not already listed in the provided context.**
- For the top 3-5 most relevant **new** prior art references found, provide a detailed analysis.
- Explain why each reference is relevant and which specific claims it potentially reads on.

## Section 3: Strategic Landscape & Opportunities
- Based on ALL known prior art, analyze the competitive landscape.
- **CRITICAL FOCUS: Identify "White Space" & Avenues for Innovation.** This is the most important part of this section. Frame your analysis around opportunities, not just limitations. What are the unclaimed territories? What future developments could this invention enable?
- Discuss potential design-around strategies a competitor might use, framing them as areas where the current claims may need strengthening to protect the identified white space.
- Suggest concrete strategic directions for R&D and claim drafting to capture the identified white space and enhance commercial value.

## Section 4: Claim Broadening & Narrowing Strategy
- Based on ALL known prior art, provide concrete advice on claim strategy.
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
  
  const report: PatentAnalysisReport = {
    markdownContent: preliminaryReportResponse.text,
    groundingMetadata: {
      groundingChunks: preliminaryReportResponse.candidates?.[0]?.groundingMetadata?.groundingChunks,
      webSearchQueries: preliminaryReportResponse.candidates?.[0]?.groundingMetadata?.webSearchQueries,
    },
  };

  if (!report.markdownContent) {
    throw new Error("The preliminary report generation (Sections 1-4) failed and returned no content.");
  }

  // --- Step 2: Generate the concluding sections (Section 5) ---
  const section5Prompt = `
**Role:** You are a world-class patent attorney, and you are continuing your work on a patentability report.

**Mission:** Generate ONLY Section 5 of the "Patentability & Prior Art Analysis Report" and the Appendices section. This is a highly focused task to draft the final claims, create a comparison chart, and provide a strategic recommendation based on the previously completed analysis.

**Full Context from Prior Sections (for your reference):**
\`\`\`markdown
${report.markdownContent}
\`\`\`

---
**TASK & OUTPUT INSTRUCTIONS**

Your entire output must be ONLY the markdown for Section 5 and the Appendices section. Do not repeat the title or Sections 1-4.

## Section 5: Best Mode Claim Set & Go/No-Go Assessment

### A. Best Mode Revised Claims
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
- **CRITICAL:** Based on the prior art discovered in Section 2, perform a high-level, preliminary Freedom-to-Operate (FTO) analysis.
- For each of your "Best Mode Revised Claims," identify any discovered prior art that could potentially create an FTO risk (i.e., a risk of infringing that prior art patent if your invention were commercialized).
- Explain briefly why each identified reference poses a potential risk.
- If no FTO risks are apparent from the discovered art, state that "Based on the limited prior art search conducted, no immediate FTO risks were identified. A comprehensive FTO search by legal counsel is recommended."
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
      section5Content = `\n\n## Section 5: Best Mode Claim Set & Go/No-Go Assessment\n\n[ERROR: The AI failed to generate this section.]`;
  }
  
  report.markdownContent = `${report.markdownContent.trim()}\n\n${section5Content.trim()}`;

  // --- Step 3: Generate the Red Team Analysis ---
  const redTeamPrompt = `
**Role:** You are a skeptical "Red Team" patent attorney. Your sole purpose is to find the weaknesses and unstated assumptions in the following patentability report prepared by your colleague. Your critique must be sharp, insightful, and constructive.

**Mission:** Generate ONLY the "Red Team Analysis" markdown section. Follow the structure below exactly.

**Report to Analyze:**
\`\`\`markdown
${report.markdownContent}
\`\`\`

---
**TASK & OUTPUT INSTRUCTIONS**

Your entire output must be ONLY the markdown for the "Red Team Analysis" section. Do not include any other text or explanation.

## Red Team Analysis: A Mandatory Self-Critique

### 1. Key Enablement & Written Description Risks (§112)
- Identify any claim terms that may lack clear antecedent basis in the specification.
- Pinpoint specific claims or features that a Person Having Ordinary Skill In the Art (a "PHOSITA") might argue require undue experimentation to implement, given the level of detail in the disclosure.

### 2. Opposing Counsel's Core Attack Arguments
- Formulate the 2-3 strongest arguments an opposing counsel would use to challenge the validity of the "Best Mode Revised Claims" during litigation or post-grant proceedings.
- Focus on obviousness (§103) arguments, combining references in a compelling way.

### 3. Most Likely Rejection from a Patent Office
- State the single most likely reason (e.g., a specific obviousness combination, a subject matter eligibility issue under §101) that the USPTO or EPO would reject the proposed claims.
- Explain your reasoning concisely.

### 4. Unstated Assumptions & Blind Spots
- What unstated assumptions does the main report make? (e.g., about the market, the PHOSITA's knowledge, the interpretation of a prior art reference).
- What potential areas of prior art might have been missed in the search?
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

  report.markdownContent = `${report.markdownContent}\n\n${redTeamContent || '## Red Team Analysis: A Mandatory Self-Critique\n\n[ERROR: The AI failed to generate the Red Team self-critique section.]'}`;

  // --- Step 4: Perform deep analysis of prior art URLs ---
  const structuredPriorArt = await analyzePriorArtFromReport(report, invention.sourceContent);

  return {
    report,
    priorArt: structuredPriorArt,
  };
};


const formatKnowledgeBaseForPrompt = (kb: KnowledgeBaseEntry[], entryTypeName: string): string => {
  if (!kb || kb.length === 0) {
    return `The user has not provided any "${entryTypeName}" entries.`;
  }
  const MAX_SUMMARY_LENGTH = 1000;
  return `\n--- START ${entryTypeName.toUpperCase()} LIST ---\n${kb.map(entry => {
      // Create a more concise summary instead of dumping raw content
      const claimsSummary = (entry.extractedClaims || []).length > 0 ? ` Key Claims: "${entry.extractedClaims.slice(0, 2).join('"; "')}"` : '';
      const embodimentsSummary = (entry.extractedEmbodiments || []).length > 0 ? ` Key Embodiments: "${entry.extractedEmbodiments.slice(0, 2).join('"; "')}"` : '';
      const notesSummary = (entry.notes || '').substring(0, 400); // Snippet of notes
      
      const summaryParts = [notesSummary, claimsSummary, embodimentsSummary].filter(Boolean);
      const fullSummary = summaryParts.join(' | ');

      return `
**${entryTypeName}: "${entry.title}"**
- Application Number: ${entry.applicationNumber}
- Filing Date: ${entry.filingDate}
- Type: ${entry.type}
- Summary: ${sanitizeForApi(fullSummary).substring(0, MAX_SUMMARY_LENGTH)}
`;
  }).join('\n---\n')}\n--- END ${entryTypeName.toUpperCase()} LIST ---\n`;
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
        
        const figureListSchema = {
            type: Type.ARRAY,
            description: "A list of figures to be generated, with their number and description.",
            items: {
                type: Type.OBJECT,
                properties: {
                    figureNumber: {
                        type: Type.INTEGER,
                        description: "The sequential number of the figure (e.g., 1, 2, 3)."
                    },
                    description: {
                        type: Type.STRING,
                        description: "A detailed, one-sentence description of what this specific figure should illustrate."
                    },
                },
                required: ['figureNumber', 'description'],
            }
        };

        const figureListResponse = await ai.models.generateContent({
            model: GEMINI_MODEL_TEXT,
            contents: listFiguresPrompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: figureListSchema,
            }
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
    if (!ai) throw new Error("Gemini API client is not initialized.");
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
        return JSON.stringify(parsed); // Return the full object as a string
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
    const bestModeHeader = '### A. Best Mode Revised Claims';
    const claimChartHeader = '### B. Claim Chart vs. Closest Art';
    
    const startIndex = content.indexOf(bestModeHeader);
    if (startIndex === -1) { 
        throw new Error("Could not find 'Best Mode' claims in the report. Cannot proceed with claims-first drafting.");
    }

    const contentAfterHeader = content.substring(startIndex + bestModeHeader.length);
    const endIndex = contentAfterHeader.indexOf(claimChartHeader);

    const claimsSection = (endIndex === -1 ? contentAfterHeader : contentAfterHeader.substring(0, endIndex)).trim();
    if (!claimsSection) {
        throw new Error("'Best Mode' claims section was found but is empty. Cannot proceed with claims-first drafting.");
    }
    return claimsSection;
};

export const generateNonProvisionalPatentApplication = async (invention: ExtractedInvention, report: PatentAnalysisReport): Promise<PatentApplication> => {
  if (!ai) throw new Error("Gemini API client is not initialized. Check API Key configuration.");
  if (!invention || !report) throw new Error("Invention and report data are required.");

  const bestPracticesGuide = await getBestPracticesGuideContent();
  const bestModeClaims = getBestModeClaimsFromReport(report);

  const basePromptContext = `
**Source Invention Full Disclosure:**
This is the primary source of truth. Your entire output must be derived from and expand upon the details within this section.
\`\`\`
${invention.sourceContent.substring(0, 200000)}
\`\`\`

**Analysis Report & Strategic Guidance:**
The following report analyzes the invention and contains strategic advice. Use it to guide the narrative, focus, and structure of the application draft. Your draft must focus EXCLUSIVELY on the invention described in the "Source Invention Full Disclosure", guided by the strategic recommendations in the other sections.
\`\`\`
${report.markdownContent.substring(0, 150000)}
\`\`\`
`;

  const systemInstruction = `${bestPracticesGuide}\n\n**Your Role:** You are the world-class patent attorney from the guide. Your task is to generate ONE specific section of a **non-provisional patent application** based on the provided context, adhering strictly to the principles in the "Global Patent Playbook" provided. **CRITICAL:** You MUST generate the full, complete text for the requested section. Do NOT use placeholder text such as "[Insert details here]". CRITICAL: Your response MUST NOT include the section title itself in the content. The title will be added programmatically. **Crucial Constraint on Factual Accuracy:** You must only use information explicitly provided in the source documents and analysis report. Do NOT invent new technical terms, expand acronyms unless the expansion is provided in the source text, or add technical details not supported by the context. Stick strictly to the provided information to avoid introducing factual errors (hallucinations).`;
  const contentSchema = { type: Type.OBJECT, properties: { content: { type: Type.STRING } }, required: ['content'] };

  // Generate all section content first
  const titleResult = await generateSection(`Generate ONLY the "TITLE OF THE INVENTION" for the application.\n\n${basePromptContext}`, contentSchema, systemInstruction);
  const titleContent = JSON.parse(titleResult).content;

  const backgroundResult = await generateSection(`Generate ONLY the "BACKGROUND OF THE INVENTION" section text. Do NOT use placeholders.\n\n${basePromptContext}`, contentSchema, systemInstruction);
  const backgroundContent = JSON.parse(backgroundResult).content;
  
  const claimsFirstSummaryPrompt = `Generate ONLY the "SUMMARY OF THE INVENTION" section text. Your summary MUST provide clear antecedent basis for the key terms in the following claims. Do NOT use placeholders.\n\n**CLAIMS TO SUPPORT:**\n${bestModeClaims}\n\n**FULL CONTEXT:**\n${basePromptContext}`;
  const summaryResult = await generateSection(claimsFirstSummaryPrompt, contentSchema, systemInstruction);
  const summaryContent = JSON.parse(summaryResult).content;
  
  const claimsFirstDescriptionPrompt = `Generate ONLY the "DETAILED DESCRIPTION" section text. Be exhaustive and ensure full antecedent basis and enablement for all terms and limitations in the following claims, describing multiple embodiments as per the playbook. Do NOT use placeholders; write the full content.\n\n**CLAIMS TO SUPPORT:**\n${bestModeClaims}\n\n**FULL CONTEXT:**\n${basePromptContext}`;
  const descriptionResult = await generateSection(claimsFirstDescriptionPrompt, contentSchema, systemInstruction);
  const descriptionContent = JSON.parse(descriptionResult).content;
  
  // Use a more focused prompt for the claims section
  const claimsPrompt = `Based on the provided context and the principles of the "Global Patent Playbook", generate ONLY the formal "CLAIMS" section for a non-provisional application. CRITICAL: Your response MUST NOT include the section title itself.
  
  Your primary task is to use the "Best Mode" claims identified in the analysis report as the independent claims. Then, for each independent claim, you MUST add 3-5 logical, narrowing dependent claims that add further inventive limitations, following the hierarchical structure principle from the playbook.
  
  **Best Mode Claims from Report:**
  ${bestModeClaims}
  
  **Full Context:**
  ${basePromptContext}
  `;
  const claimsResult = await generateSection(claimsPrompt, contentSchema, systemInstruction);
  const claimsContent = JSON.parse(claimsResult).content;

  const abstractResult = await generateSection(`Generate ONLY the "ABSTRACT OF THE DISCLOSURE" section text. CRITICAL: Your response MUST NOT include the section title itself.\n\n${basePromptContext}`, contentSchema, systemInstruction);
  const abstractContent = JSON.parse(abstractResult).content;

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

/**
 * Generates an exhaustive list of embodiments for a provisional application.
 * This is a separate, highly-constrained AI call to ensure reliability.
 * @param basePromptContext The core technical disclosure.
 * @param systemInstruction A focused system instruction.
 * @returns A promise that resolves to an array of embodiment strings.
 */
const generateEmbodimentsListForProvisional = async (
    basePromptContext: string,
    systemInstruction: string
): Promise<string[]> => {
    if (!ai) throw new Error("Gemini API client is not initialized.");

    const prompt = `Based on the provided invention disclosure, generate an exhaustive, "kitchen sink" list of specific embodiments to support a future non-provisional application. Each embodiment should be a distinct, claim-like statement. **Crucial:** Every embodiment must be strictly based on the provided text. Do not invent new features or expand acronyms without explicit support from the text.

Your response MUST be ONLY a JSON object with a single key "embodiments" containing an array of strings. Each string in the array is a single embodiment. Do not include numbering in the strings themselves.

**Invention Disclosure:**
${basePromptContext}`;

    const schema = {
        type: Type.OBJECT,
        properties: {
            embodiments: {
                type: Type.ARRAY,
                description: "An exhaustive list of specific embodiments.",
                items: {
                    type: Type.STRING,
                    description: "A single, specific embodiment written as a claim-like statement."
                }
            }
        },
        required: ['embodiments']
    };

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

        const jsonStr = response.text.trim();
        const parsed = JSON.parse(jsonStr);
        if (parsed && Array.isArray(parsed.embodiments)) {
            return parsed.embodiments;
        }
        return [];
    } catch (error) {
        console.error("Failed to generate embodiments list:", error);
        return [`[ERROR: The embodiments list could not be generated due to an API or parsing issue: ${(error as Error).message}]`];
    }
};

export const generateProvisionalPatentApplication = async (invention: ExtractedInvention, report: PatentAnalysisReport): Promise<PatentApplication> => {
    if (!ai) throw new Error("Gemini API client is not initialized.");
    if (!invention || !report) throw new Error("Invention and report data are required.");

    const bestPracticesGuide = await getBestPracticesGuideContent();
    
    const basePromptContext = `
**Source Invention Full Disclosure:**
This is the primary source of truth. Your entire output must be derived from and expand upon the details within this section.
\`\`\`
${invention.sourceContent.substring(0, 200000)}
\`\`\`

**Analysis Report & Strategic Guidance:**
The following report analyzes the invention and contains strategic advice. Use it to guide the narrative, focus, and structure of the application draft.
\`\`\`
${report.markdownContent.substring(0, 150000)}
\`\`\`
`;

    const provisionalSystemInstruction = `${bestPracticesGuide}\n\n**Your Role:** You are the world-class patent attorney from the guide. Your task is to generate the prose sections of a **provisional patent application**. Your primary goal is to create a rich, detailed, and comprehensive technical disclosure to establish the strongest possible priority date.

**Strategic Mandate:** The entire specification, especially the "Detailed Description" and the list of embodiments, must be viewed as a strategic asset-building process. The exhaustive list of embodiments serves as the direct precursors to a wide variety of future non-provisional claims. Your mission is to maximize this disclosure to provide the broadest possible foundation for future claiming.

**CRITICAL DIRECTIVES FOR PROVISIONAL DRAFTING:**
1.  **Maximize Disclosure (Kitchen Sink Philosophy):** Every sentence you write should be aimed at supporting future claims. Describe every feature, alternative, and embodiment in painstaking detail.
2.  **No Placeholders:** You must write the full, complete text for the requested sections.
3.  **No Repetition:** Ensure the content in the "Summary" and "Detailed Description" is distinct and not merely a copy of each other. The Summary should be a high-level overview, while the Detailed Description must provide exhaustive elaboration and further details not present in the summary.
4.  **Completeness:** Ensure that no section ends abruptly or with an incomplete sentence.
5.  **Crucial Constraint on Factual Accuracy:** You must only use information explicitly provided in the source documents and analysis report. Do NOT invent new technical terms, expand acronyms unless the expansion is provided in the source text, or add technical details not supported by the context. Stick strictly to the provided information to avoid introducing factual errors (hallucinations).
6.  **CRITICAL:** Your response MUST NOT include the section titles themselves (e.g., "BACKGROUND OF THE INVENTION") in the content. The title will be added programmatically.`;

    const contentSchema = { 
        type: Type.OBJECT, 
        properties: { 
            title: { type: Type.STRING },
            background: { type: Type.STRING },
            summary: { type: Type.STRING },
            descriptionProse: { type: Type.STRING },
            abstract: { type: Type.STRING },
        }, 
        required: ['title', 'background', 'summary', 'descriptionProse', 'abstract'] 
    };
    
    // Generate all prose sections in a single call to maintain context and avoid duplication/truncation
    const fullProsePrompt = `Generate the full prose content for a provisional patent application based on the provided context. You must generate complete, distinct, and non-repetitive content for each of the following sections in the specified JSON schema: title, background, summary, descriptionProse, and abstract.

- **title:** The official title of the invention.
- **background:** Explain the technical field, problems with existing solutions, and the context that makes this invention necessary and useful.
- **summary:** A high-level overview of the invention, its main components, and its key advantages and benefits.
- **descriptionProse:** The rich, narrative part of the "Detailed Description". It MUST elaborate significantly beyond the summary and describe every conceivable alternative and variation. It MUST NOT contain a numbered list of embodiments or refer to figures.
- **abstract:** A brief, one-paragraph abstract of the disclosure.

**Full Context:**
${basePromptContext}
`;
    
    const proseResultString = await generateSection(fullProsePrompt, contentSchema, provisionalSystemInstruction);
    
    let proseSections: any = {};
    if (proseResultString.startsWith('[ERROR:')) {
        console.error("Prose generation failed:", proseResultString);
    } else {
        proseSections = JSON.parse(proseResultString);
    }
    
    const { 
        title: titleContent = "[ERROR: Title generation failed]",
        background: backgroundContent = "[ERROR: Background generation failed]",
        summary: summaryContent = "[ERROR: Summary generation failed]",
        descriptionProse: descriptionProseContent = "[ERROR: Detailed Description prose generation failed]",
        abstract: abstractContent = "[ERROR: Abstract generation failed]"
    } = proseSections;

    // Generate the embodiments list separately for reliability.
    const embodimentList = await generateEmbodimentsListForProvisional(basePromptContext, "You are an expert patent attorney drafting a list of embodiments. Follow the instructions precisely.");
    const formattedEmbodiments = embodimentList.map((item, index) => `${index + 1}. ${item}`).join('\n');
    
    const descriptionContent = `${descriptionProseContent}\n\n---\n\n### List of Embodiments\n\n${formattedEmbodiments}`;
    
    // Assemble the document
    let markdownContent = ``;
    markdownContent += `TITLE OF THE INVENTION\n\n${titleContent}\n\n`;
    markdownContent += `BACKGROUND OF THE INVENTION\n\n${backgroundContent}\n\n`;
    markdownContent += `SUMMARY OF THE INVENTION\n\n${summaryContent}\n\n`;
    markdownContent += `DETAILED DESCRIPTION OF THE INVENTION\n\n${descriptionContent}\n\n`;
    markdownContent += `ABSTRACT OF THE DISCLOSURE\n\n${abstractContent}\n\n`;
    
    return { type: 'provisional', markdownContent, figures: undefined };
};

export const refinePatentApplication = async (application: PatentApplication, reviewReport: string): Promise<PatentApplication> => {
    if (!ai) throw new Error("Gemini API client is not initialized.");
    if (!application.markdownContent || !reviewReport) {
        throw new Error("Application content and review report are required for refinement.");
    }
    
    const systemInstruction = `You are a world-class patent attorney tasked with revising a patent application draft based on a quality control (QC) report. Your goal is to produce a final, polished version of the application that addresses all identified issues.`;

    const prompt = `
**TASK:**
Rewrite the entire patent application provided below to correct all the issues identified in the accompanying QC report. Your output MUST be the complete, revised application text in Markdown format.

**CRITICAL INSTRUCTIONS:**
1.  **Address All Issues:** Directly fix every problem mentioned in the QC report. This includes, but is not limited to:
    *   **Truncation:** Scrutinize every section for text that ends abruptly or seems incomplete. Complete any unfinished sentences or sections logically based on the surrounding context.
    *   **Duplication:** Rephrase content to eliminate verbatim or near-verbatim duplication between the 'Summary' and 'Detailed Description' sections. Each section must serve its distinct purpose: the Summary provides a high-level overview, and the Detailed Description provides exhaustive elaboration with further details.
    *   **Factual Grounding:** Ensure all technical terms and acronyms are consistent with the original source material. Do not introduce new information.
    *   **Formatting:** Fix any identified formatting errors to ensure the document is clean and readable.
2.  **Preserve Structure and Integrity:** Your output must retain the original structure of the application (e.g., TITLE, BACKGROUND, SUMMARY, DETAILED DESCRIPTION, CLAIMS, ABSTRACT). You must not omit any sections.
3.  **Return Full Document Only:** Your response MUST contain ONLY the full, rewritten markdown text of the entire patent application. Do not add any introductory phrases, apologies, or explanations like "Here is the revised version:". The response should begin directly with "TITLE OF THE INVENTION".
4.  **Maintain Voice and Style:** The revised text must maintain the formal tone and style appropriate for a patent application.

---
**DRAFT APPLICATION TO REVISE:**
---
\`\`\`markdown
${application.markdownContent}
\`\`\`
---
**QC VULNERABILITY REPORT (ISSUES TO FIX):**
---
\`\`\`markdown
${reviewReport}
\`\`\`
---
`;

    const response = await ai.models.generateContent({
        model: GEMINI_MODEL_TEXT,
        contents: prompt,
        config: {
            systemInstruction,
            temperature: 0.2, // Low temperature for factual revision
        }
    });

    const refinedContent = response.text.trim();

    if (!refinedContent) {
        throw new Error("AI refinement failed to produce any content.");
    }

    return {
        ...application,
        markdownContent: refinedContent,
    };
};

export const reviewProvisionalApplication = async (applicationText: string): Promise<string> => {
    if (!ai) return "Review failed: Gemini API client is not initialized.";

    const prompt = `
**Role:** You are an expert patent paralegal performing a final quality control check on a provisional patent application draft. Your standards are exceptionally high.

**Task:** Review the following draft and provide a concise markdown report identifying any potential issues.

**Draft to Review:**
\`\`\`markdown
${applicationText.substring(0, 200000)}
\`\`\`

**QC Checklist & Report Format:**
Your entire output must be a single markdown document. Address each point below with a clear "Yes", "No", or specific comment.

## Provisional Application QC Report

### 1. Section Completeness
- **Title:** [Present/Missing]
- **Background:** [Present/Missing]
- **Summary:** [Present/Missing]
- **Detailed Description:** [Present/Missing]
- **Abstract:** [Present/Missing]

### 2. Embodiments Checklist
- **Presence of Embodiments Section:** Is there a distinct section for embodiments (e.g., titled "### List of Embodiments" or similar)? [Yes/No]
- **Numbered List Format:** Are the embodiments presented as a numbered list? [Yes/No]
- **Quantity:** Note the approximate number of embodiments. Is it a substantial list (e.g., >20)? [e.g., "Yes, ~35 embodiments found" or "No, only 5 found"]

### 3. Content Integrity
- **Truncation:** **CRITICAL:** Scrutinize every section for text that ends abruptly or seems incomplete. Are there any obvious signs of truncated text (e.g., sentences ending in "...")? [Yes/No/Comments - Be specific about where the truncation occurs]
- **Duplication:** **CRITICAL:** Compare the "Summary" and "Detailed Description" sections carefully. Is there significant verbatim duplication of paragraphs or long sentences between them? Also check for duplicated sentences within the same section. [Yes/No/Comments - Be specific about which paragraphs are duplicated]
- **Factual Grounding:** **CRITICAL:** Does the text appear to introduce new technical terms or acronyms that were not present in the original source material? [Yes/No/Comments - Point out any specific examples you find]
- **Formatting:** Are there any major formatting issues that make the document hard to read? [Yes/No/Comments]

### 4. Overall Assessment
- Provide a brief, one-paragraph summary of your findings and a final recommendation (e.g., "Ready for filing," "Minor revisions recommended," or "Significant issues found that require attention before filing.").
`;

    const response = await ai.models.generateContent({
        model: GEMINI_MODEL_TEXT,
        contents: prompt,
        config: { temperature: 0.1 }
    });

    return response.text;
};

export const simulateProsecution = async (applicationText: string): Promise<string> => {
    if (!ai) return "Simulation failed: Gemini API client is not initialized.";
    const bestPracticesGuide = await getBestPracticesGuideContent();

    const prompt = `
**Role:** You are a team of two experts: a seasoned USPTO patent examiner and a "red team" attorney from a rival firm. You will collaborate to create a "Prosecution Vulnerability Report" for the following non-provisional patent application draft.

**Draft to Analyze:**
\`\`\`markdown
${applicationText.substring(0, 200000)}
\`\`\`

**Task & Report Format:**
Your entire output must be a single markdown document following the structure below precisely.

## Prosecution Vulnerability Report

### 1. Simulated Examiner's Office Action Summary
*As the Examiner:*
- Review the claims and specification.
- Identify the most likely grounds for rejection under 35 U.S.C.
- For each section (§101, §102, §103, §112), briefly state the potential rejection and which claims would be affected. Be concise and direct, as in a real office action summary.

- **§101 (Subject Matter Eligibility):** [Your analysis here]
- **§102 (Novelty):** [Your analysis here - you may hypothesize a piece of prior art if needed]
- **§103 (Obviousness):** [Your analysis here - you may hypothesize a combination of prior art]
- **§112 (Specification Requirements):**
    - **Written Description/Enablement:** Does the specification provide adequate support for the full scope of the claims? **Crucially, are there any terms or acronyms used that lack clear antecedent basis in the original disclosure?** [Your analysis here]
    - **Indefiniteness:** [Your analysis here]

### 2. Post-Grant Challenge Assessment
*As the Red Team Attorney:*
- Identify the 1-3 weakest claims that would be the primary targets in a Post-Grant Review (PGR) or Inter Partes Review (IPR).
- Outline the strongest arguments an opposing counsel would use to invalidate those claims.
- Identify any "patent profanity" or limiting statements in the specification that could be used to narrow claim scope during litigation.

### 3. Strategic Recommendation
*As a unified team:*
- Provide a brief, one-paragraph summary of the draft's vulnerabilities.
- Suggest 2-3 specific actions the applicant could take (e.g., "Amend claim 1 to include...", "Add further detail to the specification regarding...") to strengthen the application against the issues you identified.
`;
    const response = await ai.models.generateContent({
        model: GEMINI_MODEL_TEXT,
        contents: prompt,
        config: { systemInstruction: bestPracticesGuide, temperature: 0.5 }
    });

    return response.text;
};
