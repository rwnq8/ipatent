import React from 'react';
import { FileUpload } from './components/FileUpload';
import { ReportDisplay } from './components/ReportDisplay';
import { PatentApplicationDisplay } from './components/PatentApplicationDisplay';
import { Spinner } from './components/Spinner';
import { Alert } from './components/Alert';
import { KnowledgeBase } from './components/KnowledgeBase';
import { useAppManager } from './hooks/useAppManager';

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
        {!IS_API_KEY_CONFIGURED && !manager.apiKeyErrorDismissed && (
          <Alert
            type="error"
            title="Configuration Error"
            message="Gemini API Key (API_KEY) is not set in the environment. This application requires an API key to function."
            onClose={() => manager.setApiKeyErrorDismissed(true)}
          />
        )}

        {manager.error && <Alert type="error" title="An Error Occurred" message={manager.error} onClose={() => manager.setError(null)} />}
        {manager.success && <Alert type="success" title="Success" message={manager.success} onClose={() => manager.setSuccess(null)} />}
        {manager.tokenWarning && <Alert type="warning" title="Token Count Advisory" message={manager.tokenWarning} onClose={() => manager.setTokenWarning(null)} />}

        <FileUpload onFilesSelected={manager.handleFilesSelected} processing={manager.isAnyTaskRunning} />

        <KnowledgeBase
          ownedEntries={manager.ownedKnowledgeBase}
          discoveredEntries={manager.discoveredPriorArt}
          onBuildFromFiles={manager.handleBuildKb}
          onRemoveEntry={manager.handleRemoveKbEntry}
          onExport={manager.handleExportKb}
          onImport={manager.handleImportKb}
          disabled={manager.isAnyTaskRunning}
          isBuilding={manager.isBuildingKb}
        />

        {manager.isParsing && <Spinner message="Parsing files..." />}
        {manager.isEstimatingTokens && <Spinner message="Estimating token count..." />}
        
        {manager.processedFileContents.length > 0 && !manager.isParsing && (
          <div className="mt-8">
            {manager.projectCodename && !manager.isLoading && (
              <div className="mb-6 bg-indigo-50 p-4 rounded-lg border border-indigo-200 text-center">
                <p className="text-sm text-indigo-700">Current Project Codename: <strong className="font-semibold">{manager.projectCodename}</strong></p>
              </div>
            )}
            
            <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
              <label htmlFor="report-title-input" className="block text-lg font-semibold text-slate-800">Report Title</label>
              <p className="mt-1 text-sm text-slate-500">This title will be used as a fallback for exported filenames if a project codename isn't generated. It defaults to the first uploaded file's name.</p>
              <input
                type="text"
                id="report-title-input"
                value={manager.reportTitle}
                onChange={(e) => manager.setReportTitle(e.target.value)}
                disabled={manager.isAnyTaskRunning}
                className="mt-3 block w-full px-4 py-2 bg-white border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-base disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed"
                placeholder="Enter a title for the analysis report"
              />
            </div>

            {!manager.report && !manager.isLoading && (
              <div className="text-center">
                <button
                  onClick={manager.handleAnalyzeInvention}
                  disabled={manager.isAnyTaskRunning || !IS_API_KEY_CONFIGURED}
                  className="px-8 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
                >
                  {manager.isLoading ? 'Analyzing...' : 'Analyze & Generate Report'}
                </button>
                {!IS_API_KEY_CONFIGURED && <p className="mt-2 text-xs text-red-600">API Key not configured. Analysis disabled.</p>}
              </div>
            )}
          </div>
        )}

        {manager.isLoading && <Spinner message={manager.loadingMessage} />}
        
        {manager.report && !manager.isLoading && (
          <div className="mt-8">
            <div className="border-b border-slate-300">
              <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                <button
                  onClick={() => manager.setActiveTab('report')}
                  className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${manager.activeTab === 'report' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
                >
                  Analysis Report
                </button>
                <button
                  onClick={() => manager.setActiveTab('application')}
                  className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${manager.activeTab === 'application' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
                >
                  Patent Application Draft
                </button>
              </nav>
            </div>

            <div className="mt-1">
              {manager.activeTab === 'report' && <ReportDisplay report={manager.report} reportTitle={manager.reportTitle} projectCodename={manager.projectCodename} />}
              {manager.activeTab === 'application' && (
                <div>
                  {manager.isGeneratingProvisional && <div className="mt-8"><Spinner message="Generating Provisional Application... This may take several minutes." /></div>}
                  {manager.isGeneratingNonProvisional && <div className="mt-8"><Spinner message="Generating Non-Provisional Application Draft... This may take several minutes." /></div>}
                  {!manager.isAnyTaskRunning && manager.patentApplication && <PatentApplicationDisplay application={manager.patentApplication} reportTitle={manager.reportTitle} projectCodename={manager.projectCodename} />}
                  {!manager.isAnyTaskRunning && !manager.patentApplication && (
                    <div className="text-center bg-white p-8 rounded-lg shadow-xl mt-8">
                      <h3 className="text-xl font-semibold text-slate-700">Generate a Draft Patent Application</h3>
                      <p className="mt-2 text-slate-600 max-w-2xl mx-auto">Select the type of application to generate based on your strategic needs. A provisional application is ideal for quickly securing a priority date with a detailed disclosure, while a non-provisional is a formal application ready for examination.</p>
                      <div className="mt-6 flex flex-col sm:flex-row gap-4 justify-center">
                        <button onClick={() => manager.handleGenerateApplication('provisional')} disabled={manager.isAnyTaskRunning || !IS_API_KEY_CONFIGURED} className="px-8 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors">Generate Provisional Application</button>
                        <button onClick={() => manager.handleGenerateApplication('non-provisional')} disabled={manager.isAnyTaskRunning || !IS_API_KEY_CONFIGURED} className="px-8 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors">Generate Non-Provisional Application</button>
                      </div>
                      {!IS_API_KEY_CONFIGURED && <p className="mt-4 text-xs text-red-600">API Key not configured. Generation disabled.</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        
      </main>
      <footer className="mt-12 text-center text-sm text-slate-500">
        <p>&copy; {new Date().getFullYear()} AI Patent Analyzer. For informational purposes only.</p>
      </footer>
    </div>
  );
}
