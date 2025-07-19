import { GoogleGenAI } from "@google/genai";
import { GEMINI_MODEL_TEXT } from '../constants';

const API_KEY = process.env.API_KEY;

// Initialize a local AI client instance specifically for token counting.
// This avoids issues if the main geminiService's `ai` instance is not exported.
const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;

/**
 * Accurately counts the number of tokens in a given text using the Gemini API.
 * Falls back to a character-based approximation if the API key is not configured.
 * @param textToCount The string for which to count tokens.
 * @returns A promise that resolves to the number of tokens.
 */
export const countTokens = async (textToCount: string): Promise<number> => {
  if (!textToCount) return 0;

  // Use the API for an accurate count if available
  if (ai) {
    try {
      const { totalTokens } = await ai.models.countTokens({
        model: GEMINI_MODEL_TEXT,
        contents: textToCount,
      });
      return totalTokens;
    } catch (error) {
      console.error("Gemini API token counting failed, falling back to approximation.", error);
      // Fall through to approximation on API error
    }
  }

  // Fallback approximation: 1 token is roughly 4 characters for English text.
  // This is used if API key is missing or if the API call fails.
  const estimatedTokens = Math.ceil(textToCount.length / 4);
  return estimatedTokens;
};