


import React from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { DownloadIcon, ExternalLinkIcon } from './icons';
import { PatentApplication } from '../types';
import { sanitizeForFilename } from '../services/utils';

interface PatentApplicationDisplayProps {
  application: PatentApplication | null;
  reportTitle?: string;
  projectCodename: string;
}

export function PatentApplicationDisplay({ application, reportTitle, projectCodename }: PatentApplicationDisplayProps) {
  if (!application || !application.markdownContent) {
    return null;
  }

  const handleExportMarkdown = () => {
    if (!application.markdownContent) return;
    
    const exportTypeSuffix = application.type === 'provisional' 
      ? 'provisional_patent_application' 
      : 'non-provisional_patent_application';

    const sanitizedTitle = sanitizeForFilename(projectCodename || reportTitle || 'application');
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

    const blob = new Blob([application.markdownContent], { type: 'text/markdown;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const components: Components = {
    h2: ({ node, id, children, ...props }) => <h2 id={id} className="text-xl font-bold text-slate-800 mt-10 mb-5 pb-3 border-b border-slate-300 uppercase tracking-wide scroll-mt-20" {...props}>{children}</h2>,
    h3: ({ node, id, children, ...props }) => <h3 id={id} className="text-lg font-semibold text-slate-700 mt-8 mb-4 scroll-mt-20" {...props}>{children}</h3>,
    p: ({ node, children, ...props }) => <p className="mb-4 leading-relaxed text-slate-700" {...props}>{children}</p>,
    ul: ({ node, children, ...props }) => <ul className="list-disc list-outside pl-6 mb-4 space-y-2 text-slate-700" {...props}>{children}</ul>,
    ol: ({ node, children, ...props }) => <ol className="list-decimal list-outside pl-6 mb-4 space-y-2 text-slate-700" {...props}>{children}</ol>,
    li: ({ node, children, ...props }) => <li className="mb-1" {...props}>{children}</li>,
    blockquote: ({ node, children, ...props }) => (
      <blockquote 
        className="my-4 px-4 py-3 border-l-4 border-slate-400 bg-slate-50 text-slate-800 shadow-sm rounded-r-md"
        {...props}
      >
        {children}
      </blockquote>
    ),
    strong: ({ node, children, ...props }) => <strong className="font-semibold text-slate-800" {...props}>{children}</strong>,
    a: ({ node, children, href, title, ...props }) => (
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

  const titleText = application.type === 'provisional' ? 'Provisional Patent Application' : 'Non-Provisional Patent Application Draft';
  const buttonClass = application.type === 'provisional' 
      ? "bg-teal-600 hover:bg-teal-700 focus:ring-teal-500"
      : "bg-green-600 hover:bg-green-700 focus:ring-green-500";
      
  return (
    <div className="bg-white p-6 sm:p-8 rounded-lg shadow-xl mt-8 relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 pb-4 border-b border-slate-300">
        <h2 className="text-2xl lg:text-3xl font-bold text-slate-800 mb-2 sm:mb-0">
          {titleText}
        </h2>
        <button
          onClick={handleExportMarkdown}
          className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-150 ${buttonClass}`}
        >
          <DownloadIcon className="mr-2 h-5 w-5" />
          Export Application
        </button>
      </div>
      
      <div className="max-w-none mt-4 prose prose-slate lg:prose-xl"> 
        <ReactMarkdown 
          remarkPlugins={[remarkGfm]}
          components={components}
        >
          {application.markdownContent}
        </ReactMarkdown>
      </div>
    </div>
  );
}