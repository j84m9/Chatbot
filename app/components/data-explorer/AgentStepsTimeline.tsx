'use client';

import { useState } from 'react';

export interface AgentStepEvent {
  stepNumber: number;
  type: 'tool_call' | 'tool_result' | 'reasoning' | 'error_recovery';
  toolName?: string;
  toolInput?: any;
  toolResult?: any;
  text?: string;
}

interface AgentStepsTimelineProps {
  steps: AgentStepEvent[];
  isLoading?: boolean;
}

export default function AgentStepsTimeline({ steps, isLoading }: AgentStepsTimelineProps) {
  const [expanded, setExpanded] = useState(false);

  if (steps.length === 0 && !isLoading) return null;

  const stepCount = new Set(steps.map(s => s.stepNumber)).size;

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs dark:text-amber-400/80 text-amber-600 dark:hover:text-amber-300 hover:text-amber-700 transition-colors cursor-pointer"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
        <span className="font-medium">
          Agent used {stepCount} step{stepCount !== 1 ? 's' : ''}
        </span>
        {isLoading && (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        )}
      </button>

      {expanded && (
        <div className="mt-2 ml-2 border-l-2 dark:border-amber-500/20 border-amber-300/40 pl-4 space-y-2">
          {steps.map((step, i) => (
            <StepNode key={i} step={step} isLast={i === steps.length - 1 && !!isLoading} />
          ))}
        </div>
      )}
    </div>
  );
}

function StepNode({ step, isLast }: { step: AgentStepEvent; isLast: boolean }) {
  switch (step.type) {
    case 'tool_call':
      return (
        <div className="flex items-start gap-2 text-xs">
          <span className="mt-0.5 w-4 h-4 rounded-full dark:bg-indigo-500/20 bg-indigo-100 flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-2.5 h-2.5 dark:text-indigo-400 text-indigo-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="m5.25 4.5 7.5 7.5-7.5 7.5m6-15 7.5 7.5-7.5 7.5" />
            </svg>
          </span>
          <div className="min-w-0">
            <span className="font-medium dark:text-gray-300 text-gray-700">{step.toolName}</span>
            {step.toolInput && (
              <p className="dark:text-gray-500 text-gray-400 truncate max-w-[300px] mt-0.5">
                {typeof step.toolInput === 'string' ? step.toolInput : truncateInput(step.toolInput)}
              </p>
            )}
            {isLast && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse ml-1" />}
          </div>
        </div>
      );

    case 'tool_result': {
      const isSuccess = step.toolResult?.success !== false;
      return (
        <div className="flex items-start gap-2 text-xs">
          <span className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${isSuccess ? 'dark:bg-emerald-500/20 bg-emerald-100' : 'dark:bg-red-500/20 bg-red-100'}`}>
            {isSuccess ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-2.5 h-2.5 dark:text-emerald-400 text-emerald-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-2.5 h-2.5 dark:text-red-400 text-red-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            )}
          </span>
          <span className={isSuccess ? 'dark:text-emerald-400/80 text-emerald-600' : 'dark:text-red-400/80 text-red-600'}>
            {isSuccess
              ? `${step.toolResult?.rowCount ?? 0} rows returned`
              : (step.toolResult?.error || 'Query failed')
            }
          </span>
        </div>
      );
    }

    case 'reasoning':
      return (
        <div className="flex items-start gap-2 text-xs">
          <span className="mt-0.5 w-4 h-4 rounded-full dark:bg-gray-500/20 bg-gray-100 flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-2.5 h-2.5 dark:text-gray-400 text-gray-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </span>
          <p className="dark:text-gray-500 text-gray-400 leading-relaxed">{step.text}</p>
        </div>
      );

    case 'error_recovery':
      return (
        <div className="flex items-start gap-2 text-xs">
          <span className="mt-0.5 w-4 h-4 rounded-full dark:bg-amber-500/20 bg-amber-100 flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-2.5 h-2.5 dark:text-amber-400 text-amber-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
          </span>
          <p className="dark:text-amber-400/80 text-amber-600">{step.text}</p>
        </div>
      );

    default:
      return null;
  }
}

function truncateInput(input: any): string {
  if (input.sql) {
    const sql = String(input.sql);
    return sql.length > 80 ? sql.slice(0, 80) + '...' : sql;
  }
  const str = JSON.stringify(input);
  return str.length > 80 ? str.slice(0, 80) + '...' : str;
}
