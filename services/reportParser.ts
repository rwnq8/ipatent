import { KnowledgeBaseEntry } from '../types';

/**
 * Parses the markdown content of a patent analysis report to extract prior art references.
 * @param markdownContent The full markdown string of the report.
 * @returns An array of KnowledgeBaseEntry objects representing the discovered prior art.
 */
export const parseReportForPriorArt = (markdownContent: string): Omit<KnowledgeBaseEntry, 'id'>[] => {
  const priorArtEntries: Omit<KnowledgeBaseEntry, 'id'>[] = [];

  const appendixAContentMatch = markdownContent.match(/##\s*Appendix A: Detailed Prior Art & FTO Analysis\s*([\s\S]*?)(?=\n##\s*Appendix B:|$)/ms);
  if (!appendixAContentMatch || !appendixAContentMatch[1]) {
    return [];
  }
  const appendixAContent = appendixAContentMatch[1];
  
  const entryRegex = /###\s*\*\*(?:Analysis of|Analysis for)\s+(.*?):\*\*\s*([\s\S]*?)(?=\n###\s*\*\*Analysis of|\n###\s*\*\*Analysis for|$)/gms;
  
  let match;
  while ((match = entryRegex.exec(appendixAContent)) !== null) {
    const titleBlock = match[1]?.trim() || 'Unknown Document';
    const contentBlock = match[2]?.trim() || '';

    // Improved regex to find title, tolerant of missing hyphen.
    const descriptiveTitleMatch = contentBlock.match(/\*\*Full Citation:\*\*\s*\[.*?\]\(.*?\)\s*[-–—]?\s*(.*)/);
    const descriptiveTitle = descriptiveTitleMatch ? descriptiveTitleMatch[1].trim() : 'Title Not Found';

    const identifier = titleBlock.replace(/\[|\]|\(.*\)/g, '').trim(); // Get the doc number from the H3
    
    const statusMatch = contentBlock.match(/Estimated Status:\s*\*\*(.*?)\*\*/);
    const filingDateMatch = contentBlock.match(/Key Dates:.*?Priority:\s*(\d{4}-\d{2}-\d{2})/);
    const publicationDateMatch = contentBlock.match(/Key Dates:.*?Publication:\s*(\d{4}-\d{2}-\d{2})/);
    const urlMatch = contentBlock.match(/\*\*Full Citation:\*\*\s*\[.*?\]\((.*?)\)/);

    const status = statusMatch ? statusMatch[1].toLowerCase() : 'unknown';
    const url = urlMatch ? urlMatch[1] : '';
    const isProvisional = identifier.toLowerCase().includes('provisional');

    const entry: Omit<KnowledgeBaseEntry, 'id'> = {
      isOwner: false,
      title: descriptiveTitle,
      applicationNumber: identifier,
      filingDate: filingDateMatch ? filingDateMatch[1] : (publicationDateMatch ? publicationDateMatch[1] : "N/A"),
      type: isProvisional ? 'provisional' : 'non-provisional',
      files: [{ name: "Extracted from Report", content: contentBlock }],
      extractedClaims: [],
      notes: `Extracted automatically from analysis report. Status: ${status}. URL: ${url}`,
      priorityTo: undefined,
    };
    priorArtEntries.push(entry);
  }
  
  return priorArtEntries;
};