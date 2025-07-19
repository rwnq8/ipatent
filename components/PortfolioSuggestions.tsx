import React from 'react';
import { SuggestedPortfolioEntry } from '../types';
import { CheckCircleIcon, XCircleIcon } from './icons';

interface PortfolioSuggestionsProps {
    suggestions: SuggestedPortfolioEntry[];
    onAccept: (index: number) => void;
    onDismiss: (index: number) => void;
    onDismissAll: () => void;
    disabled: boolean;
}

export function PortfolioSuggestions({ suggestions, onAccept, onDismiss, onDismissAll, disabled }: PortfolioSuggestionsProps) {
    if (!suggestions || suggestions.length === 0) {
        return null;
    }

    return (
        <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-lg shadow-lg mt-8">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-slate-700">Portfolio Suggestions</h2>
                <button 
                    onClick={onDismissAll}
                    className="text-sm font-medium text-slate-600 hover:text-slate-800 disabled:opacity-50"
                    disabled={disabled}
                >
                    Dismiss All
                </button>
            </div>
            <p className="text-sm text-slate-600 mb-4">
                We found the following potential patent documents in your uploads. Would you like to add them to your persistent portfolio?
            </p>
            <div className="space-y-4">
                {suggestions.map((suggestion, index) => {
                    const sourceNames = suggestion.sourceFiles.map(f => f.name).join(', ');
                    return (
                        <div key={`${suggestion.applicationNumber}-${index}`} className="bg-white p-4 rounded-md shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex-grow">
                                <p className="font-semibold text-slate-800">{suggestion.title}</p>
                                <div className="text-sm text-slate-500 mt-1 space-x-4">
                                    <span>App #: <strong className="text-slate-700">{suggestion.applicationNumber}</strong></span>
                                    <span>Date: <strong className="text-slate-700">{suggestion.filingDate || 'N/A'}</strong></span>
                                    <span>From: <em className="text-slate-700">{sourceNames}</em></span>
                                </div>
                            </div>
                            <div className="flex-shrink-0 flex items-center gap-2">
                                <button
                                    onClick={() => onDismiss(index)}
                                    disabled={disabled}
                                    className="p-2 text-red-600 hover:text-red-800 disabled:text-slate-400 rounded-full hover:bg-red-100 transition-colors"
                                    aria-label="Dismiss suggestion"
                                    title="Dismiss"
                                >
                                    <XCircleIcon className="w-6 h-6" />
                                </button>
                                <button
                                    onClick={() => onAccept(index)}
                                    disabled={disabled}
                                    className="p-2 text-green-600 hover:text-green-800 disabled:text-slate-400 rounded-full hover:bg-green-100 transition-colors"
                                    aria-label="Add to portfolio"
                                    title="Add to Portfolio"
                                >
                                    <CheckCircleIcon className="w-6 h-6" />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}