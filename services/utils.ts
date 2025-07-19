

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
