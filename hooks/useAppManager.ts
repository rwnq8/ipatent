import { useState, useCallback, useEffect } from 'react';
import { processUploadedFiles } from '../services/fileParserService';
import {
  generatePatentReport,
  generateNonProvisionalPatentApplication,
  generateProvisionalPatentApplication,
  constructPrompt,
  structureKnowledgeBaseFromFiles,
  generateProjectCodename
} from '../services/geminiService';
import { parseReportForPriorArt } from '../services/reportParser';
import { countTokens } from '../services/tokenCountService';
import {
  getKnowledgeBase,
  removeKnowledgeBaseEntry,
  exportKnowledgeBase,
  importKnowledgeBase,
  addKnowledgeBaseEntriesFromStructuredData
} from '../services/knowledgeBaseService';
import { ProcessedFile, PatentAnalysisReport, PatentApplication, KnowledgeBaseEntry, KnowledgeBaseUpdateResult } from '../types';
import { TOKEN_WARNING_THRESHOLD } from '../constants';

const IS_API_KEY_CONFIGURED = !!process.env.API_KEY;

/**
 * Custom Hook: useAppManager
 * Encapsulates all application state and logic, leaving the App component as a pure view.
 * This refactoring improves stability and makes state management more predictable.
 */
export const useAppManager = () => {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [processedFileContents, setProcessedFileContents] = useState<ProcessedFile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isEstimatingTokens, setIsEstimatingTokens] = useState<boolean>(false);
  const [report, setReport] = useState<PatentAnalysisReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tokenWarning, setTokenWarning] = useState<string | null>(null);
  const [estimatedTokenCount, setEstimatedTokenCount] = useState<number | null>(null);
  const [apiKeyErrorDismissed, setApiKeyErrorDismissed] = useState<boolean>(false);
  const [reportTitle, setReportTitle] = useState<string>('');
  const [projectCodename, setProjectCodename] = useState<string>('');
  const [patentApplication, setPatentApplication] = useState<PatentApplication | null>(null);
  const [isGeneratingProvisional, setIsGeneratingProvisional] = useState<boolean>(false);
  const [isGeneratingNonProvisional, setIsGeneratingNonProvisional] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'report' | 'application'>('report');
  const [ownedKnowledgeBase, setOwnedKnowledgeBase] = useState<KnowledgeBaseEntry[]>([]);
  const [discoveredPriorArt, setDiscoveredPriorArt] = useState<KnowledgeBaseEntry[]>([]);
  const [isBuildingKb, setIsBuildingKb] = useState<boolean>(false);

  // Load owned KB on initial mount
  useEffect(() => {
    setOwnedKnowledgeBase(getKnowledgeBase());
  }, []);

  // Auto-dismiss messages
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [success]);
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 15000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // File parsing effect
  useEffect(() => {
    if (uploadedFiles.length === 0) {
      setProcessedFileContents([]);
      return;
    }
    setIsParsing(true);
    setError(null);
    setSuccess(null);
    processUploadedFiles(uploadedFiles)
      .then(({ successfulFiles, errors }) => {
        if (errors.length > 0) {
          const errorMessages = errors.map(e => `- ${e.fileName}: ${e.message}`).join('\n');
          setError(`Could not process some files:\n${errorMessages}`);
        }
        setProcessedFileContents(successfulFiles);
      })
      .catch(err => {
        console.error("Critical error in file processing service:", err);
        setError(`A critical error occurred: ${(err as Error).message}`);
      })
      .finally(() => setIsParsing(false));
  }, [uploadedFiles]);

  // Token estimation effect
  useEffect(() => {
    if (processedFileContents.length === 0) {
      setTokenWarning(null);
      setEstimatedTokenCount(null);
      return;
    }
    const fullKnowledgeBase = [...ownedKnowledgeBase, ...discoveredPriorArt];
    const combinedUserContent = processedFileContents.map(f => `Document: ${f.name}\n\n${f.content}`).join('\n\n---\n\n');
    const fullPromptForAnalysis = constructPrompt(combinedUserContent, fullKnowledgeBase);
    
    setIsEstimatingTokens(true);
    setTokenWarning(null);
    setEstimatedTokenCount(null);
    countTokens(fullPromptForAnalysis)
      .then(numTokens => {
        setEstimatedTokenCount(numTokens);
        if (numTokens > TOKEN_WARNING_THRESHOLD) {
          setTokenWarning(`Warning: The estimated token count (${numTokens.toLocaleString()}) for your input is very high. This may result in long processing times or potential errors.`);
        }
      })
      .catch(err => {
        console.error("Error estimating tokens:", err);
        setTokenWarning("Could not estimate token count. Proceed with caution if documents are very large.");
      })
      .finally(() => setIsEstimatingTokens(false));
  }, [processedFileContents, ownedKnowledgeBase, discoveredPriorArt]);

  // --- Handlers ---
  const handleFilesSelected = useCallback((files: File[]) => {
    setUploadedFiles(files);
    setReport(null);
    setPatentApplication(null);
    setDiscoveredPriorArt([]);
    setActiveTab('report');
    setError(null);
    setSuccess(null);
    setTokenWarning(null);
    setEstimatedTokenCount(null);
    setProjectCodename('');
    setReportTitle(files.length > 0 ? files[0].name : '');
  }, []);

  const handleAnalyzeInvention = async () => {
    if (processedFileContents.length === 0) {
      setError("Please upload at least one document to analyze.");
      return;
    }
    if (!IS_API_KEY_CONFIGURED) {
      setError("Gemini API Key is not configured. Analysis cannot proceed.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    setReport(null);
    setPatentApplication(null);
    setDiscoveredPriorArt([]);
    setActiveTab('report');
    const combinedContent = processedFileContents.map(f => `Document: ${f.name}\n\n${f.content}`).join('\n\n---\n\n');
    const fullKnowledgeBase = [...ownedKnowledgeBase];
    try {
      setLoadingMessage("Generating project codename...");
      const codename = await generateProjectCodename(combinedContent);
      setProjectCodename(codename);
      setLoadingMessage("Generating patent report with Gemini... This may take several minutes.");
      const generatedReport = await generatePatentReport(combinedContent, fullKnowledgeBase);
      setReport(generatedReport);
      const parsedPriorArt = parseReportForPriorArt(generatedReport.markdownContent).map((entry, index) => ({
        ...entry,
        id: `prior-art-${Date.now()}-${index}`
      }));
      setDiscoveredPriorArt(parsedPriorArt);
      setSuccess(`Analysis report generated successfully for project: ${codename}. Discovered prior art has been added to the knowledge base for this session.`);
    } catch (err) {
      console.error("Error generating report:", err);
      setError(`Failed to generate report: ${(err as Error).message}`);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  const handleGenerateApplication = async (type: 'provisional' | 'non-provisional') => {
    if (!report || processedFileContents.length === 0) {
      setError("An analysis report must be generated first.");
      return;
    }
    if (!IS_API_KEY_CONFIGURED) {
      setError("Gemini API Key is not configured. Application generation cannot proceed.");
      return;
    }
    const setLoading = type === 'provisional' ? setIsGeneratingProvisional : setIsGeneratingNonProvisional;
    setLoading(true);
    setError(null);
    setSuccess(null);
    const combinedContent = processedFileContents.map(f => `Document: ${f.name}\n\n${f.content}`).join('\n\n---\n\n');
    const fullKnowledgeBase = [...ownedKnowledgeBase, ...discoveredPriorArt];
    try {
      const generator = type === 'provisional' ? generateProvisionalPatentApplication : generateNonProvisionalPatentApplication;
      const generatedApplication = await generator(combinedContent, report.markdownContent, fullKnowledgeBase);
      setPatentApplication(generatedApplication);
      setSuccess(`Draft of ${type} application generated successfully.`);
    } catch (err) {
      console.error(`Error generating ${type} patent application:`, err);
      setError(`Failed to generate ${type} application: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateKbResult = (result: KnowledgeBaseUpdateResult) => {
    const { updatedKb, addedCount, updatedCount, conflicts } = result;
    setOwnedKnowledgeBase(updatedKb);
    let successMsg = '';
    if (addedCount > 0 || updatedCount > 0) {
      successMsg = `Knowledge base updated: ${addedCount} entries added, ${updatedCount} entries merged.`;
    } else if (conflicts.length === 0) {
      successMsg = "No new information found to add or update in the knowledge base.";
    }
    if (successMsg) setSuccess(successMsg);
    if (conflicts.length > 0) {
      setError(`Conflicts detected. The following updates were skipped:\n- ${conflicts.join('\n- ')}`);
    }
  };

  const handleBuildKb = async (kbFiles: File[]) => {
    if (kbFiles.length === 0) return;
    setIsBuildingKb(true);
    setError(null);
    setSuccess(null);
    try {
      const { successfulFiles, errors } = await processUploadedFiles(kbFiles);
      if (errors.length > 0) {
        const errorMessages = errors.map(e => `- ${e.fileName}: ${e.message}`).join('\n');
        setError(`Could not process all knowledge base files:\n${errorMessages}`);
      }
      if (successfulFiles.length === 0) {
        setIsBuildingKb(false);
        return;
      }
      const structuredData = await structureKnowledgeBaseFromFiles(successfulFiles);
      const result = addKnowledgeBaseEntriesFromStructuredData(structuredData, successfulFiles);
      handleUpdateKbResult(result);
    } catch (err) {
      setError(`Failed to build knowledge base: ${(err as Error).message}`);
    } finally {
      setIsBuildingKb(false);
    }
  };

  const handleRemoveKbEntry = (id: string) => {
    const updatedKb = removeKnowledgeBaseEntry(id);
    setOwnedKnowledgeBase(updatedKb);
    setSuccess("Portfolio entry removed.");
  };

  const handleExportKb = () => {
    try {
      const jsonString = exportKnowledgeBase();
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'patent_portfolio_knowledge_base.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSuccess("Knowledge base exported successfully.");
    } catch (err) {
      setError(`Failed to export knowledge base: ${(err as Error).message}`);
    }
  };

  const handleImportKb = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) throw new Error("File is empty.");
        const result = importKnowledgeBase(text);
        handleUpdateKbResult(result);
      } catch (err) {
        setError(`Failed to import knowledge base: ${(err as Error).message}`);
      }
    };
    reader.onerror = () => setError("Failed to read the import file.");
    reader.readAsText(file);
    event.target.value = '';
  };
  
  const isAnyGenerationRunning = isGeneratingProvisional || isGeneratingNonProvisional;
  const isAnyTaskRunning = isLoading || isParsing || isEstimatingTokens || isAnyGenerationRunning || isBuildingKb;

  return {
    // State
    processedFileContents, isLoading, loadingMessage, isParsing, isEstimatingTokens, report, error, success,
    tokenWarning, apiKeyErrorDismissed, reportTitle, projectCodename, patentApplication, isGeneratingProvisional,
    isGeneratingNonProvisional, activeTab, ownedKnowledgeBase, discoveredPriorArt, isBuildingKb, isAnyTaskRunning,
    // Setters
    setApiKeyErrorDismissed, setReportTitle, setActiveTab, setError, setSuccess, setTokenWarning,
    // Handlers
    handleFilesSelected, handleAnalyzeInvention, handleGenerateApplication, handleBuildKb,
    handleRemoveKbEntry, handleExportKb, handleImportKb,
  };
};
