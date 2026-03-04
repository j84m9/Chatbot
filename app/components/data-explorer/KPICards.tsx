'use client';

import { useMemo } from 'react';

interface KPICardsProps {
  results: {
    rows: Record<string, any>[];
    columns: string[];
    types: Record<string, string>;
    rowCount: number;
  };
  darkMode: boolean;
}

interface KPICard {
  label: string;
  value: number;
  formatted: string;
  prefix?: string;
  suffix?: string;
}

const CURRENCY_PATTERNS = /revenue|salary|cost|price|amount|total_sales|income|profit|budget|payment|fee|spend/i;
const PERCENT_PATTERNS = /rate|percent|pct|ratio|margin|growth|change/i;
const PRIORITY_PATTERNS = /total|revenue|count|avg|sales|cost|sum|amount|profit|budget/i;

function formatLargeNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (abs >= 10_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function detectFormat(colName: string): { prefix?: string; suffix?: string } {
  if (CURRENCY_PATTERNS.test(colName)) return { prefix: '$' };
  if (PERCENT_PATTERNS.test(colName)) return { suffix: '%' };
  return {};
}

function humanizeLabel(colName: string): string {
  return colName
    .replace(/[_-]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export default function KPICards({ results, darkMode }: KPICardsProps) {
  const cards = useMemo<KPICard[]>(() => {
    const { rows, columns } = results;
    if (rows.length === 0 || columns.length === 0) return [];

    // Find numeric columns
    const numericCols = columns.filter(col => {
      const sample = rows.find(r => r[col] != null);
      return sample && typeof sample[col] === 'number';
    });

    if (numericCols.length === 0) return [];

    // Single-row result (aggregate query): each numeric column → KPI card
    if (rows.length === 1) {
      return numericCols.slice(0, 5).map(col => {
        const value = rows[0][col] as number;
        const fmt = detectFormat(col);
        return {
          label: humanizeLabel(col),
          value,
          formatted: formatLargeNumber(value),
          ...fmt,
        };
      });
    }

    // Multi-row: prioritize columns matching key names, derive summary stats
    const prioritized = [...numericCols].sort((a, b) => {
      const aMatch = PRIORITY_PATTERNS.test(a) ? 0 : 1;
      const bMatch = PRIORITY_PATTERNS.test(b) ? 0 : 1;
      return aMatch - bMatch;
    });

    const selected = prioritized.slice(0, 2);
    const kpis: KPICard[] = [];

    for (const col of selected) {
      const values = rows.map(r => r[col]).filter((v): v is number => typeof v === 'number');
      if (values.length === 0) continue;

      const fmt = detectFormat(col);
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / values.length;
      const colLabel = humanizeLabel(col);

      // For currency/financial columns, show Total; otherwise show Average
      if (CURRENCY_PATTERNS.test(col)) {
        kpis.push({ label: `Total ${colLabel}`, value: sum, formatted: formatLargeNumber(sum), ...fmt });
        kpis.push({ label: `Avg ${colLabel}`, value: avg, formatted: formatLargeNumber(avg), ...fmt });
      } else {
        kpis.push({ label: `Avg ${colLabel}`, value: avg, formatted: formatLargeNumber(avg), ...fmt });
        kpis.push({ label: `Max ${colLabel}`, value: Math.max(...values), formatted: formatLargeNumber(Math.max(...values)), ...fmt });
      }
    }

    // Add row count as a KPI
    kpis.push({ label: 'Total Records', value: results.rowCount, formatted: formatLargeNumber(results.rowCount) });

    return kpis.slice(0, 5);
  }, [results]);

  if (cards.length === 0) return null;

  const gradients = [
    'from-indigo-500/15 to-purple-500/10',
    'from-violet-500/15 to-pink-500/10',
    'from-cyan-500/15 to-blue-500/10',
    'from-emerald-500/15 to-teal-500/10',
    'from-amber-500/15 to-orange-500/10',
  ];

  const textColors = [
    'text-indigo-400',
    'text-violet-400',
    'text-cyan-400',
    'text-emerald-400',
    'text-amber-400',
  ];

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 mb-4">
      {cards.map((card, i) => (
        <div
          key={card.label}
          className={`flex-shrink-0 min-w-[140px] flex-1 rounded-xl border dark:border-white/[0.08] border-gray-200 bg-gradient-to-br ${gradients[i % gradients.length]} p-4 animate-kpi-enter`}
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <p className="text-xs uppercase tracking-wider dark:text-gray-400 text-gray-500 font-medium mb-1 truncate">
            {card.label}
          </p>
          <p className={`text-2xl font-bold ${darkMode ? textColors[i % textColors.length] : 'text-gray-800'} tabular-nums`}>
            {card.prefix}{card.formatted}{card.suffix}
          </p>
        </div>
      ))}
    </div>
  );
}
