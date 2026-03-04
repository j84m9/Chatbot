'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CodeBlock from './CodeBlock';
import ChatPlot from './ChatPlot';
import './markdown.css';

interface MarkdownRendererProps {
  content: string;
  darkMode?: boolean;
}

/**
 * Detect raw plotly JSON specs in message text (not already in a code fence)
 * and wrap them in ```plotly fences so the code component handler renders them.
 */
function wrapRawPlotlyJson(text: string): string {
  // Don't touch content that's already inside a plotly code fence
  if (/```plotly\s/i.test(text)) return text;

  return text.replace(
    // Match a JSON object on its own (possibly surrounded by whitespace/newlines)
    // that isn't inside a code fence
    /(?:^|\n)([ \t]*\{[\s\S]*?\})([ \t]*(?:\n|$))/g,
    (fullMatch, jsonCandidate: string, trailing: string, offset: number) => {
      const trimmed = jsonCandidate.trim();

      // Quick guard: must look like it has chartType
      if (!trimmed.includes('"chartType"')) return fullMatch;

      // Make sure it's not inside a ``` block by checking preceding text
      const before = text.slice(0, offset);
      const fenceOpens = (before.match(/```/g) || []).length;
      if (fenceOpens % 2 !== 0) return fullMatch; // inside a code fence already

      try {
        const parsed = JSON.parse(trimmed);
        if (
          parsed.chartType &&
          (parsed.function || parsed.functions || parsed.data)
        ) {
          const leadingNewline = offset > 0 ? '\n' : '';
          return `${leadingNewline}\n\`\`\`plotly\n${trimmed}\n\`\`\`\n`;
        }
      } catch {
        // not valid JSON, leave as-is
      }

      return fullMatch;
    }
  );
}

export default function MarkdownRenderer({ content, darkMode }: MarkdownRendererProps) {
  const isDark = darkMode ?? (typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));
  const processed = wrapRawPlotlyJson(content);

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            // react-markdown wraps fenced code blocks in <pre><code>.
            // Extract the <code> element's props and render CodeBlock/ChatPlot directly.
            const child = Array.isArray(children) ? children[0] : children;
            if (child && typeof child === 'object' && 'props' in child) {
              const { className, children: codeChildren } = child.props;
              const match = /language-(\w+)/.exec(className || '');
              const codeString = String(codeChildren).replace(/\n$/, '');

              if (match?.[1] === 'plotly') {
                return <ChatPlot jsonString={codeString} darkMode={isDark} />;
              }
              return <CodeBlock code={codeString} language={match?.[1]} />;
            }
            // Fallback: render as-is
            return <pre>{children}</pre>;
          },
          code({ className, children }) {
            // This only handles inline code (not inside <pre>)
            return (
              <code className="px-1.5 py-0.5 rounded-md dark:bg-white/[0.08] bg-gray-100 dark:text-indigo-300 text-indigo-600 text-[0.9em] font-mono">
                {children}
              </code>
            );
          },
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}
