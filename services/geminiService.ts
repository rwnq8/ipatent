import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { GEMINI_MODEL_TEXT } from '../constants';
import { PatentAnalysisReport, PatentApplication, KnowledgeBaseEntry, KnowledgeBaseFile, GroundingMetadata, StructuredKnowledgeBaseData } from "../types";
import { sanitizeForFilename } from "./utils";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error("Gemini API Key is not configured. Please set the API_KEY environment variable.");
}

const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;

/**
 * Generates a unique, content-based project codename using the Gemini API.
 * @param inventionDescription The textual content of the invention.
 * @returns A promise that resolves to a kebab-case project codename string.
 */
export const generateProjectCodename = async (inventionDescription: string): Promise<string> => {
  if (!ai) {
    throw new Error("Gemini API client is not initialized. Check API Key configuration.");
  }

  const fallbackCodename = `fallback-project-${Date.now().toString().slice(-6)}`;

  if (!inventionDescription.trim()) {
    return fallbackCodename;
  }

  // Take a slice of the content to keep the request lightweight
  const contentSample = inventionDescription.substring(0, 4000);

  const prompt = `Based on the following document text, generate a short, 2-3 word, memorable project codename in kebab-case (e.g., 'quantum-computer-design' or 'novel-drug-delivery'). The codename should be relevant to the text's subject matter.

Respond with ONLY the kebab-case codename and nothing else. Do not include any explanation, backticks, or other text.

Example response:
solar-panel-efficiency

Document text:
---
${contentSample}
---`;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_MODEL_TEXT,
      contents: prompt,
      config: {
        temperature: 0.4,
        topK: 10,
        topP: 0.9,
        // Disable thinking for this simple, fast task
        thinkingConfig: { thinkingBudget: 0 }
      }
    });

    const codename = response.text?.trim();

    if (!codename) {
      console.warn("Gemini API returned an empty codename, using fallback.");
      return fallbackCodename;
    }

    // Sanitize the response to ensure it's a valid codename
    const sanitized = sanitizeForFilename(codename);
    return sanitized || fallbackCodename;

  } catch (error) {
    console.error("Error generating project codename:", error);
    // Return a fallback if the API call fails
    return fallbackCodename;
  }
};


/**
 * Parses a JSON string from an AI response and validates its structure.
 * This function handles markdown code fences and ensures each item in the array conforms to the validator function.
 * @param jsonStr The raw string from the AI, which may contain JSON.
 * @param validator A function that takes a single item and throws an error if it's invalid.
 * @returns A validated array of the expected type.
 */
function parseAndValidateJsonArray<T>(
  jsonStr: string,
  validator: (item: any) => void
): T[] {
  let cleanJsonStr = jsonStr.trim();
  const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
  const match = cleanJsonStr.match(fenceRegex);
  if (match && match[2]) {
    cleanJsonStr = match[2].trim();
  }

  const parsedData = JSON.parse(cleanJsonStr);

  if (!Array.isArray(parsedData)) {
    throw new Error("AI response was not a valid JSON array.");
  }

  for (const item of parsedData) {
    validator(item);
  }

  return parsedData as T[];
}

/**
 * Validator function specifically for StructuredKnowledgeBaseData objects.
 * Throws an error with a descriptive message if validation fails.
 * @param item The object to validate.
 */
const validateStructuredKbItem = (item: any) => {
    if (typeof item !== 'object' || item === null) {
        throw new Error('AI response included a non-object item in the main array.');
    }
    if (typeof item.title !== 'string') {
        throw new Error(`Invalid 'title' in AI response: expected string, got ${typeof item.title}.`);
    }
    if (typeof item.applicationNumber !== 'string') {
        throw new Error(`Invalid 'applicationNumber' in AI response: expected string, got ${typeof item.applicationNumber}.`);
    }
    if (typeof item.filingDate !== 'string') {
        throw new Error(`Invalid 'filingDate' in AI response: expected string, got ${typeof item.filingDate}.`);
    }
    if (item.type !== 'provisional' && item.type !== 'non-provisional') {
        throw new Error(`Invalid 'type' in AI response: expected 'provisional' or 'non-provisional', got '${item.type}'.`);
    }
    if (!Array.isArray(item.extractedClaims)) {
        throw new Error(`Invalid 'extractedClaims' in AI response: expected array, got ${typeof item.extractedClaims}.`);
    }
    if (!Array.isArray(item.fileNames)) {
        throw new Error(`Invalid 'fileNames' in AI response: expected array, got ${typeof item.fileNames}.`);
    }
};


