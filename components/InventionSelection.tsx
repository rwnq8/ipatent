import React from 'react';
import { ExtractedInvention } from '../types';

interface InventionSelectionProps {
    inventions: ExtractedInvention[];
    selectedInvention: ExtractedInvention | null;
    onSelectInvention: (invention: ExtractedInvention | null) => void;
    disabled: boolean;
}

export function InventionSelection({ 
    inventions, 
    selectedInvention,
    onSelectInvention, 
    disabled 
}: InventionSelectionProps) {
    if (!inventions || inventions.length === 0) {
        return (
             <div className="bg-white p-6 rounded-lg shadow-lg mt-8">
                <h2 className="text-xl font-semibold text-slate-700 mb-2">Step 1: Identify Invention</h2>
                 <p className="text-center text-slate-500 py-4">
                    The AI could not identify any distinct inventions from the provided documents. Please upload more descriptive files.
                </p>
            </div>
        );
    }

    const handleSelect = (invention: ExtractedInvention) => {
        // Allow deselecting by clicking the same invention again, which cancels the automated flow.
        if (selectedInvention === invention) {
            onSelectInvention(null); 
        } else {
            onSelectInvention(invention);
        }
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-lg mt-8">
            <h2 className="text-xl font-semibold text-slate-700 mb-2">Step 1: Select Invention for Analysis</h2>
            <p className="text-sm text-slate-600 mb-6">
                The AI has identified the following potential inventions from your documents. Please select **one** to proceed with for a deep-dive prior art search and analysis.
            </p>

            <div className="space-y-4">
                {inventions.map((invention, invIndex) => {
                    const isSelected = selectedInvention === invention;
                    return (
                        <div key={invIndex} className={`border rounded-lg p-4 transition-all duration-200 ${isSelected ? 'border-blue-500 ring-2 ring-blue-200 shadow-md' : 'border-slate-200 hover:shadow-md'}`}>
                            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                                <div className="flex-grow">
                                    <h3 className="text-lg font-bold text-slate-800">{invention.title}</h3>
                                    <p className="text-sm text-slate-600 mt-1">{invention.description}</p>
                                </div>
                                <div className="flex-shrink-0">
                                    <button
                                        onClick={() => handleSelect(invention)}
                                        disabled={disabled}
                                        className={`w-full md:w-auto px-6 py-2 border text-sm font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${
                                            isSelected && disabled // Show "Selected" only when it's selected AND processing has started
                                            ? 'bg-green-600 text-white border-transparent cursor-default' 
                                            : 'bg-blue-600 text-white border-transparent hover:bg-blue-700 focus:ring-blue-500'
                                        } disabled:bg-slate-400 disabled:cursor-not-allowed`}
                                    >
                                        {isSelected && disabled ? 'Analyzing...' : 'Analyze This Invention'}
                                    </button>
                                </div>
                            </div>
                             <details className="mt-4">
                                <summary className="text-sm font-medium text-slate-600 hover:text-blue-600 cursor-pointer">
                                    View Extracted Claims/Embodiments ({invention.claims.length})
                                </summary>
                                <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-md max-h-60 overflow-y-auto">
                                    <ul className="list-disc list-inside space-y-2 text-sm text-slate-700">
                                        {invention.claims.map((claim, claimIndex) => (
                                            <li key={claimIndex}>
                                                <span className={`mr-2 inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${claim.type === 'explicit' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>{claim.type}</span>
                                                {claim.text}
                                            </li>
                                        ))}
                                    </ul>
                                    {invention.claims.length === 0 && <p className="text-slate-500 italic">No specific claims or embodiments were extracted.</p>}
                                </div>
                            </details>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}