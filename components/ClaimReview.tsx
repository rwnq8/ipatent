import React from 'react';
import { ExtractedInvention } from '../types';

interface ClaimReviewProps {
    inventions: ExtractedInvention[];
    onToggleClaim: (inventionIndex: number, claimIndex: number) => void;
    onSelectAll: (inventionIndex: number, selected: boolean) => void;
    onAnalyze: () => void;
    disabled: boolean;
}

export function ClaimReview({ inventions, onToggleClaim, onSelectAll, onAnalyze, disabled }: ClaimReviewProps) {
    if (!inventions || inventions.length === 0) {
        return null;
    }
    
    const totalClaims = inventions.reduce((acc, inv) => acc + inv.claims.length, 0);
    const selectedClaims = inventions.reduce((acc, inv) => acc + inv.claims.filter(c => c.selected).length, 0);

    return (
        <div className="bg-white p-6 rounded-lg shadow-lg mt-8">
            <h2 className="text-xl font-semibold text-slate-700 mb-2">Step 2: Review and Select Claims</h2>
            <p className="text-sm text-slate-600 mb-6">
                The AI has extracted the following potential claims from your documents. Review and select the ones you want to include in the patentability analysis.
            </p>

            <div className="space-y-6">
                {inventions.map((invention, invIndex) => {
                    const allSelected = invention.claims.length > 0 && invention.claims.every(c => c.selected);
                    return (
                        <div key={invIndex} className="border border-slate-200 rounded-lg p-4">
                            <h3 className="text-lg font-bold text-slate-800">{invention.title}</h3>
                            <p className="text-sm text-slate-600 mt-1 mb-4">{invention.description}</p>
                            
                             <div className="flex items-center gap-4 mb-4 pb-2 border-b border-slate-200">
                                <div className="relative flex items-start">
                                    <div className="flex items-center h-5">
                                        <input
                                            id={`select-all-${invIndex}`}
                                            type="checkbox"
                                            className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                                            checked={allSelected}
                                            onChange={() => onSelectAll(invIndex, !allSelected)}
                                            disabled={disabled}
                                        />
                                    </div>
                                    <div className="ml-3 text-sm">
                                        <label htmlFor={`select-all-${invIndex}`} className="font-medium text-slate-700 cursor-pointer">
                                            {allSelected ? 'Deselect All' : 'Select All'}
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                                {invention.claims.map((claim, claimIndex) => (
                                    <div key={claimIndex} className="relative flex items-start gap-3 p-3 rounded-md bg-slate-50/50 hover:bg-slate-50 border border-slate-200 transition-colors">
                                        <div className="flex items-center h-5 mt-1">
                                            <input
                                                id={`claim-${invIndex}-${claimIndex}`}
                                                type="checkbox"
                                                className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                                                checked={claim.selected}
                                                onChange={() => onToggleClaim(invIndex, claimIndex)}
                                                disabled={disabled}
                                                aria-labelledby={`claim-text-${invIndex}-${claimIndex}`}
                                            />
                                        </div>
                                        <div className="text-sm flex-1">
                                            <label htmlFor={`claim-${invIndex}-${claimIndex}`} id={`claim-text-${invIndex}-${claimIndex}`} className="text-slate-700 cursor-pointer block">
                                                {claim.text}
                                            </label>
                                            <span className={`mt-1 inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${claim.type === 'explicit' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                                                {claim.type}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                                {invention.claims.length === 0 && (
                                    <p className="text-center text-slate-500 py-4">No potential claims were extracted for this invention group.</p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="mt-8 pt-6 border-t border-slate-300 flex flex-col sm:flex-row justify-end items-center gap-4">
                 <span className="text-sm text-slate-600">
                    {selectedClaims} of {totalClaims} claims selected.
                </span>
                <button
                    onClick={onAnalyze}
                    disabled={disabled || selectedClaims === 0}
                    className="px-8 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
                >
                    Analyze Selected Claims &amp; Generate Report
                </button>
            </div>
        </div>
    );
}