const formatKnowledgeBaseForPrompt = (kb: KnowledgeBaseEntry[]): string => {
  if (!kb || kb.length === 0) {
    return "The user has not provided an existing IP portfolio or discovered any prior art for consideration.";
  }

  const ownerEntries = kb.filter(e => e.isOwner);
  const priorArtEntries = kb.filter(e => !e.isOwner);

  let prompt = '';

  if (ownerEntries.length > 0) {
    prompt += `\n\n---
**CRITICAL CONTEXT: YOUR PORTFOLIO (OWNER)**
---
This section details YOUR existing patent portfolio. This information is paramount. Use it to:
1.  **Determine Priority Claims:** Identify if the new invention can claim priority to any provisional applications listed here.
2.  **Ensure Strategic Consistency:** Align the strategy with your portfolio's trajectory.
3.  **Avoid 'Double Patenting':** Ensure new claims are distinct from existing non-provisional claims.
---
`;
    prompt += ownerEntries.map(entry => {
      const combinedFileContent = entry.files.map(f => `--- FILE: ${f.name} ---\n${f.content}`).join('\n\n');
      return `
**Portfolio Entry ID:** ${entry.id}
*   **Title:** ${entry.title}
*   **Application Number:** ${entry.applicationNumber}
*   **Filing Date:** ${entry.filingDate}
*   **Type:** ${entry.type}
*   **Claims Priority To Application ID:** ${entry.priorityTo || 'Not Applicable'}
*   **Full Textual Content (from all associated files):**
    \`\`\`text
    ${combinedFileContent}
    \`\`\`
`}).join('\n---\n');
  }

  if (priorArtEntries.length > 0) {
    prompt += `\n\n---
**CRITICAL CONTEXT: DISCOVERED PRIOR ART (THIRD-PARTY)**
---
This section details relevant prior art discovered during analysis. You MUST use this information to:
1.  **Challenge Patentability:** Assess how these documents impact the novelty and non-obviousness of the user's invention.
2.  **Identify FTO Risks:** Determine if any *in-force* patents listed here pose a Freedom-to-Operate risk.
3.  **Find Strategic Opportunities:** Analyze these documents for unclaimed disclosures, design-around possibilities, or technology gaps.
---
`;
    prompt += priorArtEntries.map(entry => `
**Prior Art Entry:**
*   **Title/Identifier:** ${entry.title}
*   **Type:** ${entry.type}
*   **Notes/Summary:** ${entry.notes}
*   **Full Text (if available):**
    \`\`\`text
    ${entry.files[0]?.content || 'Content not available.'}
    \`\`\`
`).join('\n---\n');
  }

  prompt += '\n--- END OF KNOWLEDGE BASE ---\n\n';
  return prompt;
};

