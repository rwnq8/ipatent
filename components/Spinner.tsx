
import React from 'react';

interface SpinnerProps {
  message?: string;
  onCancel?: () => void;
}

export function Spinner({ message = "Processing...", onCancel }: SpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center my-8">
      <svg className="animate-spin -ml-1 mr-3 h-10 w-10 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      {message && <p className="mt-4 text-slate-600 text-center">{message}</p>}
      {onCancel && (
        <button
          onClick={onCancel}
          className="mt-4 px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
