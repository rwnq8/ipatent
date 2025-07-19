import React, { useState, useEffect } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkSlug from 'remark-slug';
import { ExternalLinkIcon } from './icons';
import { Spinner } from './Spinner';
import { Alert } from './Alert';

// Re-using styles from ReportDisplay for consistency
const markdownComponents: Components = {
    h1: ({ node, id, children, ...props }) => <h1 id={id} className="text-3xl lg:text-4xl font-extrabold text-slate-900 mt-10 mb-6 pb-4 border-b-2 border-slate-400 scroll-mt-20" {...props}>{children}</h1>,
    h2: ({ node, id, children, ...props }) => <h2 id={id} className="text-2xl lg:text-3xl font-bold text-slate-800 mt-10 mb-5 pb-3 border-b border-slate-300 scroll-mt-20" {...props}>{children}</h2>,
    h3: ({ node, id, children, ...props }) => <h3 id={id} className="text-xl lg:text-2xl font-semibold text-slate-700 mt-8 mb-4 scroll-mt-20" {...props}>{children}</h3>,
    h4: ({ node, id, children, ...props }) => <h4 id={id} className="text-lg lg:text-xl font-semibold text-slate-700 mt-6 mb-3 scroll-mt-20" {...props}>{children}</h4>,
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
    strong: ({node, children, ...props}) => <strong className="font-semibold text-slate-800" {...props}>{children}</strong>,
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
    table: ({ node, children, ...props }) => <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-300 border border-slate-300 my-6 shadow-sm rounded-md" {...props}>{children}</table></div>,
    thead: ({ node, children, ...props }) => <thead className="bg-slate-100" {...props}>{children}</thead>,
    th: ({ node, style, children, ...props }) => <th style={style} className="px-4 py-3 text-left text-sm font-semibold text-slate-700 border border-slate-200" {...props}>{children}</th>,
    td: ({ node, style, children, ...props }) => <td style={style} className="px-4 py-3 text-sm text-slate-700 border border-slate-200" {...props}>{children}</td>,
    code: ({ node, className, children, ...props }) => {
        const isInline = (props as any).inline;
        delete (props as any).inline;
        return !isInline ? (
          <pre className="text-sm bg-slate-100 p-4 rounded-md overflow-x-auto my-4"><code className="font-mono" {...props}>{children}</code></pre>
        ) : (
          <code className="text-sm bg-slate-200 text-slate-800 px-1 py-0.5 rounded-md font-mono" {...props}>
            {children}
          </code>
        );
    }
};

export function BestPracticesGuide() {
    const [content, setContent] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/PATENT_DRAFTING_BEST_PRACTICES.md')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.text();
            })
            .then(text => {
                setContent(text);
            })
            .catch(e => {
                console.error("Failed to fetch best practices guide:", e);
                setError("Could not load the best practices guide. Please check the console for details.");
            })
            .finally(() => {
                setLoading(false);
            });
    }, []);

    return (
        <details className="bg-white p-6 rounded-lg shadow-lg mt-8 open:shadow-xl open:ring-1 open:ring-blue-200 transition-shadow">
            <summary className="text-xl font-semibold text-slate-700 cursor-pointer hover:text-blue-600 list-none">
                <div className="flex items-center">
                    <div className="transform transition-transform duration-200 details-arrow">
                        <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                        </svg>
                    </div>
                    <span className="ml-2">Patent Drafting Best Practices Guide</span>
                </div>
            </summary>
            <style>{`
                details > summary { -webkit-tap-highlight-color: transparent; }
                details[open] .details-arrow {
                    transform: rotate(90deg);
                }
            `}</style>
            <div className="mt-4 pt-4 border-t border-slate-200">
                {loading && <Spinner message="Loading guide..." />}
                {error && <Alert type="error" message={error} />}
                {content && (
                    <div className="max-w-none prose prose-slate lg:prose-xl">
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkSlug]}
                            components={markdownComponents}
                        >
                            {content}
                        </ReactMarkdown>
                    </div>
                )}
            </div>
        </details>
    );
}