export const constructPrompt = (inventionDescription: string, knowledgeBase: KnowledgeBaseEntry[]): string => {
  const knowledgeBasePromptSection = formatKnowledgeBaseForPrompt(knowledgeBase);
  // Refactored for conciseness to mitigate MAX_TOKENS issues.
  return `
**Role:** Expert Patent Attorney & Prior Art Specialist.

**Mission:** Conduct a comprehensive patentability, FTO, and strategic opportunity analysis.
*   **Foundation:** Use the provided "Invention Description," the internal "Knowledge Base" (if any), and MANDATORY Google Search for all external prior art (patents & NPL).
*   **Core Task:** Produce a single, structured Markdown report. Be unflinchingly honest, highlighting risks and weaknesses.
*   **Output:** The report must be detailed and analytical, not a cursory summary.

${knowledgeBasePromptSection}

**Provided Invention Description:**
---
${inventionDescription}
---

**MANDATORY REPORT STRUCTURE & KEY FORMATTING:**

*   **Markdown Structure:** Use ## for main sections and ### for subsections.
*   **Claims:** Format ALL claims (initial and revised) inside Markdown blockquotes (e.g., \`> **Claim 1:** ...\`).
*   **Grading:** ALL claim grades MUST be bolded and include a color cue (e.g., \`Grade: **A (Green - Strong)**\`).
*   **Links:** ALL patent/NPL citations with URLs MUST be inline Markdown links (e.g., \`[US X,XXX,XXX](URL)\`).

**REPORT SECTIONS (Strict Order):**

**## Section 1: Invention Claims**
*   If explicit claims exist in the description, use them. Otherwise, infer formal claims from the text. These are the "Initial Claims."

**## Section 2: Consolidated Prior Art & FTO Assessment**
*   **A. Prior Art Impact:** Summarize key prior art affecting patentability of Initial Claims. For each Initial Claim, provide an overall patentability grade (**A-F**) with brief reasoning. Refer to Appendix A for details.
*   **B. FTO Assessment:** Summarize key IN-FORCE patents that pose an FTO risk. Provide an overall risk assessment (High, Medium, Low).

**## Section 3: Strategic Opportunity Analysis**
*   Analyze prior art to find: Unclaimed disclosures, technology gaps, and design-around opportunities that create new patentable subject matter for the user.

**## Section 4: Leveraging Expired & Lapsed Patents**
*   Summarize how teachings from expired patents can be freely incorporated or used as a foundation for new claims.

**## Section 5: "Best Mode" Revised Claims & Strategic Go/No-Go**
*   **A. "Best Mode" Revised Claims:** Based on all analysis, draft a new, optimized set of claims engineered for global strength.
*   **B. Assessment of Revised Claims:** For each revised claim, provide a projected strength grade (**A-C**) with rationale.
*   **C. Strategic Go/No-Go:** Provide a final recommendation (e.g., "Strong Go," "Cautious Go," "Pivot Essential") with key benefits and risks of proceeding.

**--- APPENDICES ---**

**## Appendix A: Detailed Prior Art & FTO Analysis**
*   For each prior art document, use a \`### **Analysis of [Doc Name]:**\` heading.
*   Include: Full citation with link, assignee/authors, key dates, estimated status (Active/Expired), key disclosures, detailed mapping against Initial Claims (for patentability), and FTO implications (if in-force).

**## Appendix B: Search Strategy & Keywords Utilized**
*   Briefly outline search strategy, databases queried, and keywords used.
`;
};

