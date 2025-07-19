import React, { useState, useEffect } from 'react';
import { KnowledgeBaseEntry } from '../types';
import { normalizeApplicationNumber } from '../services/utils';

interface KnowledgeBaseEntryFormProps {
    initialData: KnowledgeBaseEntry | Omit<KnowledgeBaseEntry, 'id'>;
    mode: 'add' | 'edit';
    ownedEntries: KnowledgeBaseEntry[];
    onSave: (entryData: KnowledgeBaseEntry | Omit<KnowledgeBaseEntry, 'id'>) => void;
    onCancel: () => void;
}

export function KnowledgeBaseEntryForm({ initialData, mode, ownedEntries, onSave, onCancel }: KnowledgeBaseEntryFormProps) {
    const [formData, setFormData] = useState(initialData);
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        // When initialData changes (e.g., switching from add to edit), reset the form
        setFormData(initialData);
    }, [initialData]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        
        if (type === 'checkbox') {
             const { checked } = e.target as HTMLInputElement;
             setFormData(prev => ({ ...prev, [name]: checked }));
        } else {
             setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const validate = (): boolean => {
        const newErrors: Record<string, string> = {};
        if (!formData.title.trim()) newErrors.title = "Title is required.";
        
        const normalizedCurrent = normalizeApplicationNumber(formData.applicationNumber);
        if (!normalizedCurrent) {
            newErrors.applicationNumber = "Application number is required.";
        } else {
            // Check for duplicate application number
            const selfId = (formData as KnowledgeBaseEntry).id;
            if (ownedEntries.some(e => normalizeApplicationNumber(e.applicationNumber) === normalizedCurrent && e.id !== selfId)) {
                newErrors.applicationNumber = "This application number already exists in your portfolio.";
            }
        }
        if (!formData.filingDate) newErrors.filingDate = "Filing date is required.";

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (validate()) {
            const finalData = {
                ...formData,
                extractedClaims: typeof formData.extractedClaims === 'string'
                    ? (formData.extractedClaims as string).split('\n').map(s => s.trim()).filter(Boolean)
                    : formData.extractedClaims || [],
                extractedEmbodiments: typeof formData.extractedEmbodiments === 'string'
                    ? (formData.extractedEmbodiments as string).split('\n').map(s => s.trim()).filter(Boolean)
                    : formData.extractedEmbodiments || [],
            };
            onSave(finalData);
        }
    };
    
    const claimsAsString = Array.isArray(formData.extractedClaims) ? formData.extractedClaims.join('\n') : '';
    const embodimentsAsString = Array.isArray(formData.extractedEmbodiments) ? formData.extractedEmbodiments.join('\n') : '';

    const formTitle = mode === 'add' ? 'Add New Portfolio Entry' : 'Edit Portfolio Entry';
    const selfId = (formData as KnowledgeBaseEntry).id;
    // Exclude the current entry from the list of potential parents
    const priorityOptions = ownedEntries.filter(e => e.id !== selfId);

    return (
        <div className="p-4 my-4 border border-slate-300 bg-slate-50 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">{formTitle}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="title" className="block text-sm font-medium text-slate-700">Title</label>
                        <input type="text" name="title" id="title" value={formData.title} onChange={handleChange} className={`mt-1 block w-full px-3 py-2 bg-white border ${errors.title ? 'border-red-500' : 'border-slate-300'} rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`} />
                        {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title}</p>}
                    </div>
                    <div>
                        <label htmlFor="applicationNumber" className="block text-sm font-medium text-slate-700">Application Number</label>
                        <input type="text" name="applicationNumber" id="applicationNumber" value={formData.applicationNumber} onChange={handleChange} className={`mt-1 block w-full px-3 py-2 bg-white border ${errors.applicationNumber ? 'border-red-500' : 'border-slate-300'} rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`} />
                        {errors.applicationNumber && <p className="mt-1 text-sm text-red-600">{errors.applicationNumber}</p>}
                    </div>
                    <div>
                        <label htmlFor="filingDate" className="block text-sm font-medium text-slate-700">Filing Date</label>
                        <input type="date" name="filingDate" id="filingDate" value={formData.filingDate} onChange={handleChange} className={`mt-1 block w-full px-3 py-2 bg-white border ${errors.filingDate ? 'border-red-500' : 'border-slate-300'} rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`} />
                        {errors.filingDate && <p className="mt-1 text-sm text-red-600">{errors.filingDate}</p>}
                    </div>
                    <div>
                        <label htmlFor="type" className="block text-sm font-medium text-slate-700">Type</label>
                        <select name="type" id="type" value={formData.type} onChange={handleChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
                            <option value="non-provisional">Non-Provisional</option>
                            <option value="provisional">Provisional</option>
                        </select>
                    </div>
                    <div className="md:col-span-2">
                        <label htmlFor="priorityTo" className="block text-sm font-medium text-slate-700">Claims Priority To</label>
                        <select name="priorityTo" id="priorityTo" value={formData.priorityTo || ''} onChange={handleChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
                            <option value="">None</option>
                            {priorityOptions.map(entry => (
                                <option key={entry.id} value={entry.id}>{entry.title} ({entry.applicationNumber})</option>
                            ))}
                        </select>
                    </div>
                </div>
                 {formData.type === 'non-provisional' && (
                    <div>
                        <label htmlFor="extractedClaims" className="block text-sm font-medium text-slate-700">Extracted Claims</label>
                        <textarea name="extractedClaims" id="extractedClaims" value={claimsAsString} onChange={handleChange} rows={5} className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" placeholder="Enter one claim per line..."></textarea>
                    </div>
                 )}
                 {formData.type === 'provisional' && (
                    <div>
                        <label htmlFor="extractedEmbodiments" className="block text-sm font-medium text-slate-700">Extracted Embodiments</label>
                        <textarea name="extractedEmbodiments" id="extractedEmbodiments" value={embodimentsAsString} onChange={handleChange} rows={5} className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" placeholder="Enter one embodiment per line..."></textarea>
                    </div>
                 )}
                <div>
                    <label htmlFor="notes" className="block text-sm font-medium text-slate-700">Notes</label>
                    <textarea name="notes" id="notes" value={formData.notes} onChange={handleChange} rows={3} className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"></textarea>
                </div>
                <div className="relative flex items-start">
                    <div className="flex items-center h-5">
                        <input id="isComplete" name="isComplete" type="checkbox" checked={!!formData.isComplete} onChange={handleChange} className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded" />
                    </div>
                    <div className="ml-3 text-sm">
                        <label htmlFor="isComplete" className="font-medium text-slate-700">This entry contains the full specification text.</label>
                        <p className="text-slate-500">Check this if the source file for this entry was the complete document, not just a summary.</p>
                    </div>
                </div>
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onCancel} className="px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                        Cancel
                    </button>
                    <button type="submit" className="px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                        Save Entry
                    </button>
                </div>
            </form>
        </div>
    );
}