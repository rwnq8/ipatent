

import { ProcessedFile, FileProcessingResult } from '../types';
import mammoth from 'mammoth'; 

export const parseFileContent = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const mimeType = file.type;

    const fileName = file.name.toLowerCase();
    const lastDotIndex = fileName.lastIndexOf('.');
    // Ensure there is an extension and it's not a dotfile at the start
    const extensionWithDot = lastDotIndex > 0 ? fileName.substring(lastDotIndex) : '';

    reader.onload = async (event) => {
      try {
        if (!event.target?.result) {
          return reject(new Error('File reading failed.'));
        }

        if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || extensionWithDot === '.docx') {
          const arrayBuffer = event.target.result as ArrayBuffer;
          const result = await mammoth.extractRawText({ arrayBuffer });
          resolve(result.value);
        } else if (mimeType === 'application/pdf' || extensionWithDot === '.pdf') {
            try {
                // Dynamically import pdfjs-dist only when a PDF is processed
                const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist/build/pdf.mjs');
                
                // Set worker source right after successful import
                GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.mjs`;

                const arrayBuffer = event.target.result as ArrayBuffer;
                const pdf = await getDocument({ data: arrayBuffer }).promise;
                let textContent = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textData = await page.getTextContent();
                    if (!textData || !textData.items || textData.items.length === 0) {
                        continue;
                    }
                    
                    // The previous geometric analysis of text coordinates was brittle for some PDF layouts.
                    // This new approach uses a simpler text join followed by regex-based formatting correction, 
                    // which is more robust for structured documents like patents and legal filings.
                    
                    // 1. Join all text items with a space and normalize all whitespace to single spaces.
                    let pageText = textData.items.map(item => (item as any).str).join(' ').replace(/\s+/g, ' ').trim();
                    
                    // 2. Add paragraph breaks before new numbered claims. This is the primary fix for the run-on sentence issue.
                    // It looks for sentence-ending punctuation (e.g., '.'), followed by a space, then a new number and a dot (e.g., '2.').
                    // Example: "...assurances. 2. The method..." -> "...assurances.\n\n2. The method..."
                    // The positive lookahead (?=...) ensures the number itself isn't consumed, allowing for consecutive matches.
                    pageText = pageText.replace(/([.!?])\s+(?=\d+\.\s)/g, '$1\n\n');

                    // 3. Add indented line breaks for sub-claims/parts, which often follow a semicolon.
                    // Example: "...sequences; b. applying..." -> "...sequences;\n  b. applying..."
                    pageText = pageText.replace(/;\s+(?=([a-z]\.\s|\([a-z]\)\s|\([ivx]+\)\s))/gi, ';\n  ');

                    textContent += pageText + '\n\n';
                }
                // Finally, clean up any excessive newlines that might have been generated.
                resolve(textContent.trim().replace(/\n{3,}/g, '\n\n'));

            } catch(e) {
                // This catch block handles failures in dynamically importing or using the PDF library
                console.error("Failed to load or process PDF library:", e);
                reject(new Error("Failed to load the required PDF parsing library. Please check your network connection and try again. This document could not be processed."));
            }
        } else if (mimeType === 'text/plain' || mimeType === 'text/markdown' || extensionWithDot === '.txt' || extensionWithDot === '.md') { // .txt, .md
           resolve(event.target.result as string);
        } else {
          reject(new Error(`Unsupported file type: ${mimeType || 'unknown'} (extension: ${extensionWithDot || 'none'})`));
        }
      } catch (error) {
        console.error('Error parsing file:', file.name, error);
        // Add user-friendly message for common docx corruption error
        let friendlyMessage = (error as Error).message;
        if (friendlyMessage.includes('central directory')) {
            friendlyMessage = 'Error parsing DOCX file. This commonly happens if the file is corrupted, or if it is an older ".doc" file that has been renamed to ".docx". Please ensure the file is a modern .docx format and try re-saving it before uploading again.';
        }
        reject(new Error(`Error parsing file ${file.name}: ${friendlyMessage}`));
      }
    };

    reader.onerror = (error) => {
      console.error('FileReader error:', error);
      reject(new Error('Error reading file.'));
    };
    
    // Read based on type or extension
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || extensionWithDot === '.docx' || mimeType === 'application/pdf' || extensionWithDot === '.pdf') {
        reader.readAsArrayBuffer(file);
    } else if (mimeType === 'text/plain' || mimeType === 'text/markdown' || extensionWithDot === '.txt' || extensionWithDot === '.md') {
        reader.readAsText(file);
    } else {
        reject(new Error(`Cannot read unsupported file type: ${mimeType || 'unknown'} (extension: ${extensionWithDot || 'none'})`));
    }
  });
};

export const processUploadedFiles = async (files: File[]): Promise<FileProcessingResult> => {
  const successfulFiles: ProcessedFile[] = [];
  const errors: { fileName: string; message: string }[] = [];

  // Use Promise.all to process files in parallel and wait for all to complete
  await Promise.all(
    files.map(async (file) => {
      try {
        const content = await parseFileContent(file);
        successfulFiles.push({
          id: `${file.name}-${file.lastModified}-${file.size}`,
          name: file.name,
          type: file.type,
          size: file.size,
          content: content,
        });
      } catch (error) {
        console.error(`Failed to process file ${file.name}:`, error);
        errors.push({
          fileName: file.name,
          message: (error as Error).message || 'An unknown error occurred during parsing.',
        });
      }
    })
  );

  return { successfulFiles, errors };
};