export const generatePatentReport = async (inventionDescription: string, knowledgeBase: KnowledgeBaseEntry[]): Promise<PatentAnalysisReport> => {
  if (!ai) {
    throw new Error("Gemini API client is not initialized. Check API Key configuration.");
  }

  if (!inventionDescription.trim()) {
    throw new Error("Invention description cannot be empty.");
  }

  const prompt = constructPrompt(inventionDescription, knowledgeBase);

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_MODEL_TEXT,
      contents: prompt,
      config: {
        temperature: 0.2, // Increased to allow some creative synthesis while remaining factual.
        topK: 32,         // Broadened to allow more token choices.
        topP: 0.95,       // Standard value, gives model flexibility.
        tools: [{googleSearch: {}}], // Enable Google Search is critical
      }
    });

    if (response.candidates?.[0]?.finishReason && response.candidates[0].finishReason !== 'STOP') {
      const reason = response.candidates[0].finishReason;
      const message = response.candidates[0].finishMessage || 'No additional details provided.';
      if (reason === 'MAX_TOKENS' || reason === 'SAFETY' || reason === 'RECITATION' || reason === 'OTHER') {
         throw new Error(`Report generation halted. Reason: ${reason}. Details: ${message}. The task's complexity or length may have exceeded model limits. Consider simplifying the input or breaking it down if possible.`);
      }
      throw new Error(`Report generation was interrupted or incomplete. Reason: ${reason}. Details: ${message}`);
    }
    
    const markdownContent = response.text;
    if (!markdownContent || markdownContent.trim() === "") {
        throw new Error("Received an empty report from the API. The task may have been too complex, resulted in no output, or generation was stopped. Ensure the input document provides sufficient detail for analysis.");
    }

    const groundingMetadata: GroundingMetadata | undefined = response.candidates?.[0]?.groundingMetadata as GroundingMetadata | undefined;

    return { markdownContent, groundingMetadata };

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    if (error instanceof Error) {
        if (error.message.includes("API key not valid")) {
             throw new Error("Invalid Gemini API Key. Please check your configuration.");
        }
        if (error.message.includes("responseMimeType") && error.message.includes("tool")) {
            throw new Error("Configuration error: responseMimeType: application/json cannot be used with the Google Search tool. Please check API call configuration.");
        }
        if (error.message.toLowerCase().includes("timeout") || error.message.toLowerCase().includes("deadline_exceeded") || error.message.toLowerCase().includes("504 gateway time-out") || error.message.toLowerCase().includes("took too long")) {
            throw new Error("The request to Gemini API timed out. This comprehensive analysis is resource-intensive and took longer than the allowed limit. Try simplifying the input document or, if feasible, breaking down the analysis into smaller parts. The tool's depth can lead to extended processing times.");
        }
        throw new Error(`Failed to generate report: ${error.message}`);
    }
    throw new Error("An unknown error occurred while generating the report.");
  }
};

