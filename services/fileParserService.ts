import { ProcessedFile, FileProcessingResult } from '../types';
// Note: mammoth and pdfjs-dist would typically be npm dependencies.
// For this environment, we assume they can be imported.
// If using script tags for these, ensure they are loaded before this script.
import mammoth from 'mammoth'; 
// Import specific ESM components to ensure correct module resolution
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/build/pdf.mjs';

// Set workerSrc for pdfjs-dist. This is crucial for it to work.
if (typeof GlobalWorkerOptions !== 'undefined') {
    GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.4.168/build/pdf.worker.mjs`;
}


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
          const arrayBuffer = event.target.result as ArrayBuffer;
          const pdf = await getDocument({ data: arrayBuffer }).promise;
          let textContent = '';
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textData = await page.getTextContent();
            // Ensure items exist and map safely
            textContent += textData.items?.map((item: { str: string }) => item.str).join(' ') + '\n';
          }
          resolve(textContent);
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