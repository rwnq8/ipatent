
import React from 'react';
import { UploadIcon } from './icons';

interface LoadAnalysisProps {
  onImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
  disabled: boolean;
}

export function LoadAnalysis({ onImport, disabled }: LoadAnalysisProps) {
  return (
    <div className="my-6 text-center">
       <span className="text-sm text-slate-500">or</span>
      <div className="mt-2">
        <label
            htmlFor="analysis-import-input"
            className={`inline-flex items-center px-4 py-2 border border-dashed border-slate-400 text-sm font-medium rounded-md text-slate-600 bg-white ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50 hover:border-slate-500 cursor-pointer'}`}
            >
            <UploadIcon className="mr-2 h-5 w-5" />
            Load a Saved Analysis Session
        </label>
        <input
            id="analysis-import-input"
            type="file"
            onChange={onImport}
            accept=".inventions.json,.json"
            className="hidden"
            disabled={disabled}
        />
      </div>
    </div>
  );
}