export const generateNonProvisionalPatentApplication = async (inventionDescription: string, analysisReport: string, knowledgeBase: KnowledgeBaseEntry[]): Promise<PatentApplication> => {
  if (!ai) {
    throw new Error("Gemini API client is not initialized. Check API Key configuration.");
  }
  if (!inventionDescription.trim() || !analysisReport.trim()) {
    throw new Error("Invention description and analysis report are required to generate an application.");
  }

  const systemInstruction = `**Mission:** You are a world-class US and international patent attorney with deep, integrated expertise in the USPTO MPEP, seminal US case law, and international/PCT best practices. Your task is to generate a complete, professionally formatted, and strategically optimized non-provisional utility patent application, **taking into account the user's existing patent portfolio provided in the prompt.**

**Guiding Principles & Legal Frameworks (Adherence is Mandatory):**

*   **Core US Requirements (35 U.S.C. § 112):**
    *   **Enablement:** The Detailed Description must teach a Person Having Ordinary Skill In The Art (PHOSITA) how to make and use the full scope of the claimed invention without undue experimentation.
    *   **Written Description:** The specification must demonstrate possession of the claimed invention. Every limitation in every claim must have clear, explicit, and literal support in the specification. This is non-negotiable for international viability (especially EPO/China).
    *   **Best Mode:** The specification must disclose the best mode contemplated by the inventor. Assume the "Best Mode" claims and the detailed description you create fulfill this.
*   **US Case Law Integration (Strategic Drafting):**
    *   **§ 101 Subject Matter Eligibility (*Alice/Mayo*):** For software/business methods, the description MUST frame the invention as a **technical solution to a technical problem**. Avoid abstract ideas. Clearly articulate how the invention improves a specific technology or computer functionality (e.g., increased speed, reduced memory usage, enhanced data security).
    *   **§ 103 Non-Obviousness (*KSR*):** The description MUST proactively argue for non-obviousness. Articulate *why* the invention is not a mere predictable combination of prior art elements. Highlight **unexpected results, synergistic effects, the solving of a long-felt but unsolved need, or the failure of others.**
    *   **§ 112(b) Definiteness (*Nautilus*):** Claims must be "reasonably certain" and inform a PHOSITA about the scope of the invention. Avoid all ambiguous or subjective terms (e.g., "approximately," "substantially," "about") unless they are clearly defined and supported by objective criteria in the specification.
*   **International & PCT Best Practices:**
    *   **Problem-Solution Approach (EPO/PCT):** Structure the Background and Summary to implicitly follow this model. Clearly identify the closest prior art, define the "objective technical problem" it fails to solve, and present the claimed invention as the non-obvious solution.
    *   **Unity of Invention (PCT/EPO):** Ensure all claims are linked by a "single general inventive concept." The independent claims should embody this core concept.
    *   **Broad-to-Narrow Claiming:** Draft a strategic set of claims starting with a broad independent claim, followed by dependent claims that progressively narrow the scope, adding specific features and fall-back positions. Include multiple claim types (e.g., method, system, apparatus, computer-readable medium) for comprehensive protection.
*   **General Drafting Principles:**
    *   **Formal Tone:** Use precise, objective, and unambiguous language.
    *   **Antecedent Basis:** Strictly enforce antecedent basis for all claim terms.
    *   **No Figures:** This is a **text-only** application. Do NOT create or reference figures or drawings. The disclosure must be entirely self-sufficient from the text.`;
    
  const knowledgeBasePromptSection = formatKnowledgeBaseForPrompt(knowledgeBase);
  
  const userPrompt = `${knowledgeBasePromptSection}

Based on the provided "Internal Knowledge Base", "Invention Description", and "Patentability & Prior Art Analysis Report", generate a complete non-provisional patent application.

---
**SOURCE 1: Invention Description**
---
${inventionDescription}
---

---
**SOURCE 2: Patentability & Prior Art Analysis Report**
---
${analysisReport}
---

**MANDATORY PATENT APPLICATION STRUCTURE**

## TITLE OF THE INVENTION
*   Generate a concise, descriptive title that reflects the invention's field and primary benefit.

## CROSS-REFERENCE TO RELATED APPLICATIONS
*   **CRITICAL:** Based *only* on the "Internal Knowledge Base" provided, determine if this application should claim priority to a previous filing (e.g., a provisional application). If an appropriate provisional application exists in the knowledge base, state: "This application claims the benefit of U.S. Provisional Application No. [Application Number], filed on [Filing Date], which is incorporated by reference herein in its entirety." If it's a continuation of a non-provisional, format accordingly. If no basis for a priority claim is found in the knowledge base, state "Not Applicable".

## BACKGROUND OF THE INVENTION
### Field of the Invention
*   Briefly state the general technical field.
### Description of the Related Art
*   Following the **Problem-Solution Approach**, synthesize the prior art discussion from the Analysis Report.
*   Describe the existing technological landscape and the **objective technical problems** or shortcomings within it.
*   Frame the prior art without admitting it teaches key elements of your invention. Conclude by stating that a need exists for an invention that overcomes these specific, identified deficiencies.

## BRIEF SUMMARY OF THE INVENTION
*   Provide a high-level summary that introduces the invention as the **solution to the problems** outlined in the Background.
*   Paraphrase the independent claims to establish clear antecedent basis and introduce the core inventive concept.
*   **Crucially:** Explicitly state the invention's technical advantages and how it provides a non-obvious solution, referencing concepts like unexpected results or synergistic effects (to address *KSR*).

## DETAILED DESCRIPTION OF THE INVENTION
*   **This section is paramount for meeting global § 112 requirements.**
*   **"Kitchen Sink" Approach:** Be exhaustive. Incorporate all relevant details from the original invention description AND the analysis report. Specifically integrate findings from the "Strategic Opportunity Analysis" and "Leveraging Expired Patents" sections to describe alternative embodiments, fall-back positions, and wider applications. The goal is to create a rich disclosure that supports a wide range of future claim amendments and provides robust defense against prior art.
*   Provide a thorough, enabling, **text-only** disclosure. Start with a general overview.
*   **Structure and Function:** Describe components/elements, their structure, interconnections, and function.
*   **Operation:** For methods, describe each step in sequence, explaining the "how" and "why."
*   **Enablement & Written Description:** Ensure every feature in the "CLAIMS" section has explicit, literal support. Define all terms.
*   **§ 101 / *Alice* Support:** Weave in language describing how the invention provides a **technical improvement** over the prior art (e.g., "This configuration of the server reduces database query latency by 40% compared to conventional systems...").
*   **§ 103 / *KSR* Support:** Include statements that highlight non-obvious aspects (e.g., "While the art teaches component A and component B separately, it was unexpected that their combination in this manner would solve the long-standing problem of X, a result not suggested by the prior art.").
*   **Alternative Embodiments:** Textually describe variations to provide broad support. This is vital for claim scope and avoiding design-arounds.
*   **Use the Full Source Material:** Draw heavily from the "Invention Description" and "Analysis Report" to build a rich narrative, inventing plausible technical details where needed for a complete disclosure.

## CLAIMS
*   **CRITICAL:**
*   1. Find the "Best Mode" Revised Claims in Section 5.A of the provided Analysis Report.
*   2. List those claims VERBATIM as the initial claims, ensuring proper format (e.g., "1. A device, comprising:", "2. The device of claim 1, wherein...").
*   3. Add further logical dependent claims that properly narrow scope and introduce additional patentable features.
*   4. Ensure correct numbering and dependency.
*   5. Review all claims for clarity, definiteness (*Nautilus*), and perfect antecedent basis.

## ABSTRACT OF THE DISCLOSURE
*   Provide a concise summary (under 150 words) of the disclosure as a single paragraph.
*   The abstract should state what the invention is (e.g., a method, a system), what technical problem it solves, and its principal use.`;


  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_MODEL_TEXT,
      contents: userPrompt,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.1,
        topK: 5,
        topP: 0.9,
      }
    });

    if (response.candidates?.[0]?.finishReason && response.candidates[0].finishReason !== 'STOP') {
      const reason = response.candidates[0].finishReason;
      const message = response.candidates[0].finishMessage || 'No additional details provided.';
      throw new Error(`Application generation halted. Reason: ${reason}. Details: ${message}.`);
    }

    const markdownContent = response.text;
    if (!markdownContent || markdownContent.trim() === "") {
        throw new Error("Received an empty patent application from the API.");
    }
    
    return { type: 'non-provisional', markdownContent };

  } catch (error) {
    console.error("Error calling Gemini API for patent application:", error);
    if (error instanceof Error) {
        throw new Error(`Failed to generate patent application: ${error.message}`);
    }
    throw new Error("An unknown error occurred while generating the patent application.");
  }
};

