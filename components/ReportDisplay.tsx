import React from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm'; // For GitHub Flavored Markdown (tables, etc.)
import remarkSlug from 'remark-slug';
import { DownloadIcon, ExternalLinkIcon, ExclamationTriangleIcon } from './icons';
import { Alert } from './Alert';
import { PatentAnalysisReport, GroundingChunk } from '../types';
import { REPORT_DISCLAIMER } from '../constants';
import { sanitizeForFilename } from '../services/utils';

interface ReportDisplayProps {
  report: PatentAnalysisReport | null;
  reportTitle?: string;
}

// Helper function to escape special characters for use in RegExp
const escapeRegExp = (string: string): string => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
};

const extractSectionContent = (
  markdownContent: string, 
  sectionTitlePrefix: string, 
  nextSectionTitlePrefix?: string | null
): string => {
  if (!markdownContent || !sectionTitlePrefix) return "Section not found or content is empty.";
  
  const isSubSection = sectionTitlePrefix.startsWith('###');
  // Make regex more flexible to whitespace and characters after the prefix
  const sectionStartMarker = escapeRegExp(sectionTitlePrefix);
  
  // Regex to find the start of the section and consume the rest of the line.
  const startRegex = new RegExp(`^${sectionStartMarker}[\\t ]*.*$\\n?`, "m");
  const startIndexMatch = markdownContent.match(startRegex);
  
  if (!startIndexMatch || typeof startIndexMatch.index === 'undefined') {
    return `Content for "${sectionTitlePrefix}" not found.`;
  }
  
  // The content starts after the full matched heading line
  const contentStartIndex = startIndexMatch.index + startIndexMatch[0].length;
  let remainingContent = markdownContent.substring(contentStartIndex);
  let sectionContent = remainingContent;
  
  // Find where the next section begins to truncate the current section's content
  if (nextSectionTitlePrefix) {
    const nextMarker = escapeRegExp(nextSectionTitlePrefix);
    const endRegex = new RegExp(`^${nextMarker}`, "m");
    const endIndexMatch = remainingContent.match(endRegex);
    if (endIndexMatch && typeof endIndexMatch.index !== 'undefined') {
        sectionContent = remainingContent.substring(0, endIndexMatch.index);
    }
  } else {
    // If no next section is specified, find the next heading of same or higher level
    const endPattern = isSubSection 
      ? new RegExp(`\\n(?:###|##|--- APPENDICES ---)`, "m")
      : new RegExp(`\\n(?:##|--- APPENDICES ---)`, "m");
    const endIndexMatch = remainingContent.match(endPattern);
    if (endIndexMatch && typeof endIndexMatch.index !== 'undefined') {
        sectionContent = remainingContent.substring(0, endIndexMatch.index);
    }
  }

  return sectionContent.trim() || `Content for "${sectionTitlePrefix}" is empty.`;
};

/**
 * Recursively traverses a react-markdown node tree and concatenates all text content.
 * This is robust against nested elements like links or italics within a parent.
 * @param node The react-markdown node.
 * @returns The concatenated text content as a single string.
 */
const getNodeText = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.value || '';
  if (Array.isArray(node.children)) {
    return node.children.map(getNodeText).join('');
  }
  return '';
};


