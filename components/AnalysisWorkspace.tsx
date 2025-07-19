
import React from 'react';
import { AnalyzedInvention, GradedClaim } from '../types';
import { ExternalLinkIcon, FileTextIcon } from './icons';

interface AnalysisWorkspaceProps {
    analyzedInvention: AnalyzedInvention;
    onToggleClaim: (claimIndex: number) => void;
    onGenerateApplication: (type: 'provisional' | 'non-provisional') => void;
    disabled: boolean;
}

const getGradeColorClasses = (grade: string): { bg: string; text: string; border: string; } => {
    const lowerGrade = grade.toLowerCase();
    if (lowerGrade.includes('green')) return { bg: 'bg-green-50', text: 'text-green-800', border: 'border-green-400' };
    if (lowerGrade.includes('yellow')) return { bg: 'bg-yellow-50', text: 'text-yellow-800', border: 'border-yellow-400' };
    if (lowerGrade.includes('red')) return { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-400' };
    if (lowerGrade.includes('black')) return { bg: 'bg-slate-200', text: 'text-slate-900', border: 'border-slate-500' };
    return { bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-300' };
};

export function AnalysisWorkspace({ analyzedInvention, onToggleClaim, onGenerateApplication, disabled }: AnalysisWorkspaceProps) {
    const { originalInvention, gradedClaims, priorArt, analysisSummary } = analyzedInvention;

    const selectedClaimsCount = gradedClaims.filter(c => c.selected).length;

    return (
        <div className="bg-white p-6 rounded-lg shadow-lg mt-8">
            {/* Section 1: Analysis Summary */}
            <div className="mb-8 pb-6 border-b border-slate-300">
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Step 2: Analysis of '{originalInvention.title}'</h2>
                <p className="text-sm text-slate-600 mb-4">
                    The AI has performed a deep-dive analysis, including a prior art search, and provided a patentability grade for each extracted claim and embodiment. Weak claims have been automatically revised.
                </p>
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h3 className="font-semibold text-blue-800 mb-2">Analysis Summary</h3>
                    <p className="text-sm text-blue-900">{analysisSummary}</p>
                </div>
            </div>

            {/* Section 2: Prior Art */}
            <div className="mb-8 pb-6 border-b border-slate-300">
                <h3 className="text-xl font-semibold text-slate-700 mb-4">Prior Art Discovered</h3>
                <div className="space-y-3">
                    {priorArt.length > 0 ? priorArt.map((art, index) => (
                        <details key={index} className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                            <summary className="font-medium text-slate-700 cursor-pointer text-sm">
                                {art.title} ({art.applicationNumber})
                            </summary>
                            <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-600 space-y-1">
                                <p><strong>Date:</strong> {art.filingDate}</p>
                                <p><strong>Type:</strong> {art.type}</p>
                                <p><strong>Relevance:</strong> {art.notes}</p>
                            </div>
                        </details>
                    )) : (
                        <p className="text-sm text-slate-500 italic">No specific prior art documents were cited by the AI for this analysis.</p>
                    )}
                </div>
            </div>

            {/* Section 3: Graded Claims Review */}
            <div className="mb-8">
                <h3 className="text-xl font-semibold text-slate-700 mb-2">Step 3: Review and Select Graded Claims</h3>
                <p className="text-sm text-slate-600 mb-4">
                    Review the AI-graded claims. Claims are sorted by strength. Select the claims you wish to include in the final application.
                </p>
                <div className="space-y-4">
                    {gradedClaims.map((claim: GradedClaim, index: number) => {
                        const colors = getGradeColorClasses(claim.grade);
                        return (
                             <div key={index} className={`relative flex items-start gap-3 p-4 rounded-md border ${colors.border} bg-white transition-colors`}>
                                <div className="flex items-center h-5 mt-1">
                                    <input
                                        id={`claim-${index}`}
                                        type="checkbox"
                                        className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-400 rounded"
                                        checked={claim.selected}
                                        onChange={() => onToggleClaim(index)}
                                        disabled={disabled}
                                        aria-labelledby={`claim-text-${index}`}
                                    />
                                </div>
                                <div className="text-sm flex-1">
                                    <div className="flex justify-between items-start mb-2">
                                        <label htmlFor={`claim-${index}`} id={`claim-text-${index}`} className="text-slate-800 cursor-pointer block pr-4">
                                            {claim.text}
                                            {claim.originalText && (
                                                <details className="mt-2 text-xs">
                                                    <summary className="cursor-pointer text-slate-500 hover:text-slate-700">Show original text</summary>
                                                    <p className="p-2 bg-slate-100 rounded border border-slate-200 mt-1">{claim.originalText}</p>
                                                </details>
                                            )}
                                        </label>
                                        <span className={`flex-shrink-0 ml-4 mt-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${claim.type === 'explicit' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                                            {claim.type}
                                        </span>
                                    </div>
                                    <div className={`mt-2 p-3 text-xs rounded-md ${colors.bg}`}>
                                        <p className="mb-1">
                                            <strong className={`${colors.text} font-bold`}>Grade: </strong> 
                                            <span className={`${colors.text}`}>{claim.grade}</span>
                                        </p>
                                        <p>
                                            <strong className={`${colors.text} font-bold`}>Justification: </strong> 
                                            <span className={`${colors.text}`}>{claim.justification}</span>
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Section 4: Generate Application */}
            <div className="mt-8 pt-6 border-t border-slate-300">
                 <h3 className="text-xl font-semibold text-slate-700 mb-2">Step 4: Generate Application Draft</h3>
                 <p className="text-sm text-slate-600 mb-6">
                    Using all the information gathered, including your selected graded claims, generate a draft patent application. It is recommended to deselect high-risk (Red/Black) claims for non-provisional applications unless they have been revised.
                </p>
                <div className="flex flex-col sm:flex-row justify-end items-center gap-4">
                    <span className="text-sm text-slate-600">
                        {selectedClaimsCount} of {gradedClaims.length} claims selected.
                    </span>
                    <button
                        onClick={() => onGenerateApplication('provisional')}
                        disabled={disabled}
                        className="w-full sm:w-auto inline-flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:bg-slate-400"
                    >
                        Generate Provisional Application
                    </button>
                    <button
                        onClick={() => onGenerateApplication('non-provisional')}
                        disabled={disabled || selectedClaimsCount === 0}
                        className="w-full sm:w-auto inline-flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-slate-400 disabled:cursor-not-allowed"
                    >
                        Generate Non-Provisional Application
                    </button>
                </div>
            </div>

        </div>
    );
}