export const generateProvisionalPatentApplication = async (inventionDescription: string, analysisReport: string, knowledgeBase: KnowledgeBaseEntry[]): Promise<PatentApplication> => {
  if (!ai) {
    throw new Error("Gemini API client is not initialized. Check API Key configuration.");
  }
  if (!inventionDescription.trim() || !analysisReport.trim()) {
    throw new Error("Invention description and analysis report are required to generate an application.");
  }

  const systemInstruction = `**Mission:** You are a highly skilled patent agent and inventor's assistant. Your mission is to draft a comprehensive "kitchen-sink" U.S. Provisional Patent Application. The primary goal is to establish the earliest possible priority date by capturing the broadest possible scope of the invention and all conceivable embodiments. This document must be a complete and enabling disclosure, serving as a robust foundation for a future non-provisional application.

**Guiding Principles:**

*   **Disclosure is King:** The priority is a complete and thorough technical disclosure. Formalism and legal jargon are secondary to technical completeness.
*   **"Kitchen Sink" Philosophy:** Include everything. If a feature is mentioned in the invention description, the analysis report, or could be reasonably inferred as an alternative, it MUST be included. Err on the side of over-inclusion.
*   **Technical Whitepaper Style:** The tone should be that of a detailed technical whitepaper or an inventor's comprehensive logbook, not a formal legal document. Clarity and technical detail are paramount.
*   **No Formal Claims:** Do not include a formal "CLAIMS" section. Instead, create a "List of Embodiments/Aspects" to capture the inventive concepts in sentence form.`;
    
  const knowledgeBasePromptSection = formatKnowledgeBaseForPrompt(knowledgeBase);
  
  const userPrompt = `${knowledgeBasePromptSection}

Based on the provided "Internal Knowledge Base", "Invention Description", and "Patentability & Prior Art Analysis Report", generate a verbose and comprehensive U.S. Provisional Patent Application.

---
**SOURCE 1: Invention Description**
---
${inventionDescription}
---

---
**SOURCE 2: Patentability & Prior Art Analysis Report (Use this for ideas, alternatives, and detailed descriptions)**
---
${analysisReport}
---

**MANDATORY PROVISIONAL APPLICATION STRUCTURE**

## TITLE OF THE INVENTION
*   Generate a concise, descriptive title.

## BACKGROUND OF THE INVENTION
*   Briefly describe the general field of the invention.
*   Discuss the problems with existing solutions, drawing from the "Related Art" and "Prior Art Analysis" sections of the report.

## SUMMARY OF THE INVENTION
*   Provide a clear, high-level overview of the invention.
*   Describe its main components or steps and how they solve the problems mentioned in the background.
*   Highlight the key advantages and benefits.

## BRIEF DESCRIPTION OF THE DRAWINGS
*   **Conditionally include this section ONLY if the invention description explicitly or implicitly refers to figures (e.g., "as shown in FIG. 1," "the system 100 includes component 102," etc.).**
*   If included, provide a brief, one-sentence description for each hypothetical figure.
*   Example: "FIG. 1 is a block diagram illustrating the system architecture in accordance with one embodiment."
*   **If the source text does not reference any figures, COMPLETELY OMIT this section.**

## DETAILED DESCRIPTION OF THE INVENTION
*   **CRITICAL SECTION:** This must be an exhaustive, "kitchen-sink" disclosure to satisfy 35 U.S.C. § 112.
*   **Synthesize All Information:** Draw from the user's "Invention Description" and the entire "Analysis Report." Specifically mine the "Strategic Opportunity Analysis," "Leveraging Expired Patents," and "Detailed Prior Art Analysis" sections for features, alternatives, and technical context.
*   **Describe Everything:** Detail the structure, components, materials, and interconnections of the invention. For processes, describe each step in detail. Explain all possible variations, alternative embodiments, and different use cases.
*   **Invent Plausible Details:** Where necessary for enablement, invent and include plausible technical details (e.g., specific dimensions, materials, operating parameters, software algorithms) that are consistent with the core inventive concept.
*   **Explain the "Why":** For key features, explain their purpose and advantage.

## LIST OF EMBODIMENTS/ASPECTS
*   **DO NOT WRITE FORMAL CLAIMS.**
*   Instead, provide a numbered list of statements describing key aspects and features of the invention. This provides clear textual support for future claim drafting.
*   Draft these as descriptive sentences.
*   Example: "1. A system comprising a processor and a memory, the memory storing instructions to perform a method of data analysis."
*   Example: "2. The system of embodiment 1, wherein the data analysis includes a step of pre-filtering."
*   Be broad and capture many combinations and sub-combinations.
`;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_MODEL_TEXT,
      contents: userPrompt,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.2, // Allow for some creative expansion of technical details
        topK: 10,
        topP: 0.9,
      }
    });

    if (response.candidates?.[0]?.finishReason && response.candidates[0].finishReason !== 'STOP') {
      const reason = response.candidates[0].finishReason;
      const message = response.candidates[0].finishMessage || 'No additional details provided.';
      throw new Error(`Application generation halted. Reason: ${reason}. Details: ${message}.`);
    }

    const markdownContent = response.text;
    if (!markdownContent || markdownContent.trim() === "") {
        throw new Error("Received an empty provisional application from the API.");
    }
    
    return { type: 'provisional', markdownContent };

  } catch (error) {
    console.error("Error calling Gemini API for provisional application:", error);
    if (error instanceof Error) {
        throw new Error(`Failed to generate provisional application: ${error.message}`);
    }
    throw new Error("An unknown error occurred while generating the provisional application.");
  }
};


