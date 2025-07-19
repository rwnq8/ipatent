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
import { LoadAnalysis } from './components/LoadAnalysis';

const IS_API_KEY_CONFIGURED = !!process.env.API_KEY;

export function App() {
  const manager = useAppManager();

  const handleCancelGeneration = () => {
    // This handler resets the state, allowing the user to exit a long-running process.
    if(manager.status === 'generatingApplication' || manager.status === 'reviewingApplication' || manager.status === 'refiningApplication') {
        manager.startNewDraft();
    } else {
        manager.startNewAnalysis();
    }
  }

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
        
        {manager.status === 'idle' && (
          <>
            <FileUpload onFilesSelected={manager.handleFilesSelected} processing={manager.isLoading} />
            <LoadAnalysis onImport={manager.handleImportExtractedInventions} disabled={manager.isLoading} />
          </>
        )}
        
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
          priorArtLibrary={manager.priorArtLibrary}
          onRemoveEntry={manager.handleRemoveKbEntry}
          onAddEntry={manager.handleAddNewKbEntry}
          onUpdateEntry={manager.handleUpdateKbEntry}
          onExportAll={manager.handleExportFullKb}
          onImportAll={manager.handleImportFullKb}
          onPinEntry={manager.handlePinPriorArt}
          onRemovePinnedIdea={manager.handleRemovePinnedIdea}
          onUpdatePinnedIdea={manager.handleUpdatePinnedIdea}
          onAddNewPinnedIdea={manager.handleAddNewPinnedIdea}
          onRemovePriorArtLibraryEntry={manager.handleRemovePriorArtLibraryEntry}
          onUpdatePriorArtLibraryEntry={manager.handleUpdatePriorArtLibraryEntry}
          disabled={manager.isLoading}
        />

        {manager.isLoading && (
            <Spinner
                message={manager.loadingMessage}
                onCancel={['generatingReport', 'generatingApplication', 'reviewingApplication', 'refiningApplication'].includes(manager.status) ? handleCancelGeneration : undefined}
            />
        )}
        
        {manager.status === 'inventionsReadyForSelection' && manager.extractedInventions && (
          <InventionSelection
            inventions={manager.extractedInventions}
            selectedInvention={manager.selectedInvention}
            onSelectInvention={manager.handleInventionSelection}
            onExport={manager.handleExportExtractedInventions}
            disabled={manager.isLoading}
          />
        )}
        
        {manager.status === 'reportReady' && manager.patentAnalysisReport && (
           <ReportDisplay
              report={manager.patentAnalysisReport}
              reportTitle={manager.selectedInvention?.title}
              onStartNewAnalysis={manager.startNewAnalysis}
              onGenerateApplication={manager.handleGenerateApplication}
              onUpdateReport={manager.handleUpdateReportContent}
              disabled={manager.isLoading}
            />
        )}

        {manager.status === 'applicationReady' && manager.patentApplication && (
           <PatentApplicationDisplay 
              application={manager.patentApplication} 
              applicationReviewReport={manager.applicationReviewReport}
              inventionTitle={manager.selectedInvention?.title}
              onGenerateNew={manager.startNewDraft}
              onRefineApplication={manager.handleRefineApplication}
              disabled={manager.isLoading}
            />
        )}
      </main>
    </div>
  );
}