export function ReportDisplay({ report, reportTitle }: ReportDisplayProps) {
  if (!report || !report.markdownContent) {
    return null;
  }

  const handleExportMarkdown = (content: string, exportTypeSuffix: string) => {
    if (!content) return;

    const sanitizedTitle = sanitizeForFilename(reportTitle || 'report');
    const baseFilename = sanitizedTitle ? `${sanitizedTitle}_${exportTypeSuffix}` : exportTypeSuffix;
    
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    const timestamp = `_${year}${month}${day}_${hours}${minutes}${seconds}`;
    
    const filename = `${baseFilename}${timestamp}.md`;

    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const exportFullReport = () => {
    handleExportMarkdown(report.markdownContent + REPORT_DISCLAIMER, 'patentability_report_full');
  };

  const exportInitialClaims = () => {
    const section = extractSectionContent(report.markdownContent, "## Section 1", "## Section 2");
    handleExportMarkdown(section, 'initial_claims');
  };

  const exportBestModeClaims = () => {
    const section5Content = extractSectionContent(report.markdownContent, "## Section 5", "--- APPENDICES ---");
    const bestModeClaimsContent = extractSectionContent(section5Content, '### A. "Best Mode" Revised Claims', '### B.');
    handleExportMarkdown(bestModeClaimsContent, 'best_mode_revised_claims');
  };

  const exportStrategicOpportunities = () => {
    const section = extractSectionContent(report.markdownContent, "## Section 3", "## Section 4");
    handleExportMarkdown(section, 'strategic_opportunities');
  };

  const exportGoNoGoAssessment = () => {
    const section5Content = extractSectionContent(report.markdownContent, "## Section 5", "--- APPENDICES ---");
    const goNoGoContent = extractSectionContent(section5Content, '### C. Strategic Go/No-Go', null);
    handleExportMarkdown(goNoGoContent, 'go_no_go_assessment');
  };
  
  const components: Components = {
    h2: ({ node, id, children, ...props }) => <h2 id={id} className="text-2xl lg:text-3xl font-bold text-slate-800 mt-10 mb-5 pb-3 border-b border-slate-300 scroll-mt-20" {...props}>{children}</h2>,
    h3: ({ node, id, children, ...props }) => <h3 id={id} className="text-xl lg:text-2xl font-semibold text-slate-700 mt-8 mb-4 scroll-mt-20" {...props}>{children}</h3>,
    p: ({ node, children, ...props }) => <p className="mb-4 leading-relaxed text-slate-700" {...props}>{children}</p>,
    ul: ({ node, children, ...props }) => <ul className="list-disc list-outside pl-6 mb-4 space-y-2 text-slate-700" {...props}>{children}</ul>,
    ol: ({ node, children, ...props }) => <ol className="list-decimal list-outside pl-6 mb-4 space-y-2 text-slate-700" {...props}>{children}</ol>,
    li: ({ node, children, ...props }) => <li className="mb-1" {...props}>{children}</li>,
    blockquote: ({ node, children, ...props }) => (
      <blockquote 
        className="my-4 px-4 py-3 border-l-4 border-blue-600 bg-blue-50 text-slate-800 shadow-md rounded-r-md"
        {...props}
      >
        {children}
      </blockquote>
    ),
    strong: ({node, children, ...props}) => {
      const textContent = getNodeText(node);
      
      let textColorClass = 'text-slate-800'; 

      if (textContent.includes('(Green -')) {
        textColorClass = 'text-green-700';
      } else if (textContent.includes('(Yellow -') || textContent.includes('(Amber -')) {
        textColorClass = 'text-yellow-600';
      } else if (textContent.includes('(Red -')) {
        textColorClass = 'text-red-700';
      }
      return <strong className={`${textColorClass} font-semibold`} {...props}>{children}</strong>;
    },
    a: ({ children, href, title, ...props }) => (
      <a 
        href={href}
        title={title}
        target="_blank" 
        rel="noopener noreferrer" 
        className="text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center"
        {...props}
      >
        {children}
        <ExternalLinkIcon className="ml-1 w-3.5 h-3.5" />
      </a>
    ),
    table: ({ node, children, ...props }) => <table className="min-w-full divide-y divide-slate-300 border border-slate-300 my-6 shadow-sm rounded-md" {...props}>{children}</table>,
    thead: ({ node, children, ...props }) => <thead className="bg-slate-100" {...props}>{children}</thead>,
    th: ({ node, style, children, ...props }) => <th style={style} className="px-4 py-3 text-left text-sm font-semibold text-slate-700 border border-slate-200" {...props}>{children}</th>,
    td: ({ node, style, children, ...props }) => <td style={style} className="px-4 py-3 text-sm text-slate-700 border border-slate-200" {...props}>{children}</td>,
  };
  
  const redTeamComponents: Components = {
    ...components,
    h2: ({ node, id, children, ...props }) => (
        <div className="flex items-start">
            <ExclamationTriangleIcon className="h-7 w-7 text-amber-600 mr-3 mt-1 flex-shrink-0" />
            <h2 id={id} className="text-2xl lg:text-3xl font-bold text-amber-800 mt-0 mb-4 pb-0 border-b-0 scroll-mt-20" {...props}>{children}</h2>
        </div>
    ),
    h3: ({ node, id, children, ...props }) => <h3 id={id} className="text-xl lg:text-2xl font-semibold text-amber-700 mt-6 mb-3 scroll-mt-20" {...props}>{children}</h3>,
    p: ({ node, children, ...props }) => <p className="mb-4 leading-relaxed text-amber-900/90" {...props}>{children}</p>,
    ul: ({ node, children, ...props }) => <ul className="list-disc list-outside pl-6 mb-4 space-y-2 text-amber-900/90" {...props}>{children}</ul>,
    strong: ({node, children, ...props}) => <strong className="font-semibold text-amber-900" {...props}>{children}</strong>,
    blockquote: ({ node, children, ...props }) => (
      <blockquote 
        className="my-4 px-4 py-3 border-l-4 border-amber-400 bg-amber-100 text-amber-900 shadow-sm rounded-r-md"
        {...props}
      >
        {children}
      </blockquote>
    ),
  };

  const renderGroundingMetadata = (metadata: PatentAnalysisReport['groundingMetadata']) => {
    if (!metadata || (!metadata.groundingChunks?.length && !metadata.searchQueries?.length)) {
      return (
        <div className="mt-8 p-4 bg-slate-50 border border-slate-200 rounded-md">
           <p className="text-sm text-slate-500">No specific sources or grounding information cited by the model for this response.</p>
        </div>
      );
    }

    const webChunks = metadata.groundingChunks?.filter(chunk => chunk.web && chunk.web.uri) || [];
    const contextChunks = metadata.groundingChunks?.filter(chunk => !chunk.web && chunk.retrievedContext && typeof chunk.retrievedContext.text === 'string') || [];

    return (
      <div className="mt-8 mb-4 p-5 bg-slate-100 border border-slate-300 rounded-lg shadow-md">
        <h3 id="sources-grounding-information" className="text-xl font-semibold text-slate-700 mb-4 border-b border-slate-300 pb-3 scroll-mt-20">Sources &amp; Grounding Information</h3>
        {metadata.searchQueries && metadata.searchQueries.length > 0 && (
           <p className="text-sm text-slate-600 mb-3">Search queries considered by the model: <em className="font-semibold text-slate-700">{metadata.searchQueries.join('; ')}</em></p>
        )}
        {webChunks.length > 0 && (
          <>
            <h4 className="text-md font-medium text-slate-600 mt-3 mb-2">Web Sources Cited:</h4>
            <ul className="list-disc list-outside space-y-1.5 pl-5">
              {webChunks.map((chunk: GroundingChunk, index: number) => (
                chunk.web && ( 
                  <li key={`web-${index}`} className="text-sm">
                    <a href={chunk.web.uri} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center">
                      {chunk.web.title || chunk.web.uri}
                      <ExternalLinkIcon className="ml-1 w-3.5 h-3.5"/>
                    </a>
                  </li>
                )
              ))}
            </ul>
          </>
        )}
         {contextChunks.length > 0 && (
          <div className={`mt-4 ${webChunks.length > 0 ? 'pt-4 border-t border-slate-300' : ''}`}>
             <h4 className="text-md font-medium text-slate-600 mb-2">Additional Retrieved Context Snippets:</h4>
             {contextChunks.map((chunk, index) => (
                <details key={`context-${index}`} className="text-xs text-slate-500 mt-1 p-3 border border-slate-200 rounded-md bg-white shadow-sm hover:shadow-lg transition-shadow duration-150">
                    <summary className="cursor-pointer font-medium text-slate-700 hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">
                      Context Snippet {index + 1} 
                      {chunk.retrievalQuery ? <span className="font-normal italic text-slate-600"> (Related to query: "{chunk.retrievalQuery}")</span>: ''}
                    </summary>
                    <div className="mt-2.5 p-3 bg-slate-50 rounded border border-slate-100">
                      <p className="whitespace-pre-wrap text-slate-700 text-sm">{chunk.retrievedContext!.text}</p> 
                    </div>
                </details>
             ))}
          </div>
        )}
         {webChunks.length === 0 && contextChunks.length === 0 && (!metadata.searchQueries || metadata.searchQueries.length === 0) && (
             <p className="text-sm text-slate-500">No specific sources or context cited by the model for this response.</p>
         )}
      </div>
    );
  };

  const { markdownContent } = report;
  const redTeamMarker = '## Red Team Analysis';

  let mainPart = markdownContent;
  let redTeamPart: string | null = null;

  const redTeamIndex = markdownContent.indexOf(redTeamMarker);
  if (redTeamIndex !== -1) {
    mainPart = markdownContent.substring(0, redTeamIndex);
    redTeamPart = markdownContent.substring(redTeamIndex);
  }

  return (
    <div className="bg-white p-6 sm:p-8 rounded-lg shadow-xl mt-8 relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 pb-4 border-b border-slate-300">
        <h2 className="text-2xl lg:text-3xl font-bold text-slate-800 mb-2 sm:mb-0">
          Patentability &amp; Prior Art Analysis Report
        </h2>
        <button
          onClick={exportFullReport}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-150"
        >
          <DownloadIcon className="mr-2 h-5 w-5" />
          Export Full Report
        </button>
      </div>
      
      <div className="my-6 flex flex-wrap gap-2">
         <button
          onClick={exportInitialClaims}
          className="inline-flex items-center px-3 py-1.5 border border-slate-300 text-xs font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 transition-colors"
        >
          <DownloadIcon className="mr-1.5 h-4 w-4" /> Export Initial Claims
        </button>
        <button
          onClick={exportBestModeClaims}
          className="inline-flex items-center px-3 py-1.5 border border-slate-300 text-xs font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 transition-colors"
        >
          <DownloadIcon className="mr-1.5 h-4 w-4" /> Export 'Best Mode' Claims
        </button>
        <button
          onClick={exportStrategicOpportunities}
          className="inline-flex items-center px-3 py-1.5 border border-slate-300 text-xs font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 transition-colors"
        >
          <DownloadIcon className="mr-1.5 h-4 w-4" /> Export Strategic Opportunities
        </button>
        <button
          onClick={exportGoNoGoAssessment}
          className="inline-flex items-center px-3 py-1.5 border border-slate-300 text-xs font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 transition-colors"
        >
          <DownloadIcon className="mr-1.5 h-4 w-4" /> Export Go/No-Go Assessment
        </button>
      </div>
      
      <div className="max-w-none mt-4 prose prose-slate lg:prose-xl"> 
        <ReactMarkdown 
          remarkPlugins={[remarkGfm, remarkSlug]}
          components={components}
        >
          {mainPart}
        </ReactMarkdown>
      </div>

      {redTeamPart ? (
        <div className="mt-12 p-6 bg-amber-50 border-l-4 border-amber-500 rounded-lg">
           <ReactMarkdown 
             remarkPlugins={[remarkGfm, remarkSlug]}
             components={redTeamComponents}
           >
             {redTeamPart}
           </ReactMarkdown>
        </div>
      ) : (
        <div className="mt-12">
            <Alert
                type="warning"
                title="Red Team Analysis Missing"
                message="The AI model did not provide the mandatory 'Red Team Analysis' section. This self-critique is a required part of a robust analysis. Please treat the conclusions of this report with extra caution, as its potential weaknesses and unstated assumptions have not been reviewed."
            />
        </div>
      )}

      <div className="max-w-none mt-4 prose prose-slate lg:prose-xl">
          <ReactMarkdown components={components} remarkPlugins={[remarkGfm, remarkSlug]}>
              {REPORT_DISCLAIMER}
          </ReactMarkdown>
      </div>

      {renderGroundingMetadata(report.groundingMetadata)}

    </div>
  );
}