export const structureKnowledgeBaseFromFiles = async (files: KnowledgeBaseFile[]): Promise<StructuredKnowledgeBaseData[]> => {
    if (!ai) {
        throw new Error("Gemini API client is not initialized. Check API Key configuration.");
    }
    if (!files || files.length === 0) {
        throw new Error("At least one file is required for data extraction.");
    }

    const fileContents = files.map(f => `--- START OF FILE: ${f.name} ---\n${f.content}\n--- END OF FILE: ${f.name} ---`).join('\n\n');

    const prompt = `You are an expert patent paralegal. You will be given the raw text content of multiple files from a user's patent portfolio. Your task is to analyze ALL the provided text, identify each distinct patent application, and extract key information for each one.

**Instructions:**
1.  Read through all the file contents.
2.  Group files that belong to the same patent application. A single application might be described across multiple files.
3.  For each distinct application you identify, extract its metadata.
4.  Return a single, flat JSON array of objects, where each object represents one patent application.

**Extraction Fields:**
*   **title**: The title of the invention. Find the most complete title.
*   **applicationNumber**: The application number (e.g., "63/123,456" or "18/123,456").
*   **filingDate**: The filing date in YYYY-MM-DD format.
*   **type**: Determine if it's 'provisional' or 'non-provisional'. Provisional numbers often start with '6X/'. If you cannot determine, default to 'non-provisional'.
*   **extractedClaims**: An array of strings, where each string is the full text of a single claim. Find the "CLAIMS" or "WHAT IS CLAIMED IS" section and extract each numbered claim. If no claims section is found, return an empty array [].
*   **fileNames**: An array of strings, containing the original file names (e.g., ["application.docx", "filing_receipt.pdf"]) that you identified as belonging to this specific application.
*   **notes**: Add any other relevant notes you find, like confirmation numbers or attorney docket numbers.
*   **priorityTo**: If the document (e.g., an Application Data Sheet) explicitly states it claims priority to another application, provide the application number of that parent application. Otherwise, return null.

If a piece of information cannot be found for a field, return an empty string "", an empty array [], or null for priorityTo.

**Your response MUST be ONLY the JSON array object, with no other text, explanation, or markdown fences.**

**Example Output:**
\`\`\`json
[
  {
    "title": "Quantum Entanglement Communication System",
    "applicationNumber": "63/123,456",
    "filingDate": "2023-10-27",
    "type": "provisional",
    "extractedClaims": [],
    "fileNames": ["quantum_provisional_app.docx", "quantum_filing_receipt.pdf"],
    "notes": "Confirmation No: 1234",
    "priorityTo": null
  },
  {
    "title": "Method for Secure Data Transmission based on Quantum Entanglement",
    "applicationNumber": "18/987,654",
    "filingDate": "2024-01-15",
    "type": "non-provisional",
    "extractedClaims": ["1. A method for transmitting data, comprising...", "2. The method of claim 1, wherein..."],
    "fileNames": ["secure_data_final.docx", "secure_data_ads.pdf"],
    "notes": "Attorney Docket No: SEC-001",
    "priorityTo": "63/123,456"
  }
]
\`\`\`

Here are the file contents:
${fileContents}
`;

    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: GEMINI_MODEL_TEXT,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                temperature: 0.0,
            }
        });
        
        const parsedData = parseAndValidateJsonArray<StructuredKnowledgeBaseData>(response.text, validateStructuredKbItem);
        return parsedData;

    } catch (error) {
        console.error("Error calling Gemini API for KB structuring:", error);
        if (error instanceof Error) {
            // Provide a more specific error if JSON parsing/validation was the issue
            if (error.message.includes("AI response") || error instanceof SyntaxError) {
                 throw new Error(`Failed to structure knowledge base: The AI returned data in an unexpected format. ${error.message}`);
            }
            throw new Error(`Failed to structure knowledge base from files: ${error.message}`);
        }
        throw new Error("An unknown error occurred during knowledge base structuring.");
    }
};