import React from 'react';

interface MarkdownViewProps {
  content: string;
  className?: string;
}

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold text-slate-900 dark:text-slate-100">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[0.85em] text-indigo-700 dark:text-indigo-300"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <em key={idx} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({ content, className = '' }) => {
  const lines = (content || '').split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];

  const flushList = (keyPrefix: string) => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`${keyPrefix}-ul`} className="list-disc pl-5 space-y-1.5 my-2 text-slate-700 dark:text-slate-300">
          {listItems.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
      listItems = [];
    }
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trimEnd();
    if (line.startsWith('```')) {
      flushList(`pre-${index}`);
      if (inCodeBlock) {
        elements.push(
          <pre
            key={`code-${index}`}
            className="my-3 p-3.5 rounded-lg bg-slate-900 dark:bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto border border-slate-800"
          >
            <code>{codeLines.join('\n')}</code>
          </pre>
        );
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeLines.push(rawLine);
      return;
    }

    if (line.startsWith('### ')) {
      flushList(`h3-${index}`);
      elements.push(
        <h4 key={`h3-${index}`} className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-4 mb-1.5">
          {renderInline(line.slice(4))}
        </h4>
      );
    } else if (line.startsWith('## ')) {
      flushList(`h2-${index}`);
      elements.push(
        <h3 key={`h2-${index}`} className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-5 mb-2">
          {renderInline(line.slice(3))}
        </h3>
      );
    } else if (line.startsWith('# ')) {
      flushList(`h1-${index}`);
      elements.push(
        <h2 key={`h1-${index}`} className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-5 mb-2">
          {renderInline(line.slice(2))}
        </h2>
      );
    } else if (/^[-*]\s+/.test(line)) {
      listItems.push(line.replace(/^[-*]\s+/, ''));
    } else if (/^\d+\.\s+/.test(line)) {
      listItems.push(line.replace(/^\d+\.\s+/, ''));
    } else if (line.trim() === '') {
      flushList(`empty-${index}`);
    } else {
      flushList(`p-${index}`);
      elements.push(
        <p key={`p-${index}`} className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 my-1.5">
          {renderInline(line)}
        </p>
      );
    }
  });

  flushList('end');

  return <div className={`space-y-1 ${className}`}>{elements}</div>;
};
