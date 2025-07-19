import React, { useCallback, useState } from 'react';
import { UploadIcon, FileTextIcon, TrashIcon } from './icons';
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB, ACCEPTED_FILE_TYPES } from '../constants';

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  processing: boolean;
}

export function FileUpload({ onFilesSelected, processing }: FileUploadProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acceptedTypesString = Object.values(ACCEPTED_FILE_TYPES).flat().join(',');

  const addFiles = useCallback((filesToAdd: File[]) => {
      setError(null);
      if (filesToAdd.length === 0) return;
      
      setSelectedFiles(currentFiles => {
          const newFiles = [...currentFiles];
          const addedFileKeys = new Set(currentFiles.map(f => `${f.name}-${f.size}`));
          let addedCount = 0;

          for (const file of filesToAdd) {
              const fileKey = `${file.name}-${file.size}`;
              if (!addedFileKeys.has(fileKey)) {
                  newFiles.push(file);
                  addedFileKeys.add(fileKey);
                  addedCount++;
              }
          }

          // Only propagate up if there's a change
          if (addedCount > 0) {
              onFilesSelected(newFiles);
          }
          return newFiles;
      });
  }, [onFilesSelected]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    addFiles(files);
    // Clear the input value to allow selecting the same file again
    event.target.value = ''; 
  };
  
  const handleRemoveFile = (fileName: string) => {
    const updatedFiles = selectedFiles.filter(file => file.name !== fileName);
    setSelectedFiles(updatedFiles);
    onFilesSelected(updatedFiles);
  };

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
    const files = event.dataTransfer.files ? Array.from(event.dataTransfer.files) : [];
    addFiles(files);
  }, [addFiles]);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
  }, []);

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg">
      <h2 className="text-xl font-semibold text-slate-700 mb-4">Upload Invention Documents</h2>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-slate-300'} border-dashed rounded-md transition-colors duration-150`}
      >
        <div className="space-y-1 text-center">
          <UploadIcon className="mx-auto h-12 w-12 text-slate-400" />
          <div className="flex text-sm text-slate-600">
            <label
              htmlFor="file-upload"
              className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"
            >
              <span>Upload files</span>
              <input id="file-upload" name="file-upload" type="file" multiple className="sr-only" onChange={handleFileChange} accept={acceptedTypesString} disabled={processing} />
            </label>
            <p className="pl-1">or drag and drop</p>
          </div>
          <p className="text-xs text-slate-500">TXT, MD, PDF, DOCX up to {MAX_FILE_SIZE_MB}MB each</p>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {selectedFiles.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-slate-700">Selected files:</h3>
          <ul role="list" className="mt-2 border border-slate-200 rounded-md divide-y divide-slate-200">
            {selectedFiles.map(file => (
              <li key={`${file.name}-${file.size}`} className="pl-3 pr-4 py-3 flex items-center justify-between text-sm">
                <div className="w-0 flex-1 flex items-center">
                  <FileTextIcon className="flex-shrink-0 h-5 w-5 text-slate-400" aria-hidden="true" />
                  <span className="ml-2 flex-1 w-0 truncate text-slate-700">{file.name}</span>
                </div>
                <div className="ml-4 flex-shrink-0">
                  <span className="text-slate-500 mr-2">({(file.size / 1024).toFixed(2)} KB)</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(file.name)}
                    className="font-medium text-red-600 hover:text-red-500 disabled:opacity-50"
                    disabled={processing}
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
