
/**
 * Sanitizes a string to make it safe for use as a filename.
 * This function removes path components, file extensions, and invalid characters,
 * collapses whitespace, and truncates the name to a reasonable length.
 * @param name The original string to sanitize.
 * @returns A sanitized string suitable for a filename in kebab-case.
 */
export const sanitizeForFilename = (name: string): string => {
  if (!name) return 'untitled';

  let cleanedName = name;
  
  // If it looks like a path, take the last part.
  const lastSlash = Math.max(cleanedName.lastIndexOf('/'), cleanedName.lastIndexOf('\\'));
  if (lastSlash > -1) {
    cleanedName = cleanedName.substring(lastSlash + 1);
  }

  // Remove file extension. Only considers the last dot.
  const lastDot = cleanedName.lastIndexOf('.');
  if (lastDot > 0) { // Ensure it's not a leading dot for hidden files
    cleanedName = cleanedName.substring(0, lastDot);
  }

  // Sanitize: convert to lower, replace invalid chars with '-', then clean up.
  cleanedName = cleanedName
    .toLowerCase()
    // Replace any character that is not a letter, number, or hyphen with a hyphen.
    .replace(/[^a-z0-9-]+/g, '-') 
    // Collapse consecutive hyphens.
    .replace(/-+/g, '-') 
    // Trim leading/trailing hyphens.
    .replace(/^-+|-+$/g, '');

  // Truncate if too long to avoid excessively long filenames.
  if (cleanedName.length > 64) {
      cleanedName = cleanedName.substring(0, 64);
      // Trim again in case we cut on a separator.
      cleanedName = cleanedName.replace(/^-+|-+$/g, '');
  }
  
  // If after all this we have an empty string (e.g., input was just "."), provide a fallback.
  if (!cleanedName) {
    return 'untitled';
  }
  
  return cleanedName;
};


/**
 * Aggressively sanitizes a message to ensure it is a string before rendering.
 * This acts as a firewall to prevent React rendering errors (e.g., Error #31).
 * @param message The message to sanitize, which could be a string, an error object, or unknown.
 * @returns A guaranteed string, or null if the message is empty.
 */
export const sanitizeMessage = (message: unknown): string | null => {
  if (!message) return null;
  if (typeof message === 'string') return message;

  // Check if it's an object with a stringable .message property
  if (typeof message === 'object' && message !== null && 'message' in message && typeof (message as any).message === 'string') {
    return (message as any).message;
  }
  
  // If it's any other object or type, log it for debugging but show a generic error.
  console.error("An unsanitized, non-string message was passed to an Alert:", message);
  return 'An unexpected internal error occurred. The message could not be displayed.';
};

/**
 * Normalizes a patent application number by stripping non-digit characters.
 * This allows for consistent comparison of numbers like 'US 63/123,456' and '63123456'.
 * @param appNumber The application number string.
 * @returns A string containing only the digits from the input, or an empty string if input is falsy.
 */
export const normalizeApplicationNumber = (appNumber: string | undefined | null): string => {
  if (!appNumber) return '';
  return appNumber.replace(/[^0-9]/g, '');
};

/**
 * Sanitizes text to be sent to an API by removing non-printable control characters.
 * This can help prevent internal errors in APIs that are sensitive to such characters.
 * It preserves common whitespace like newlines, tabs, and carriage returns.
 * @param text The input string to sanitize.
 * @returns A new string with control characters removed.
 */
export const sanitizeForApi = (text: string): string => {
    if (!text) return '';
    // This regex removes most C0 and C1 control characters, but keeps HT, LF, CR.
    // \x00-\x08, \x0B, \x0C, \x0E-\x1F, \x7F-\x9F
    // eslint-disable-next-line no-control-regex
    return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, '');
};
