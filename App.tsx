

import React from 'react';
import { FileUpload } from './components/FileUpload';
import { PatentApplicationDisplay } from './components/PatentApplicationDisplay';
import { Spinner } from './components/Spinner';
import { ManagedAlerts } from './components/ManagedAlerts';
import { KnowledgeBase } from './components/KnowledgeBase';
import { PortfolioSuggestions } from './components/PortfolioSuggestions';
import { useAppManager } from './hooks/useAppManager';
import { InventionSelection } from './components/InventionSelection';
import { AnalysisWorkspace } from './components/AnalysisWorkspace';
import { BestPracticesGuide } from './components/BestPracticesGuide';

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
        
        <BestPracticesGuide />

        <PortfolioSuggestions
          suggestions={manager.suggestedPortfolioEntries}
          onAccept={manager.handleAcceptSuggestion}
          onDismiss={manager.handleDismissSuggestion}
          onDismissAll={manager.handleDismissAllSuggestions}
          disabled={manager.isLoading}
        />

        <KnowledgeBase
          ownedEntries={manager.ownedKnowledgeBase}
          discoveredEntries={manager.discoveredPriorArt}
          onRemoveEntry={manager.handleRemoveKbEntry}
          onPinEntry={manager.handlePinPriorArt}
          onExport={manager.handleExportKb}
          onImport={manager.handleImportKb}
          onUpdateEntry={manager.handleUpdateKbEntry}
          disabled={manager.isLoading}
        />

        {manager.isLoading && <Spinner message={manager.loadingMessage} />}
        
        {manager.status === 'inventionsReadyForSelection' && manager.extractedInventions && (
          <InventionSelection
            inventions={manager.extractedInventions}
            onSelectInvention={manager.handleInventionSelection}
            disabled={manager.isLoading}
          />
        )}

        {manager.status === 'claimsReadyForReview' && manager.analyzedInvention && (
            <AnalysisWorkspace
                analyzedInvention={manager.analyzedInvention}
                onToggleClaim={manager.handleToggleGradedClaim}
                onGenerateApplication={manager.handleGenerateApplication}
                disabled={manager.isLoading}
            />
        )}
        
        {manager.status === 'applicationReady' && manager.patentApplication && (
           <PatentApplicationDisplay 
              application={manager.patentApplication} 
              inventionTitle={manager.analyzedInvention?.originalInvention.title}
              onGenerateNew={() => manager.goBackToClaimReview()}
              isGenerating={manager.isLoading}
            />
        )}
      </main>
    </div>
  );
}