


import React from 'react';
import { FileUpload } from './components/FileUpload';
import { PatentApplicationDisplay } from './components/PatentApplicationDisplay';
import { ReportDisplay } from './components/ReportDisplay';
import { Spinner } from './components/Spinner';
import { ManagedAlerts } from './components/ManagedAlerts';
import { KnowledgeBase } from './components/KnowledgeBase';
import { PortfolioSuggestions } from './components/PortfolioSuggestions';
import { useAppManager } from './hooks/useAppManager';
import { InventionSelection } from './components/InventionSelection';

const IS_API_KEY_CONFIGURED = !!process.env.API_KEY;

export function App() {
  const manager = useAppManager();

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <header className="mb-10 text-center">
        <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight">
          Patent & Prior Art Analyzer
        </h1>
        <p className="mt-2 text-lg text-slate-600">
          Leverage AI to analyze disclosures, generate reports, and draft patent applications.
        </p>
      </header>

      <main className="max-w-7xl mx-auto">
        <ManagedAlerts
          apiKeyError={!IS_API_KEY_CONFIGURED && !manager.apiKeyErrorDismissed}
          error={manager.error}
          success={manager.success}
          onApiErrorClose={manager.setApiKeyErrorDismissed}
          onErrorClose={() => manager.setError(null)}
          onSuccessClose={() => manager.setSuccess(null)}
        />
        
        <FileUpload onFilesSelected={manager.handleFilesSelected} processing={manager.isLoading} />
        
        <PortfolioSuggestions
          suggestions={manager.suggestedPortfolioEntries}
          onAccept={manager.handleAcceptSuggestion}
          onDismiss={manager.handleDismissSuggestion}
          onDismissAll={manager.handleDismissAllSuggestions}
          disabled={manager.isLoading}
        />

        <KnowledgeBase
          ownedEntries={manager.ownedKnowledgeBase}
          pinnedIdeas={manager.pinnedIdeas}
          discoveredEntries={manager.discoveredPriorArt}
          onRemoveEntry={manager.handleRemoveKbEntry}
          onAddEntry={manager.handleAddNewKbEntry}
          onUpdateEntry={manager.handleUpdateKbEntry}
          onExport={manager.handleExportKb}
          onImport={manager.handleImportKb}
          onPinEntry={manager.handlePinPriorArt}
          onRemovePinnedIdea={manager.handleRemovePinnedIdea}
          onUpdatePinnedIdea={manager.handleUpdatePinnedIdea}
          onExportPinnedIdeas={manager.handleExportPinnedIdeas}
          onImportPinnedIdeas={manager.handleImportPinnedIdeas}
          disabled={manager.isLoading}
        />

        {manager.isLoading && <Spinner message={manager.loadingMessage} />}
        
        {manager.status === 'inventionsReadyForSelection' && manager.extractedInventions && (
          <InventionSelection
            inventions={manager.extractedInventions}
            selectedInvention={manager.selectedInvention}
            onSelectInvention={manager.handleInventionSelection}
            disabled={manager.isLoading}
          />
        )}
        
        {manager.status === 'reportReady' && manager.patentAnalysisReport && (
           <ReportDisplay
              report={manager.patentAnalysisReport}
              reportTitle={manager.selectedInvention?.title}
              onStartNewAnalysis={manager.startNewAnalysis}
              onGenerateApplication={manager.handleGenerateApplication}
              disabled={manager.isLoading}
            />
        )}

        {manager.status === 'applicationReady' && manager.patentApplication && (
           <PatentApplicationDisplay 
              application={manager.patentApplication} 
              inventionTitle={manager.selectedInvention?.title}
              onGenerateNew={manager.startNewAnalysis}
              isGenerating={manager.isLoading}
            />
        )}
      </main>
    </div>
  );
}