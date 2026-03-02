'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CodeBlock from './CodeBlock';
import './markdown.css';

interface MarkdownRendererProps {
  content: string;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            // Transparent pass-through — CodeBlock handles its own wrapper
            return <>{children}</>;
          },
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const codeString = String(children).replace(/\n$/, '');

            // Fenced code block (has language class or is inside <pre>)
            if (match || (props as any).node?.position) {
              // Only render as CodeBlock for multi-line or language-tagged blocks
              if (match || codeString.includes('\n')) {
                return <CodeBlock code={codeString} language={match?.[1]} />;
              }
            }

            // Inline code
            return (
              <code className="px-1.5 py-0.5 rounded-md dark:bg-white/[0.08] bg-gray-100 dark:text-indigo-300 text-indigo-600 text-[0.9em] font-mono">
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
