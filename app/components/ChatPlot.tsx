'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';

const Plot = dynamic(
  () =>
    Promise.all([import('react-plotly.js/factory'), import('plotly.js-dist-min')]).then(
      ([{ default: createPlot }, { default: Plotly }]) => ({ default: createPlot(Plotly) })
    ),
  { ssr: false }
);

interface ChatPlotProps {
  jsonString: string;
  darkMode: boolean;
}

interface FunctionDef {
  expr: string;
  label: string;
}

interface ChartSpec {
  chartType: 'line' | 'scatter' | 'bar' | 'pie';
  title: string;
  function?: string;
  functions?: FunctionDef[];
  data?: { x: (string | number)[]; y: number[] } | { x: (string | number)[]; y: number[] }[];
  xMin?: number;
  xMax?: number;
  points?: number;
  xLabel?: string;
  yLabel?: string;
}

const PALETTE = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];

function evaluateExpression(expr: string, x: number): number {
  try {
    const fn = new Function('x', 'Math', `"use strict"; return (${expr});`);
    return fn(x, Math);
  } catch {
    return NaN;
  }
}

function generatePoints(expr: string, xMin: number, xMax: number, count: number) {
  const xs: number[] = [];
  const ys: number[] = [];
  const step = (xMax - xMin) / (count - 1);
  for (let i = 0; i < count; i++) {
    const x = xMin + i * step;
    const y = evaluateExpression(expr, x);
    if (Number.isFinite(y)) {
      xs.push(x);
      ys.push(y);
    }
  }
  return { xs, ys };
}

export default function ChatPlot({ jsonString, darkMode }: ChatPlotProps) {
  const result = useMemo(() => {
    let spec: ChartSpec;
    try {
      spec = JSON.parse(jsonString);
    } catch {
      return null;
    }

    const colors = {
      primary: '#6366f1',
      bg: darkMode ? '#161718' : '#ffffff',
      text: darkMode ? '#d1d5db' : '#374151',
      grid: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
      paper: darkMode ? '#161718' : '#ffffff',
    };

    const traces: any[] = [];
    const chartType = spec.chartType || 'line';

    // Function-based charts
    if (spec.function || spec.functions) {
      const funcs: FunctionDef[] = spec.functions
        || [{ expr: spec.function!, label: spec.title || spec.function! }];
      const xMin = spec.xMin ?? -10;
      const xMax = spec.xMax ?? 10;
      const pts = spec.points ?? 200;

      funcs.forEach((f, i) => {
        const { xs, ys } = generatePoints(f.expr, xMin, xMax, pts);
        traces.push({
          type: 'scatter',
          mode: chartType === 'scatter' ? 'markers' : 'lines',
          x: xs,
          y: ys,
          name: f.label,
          line: { color: PALETTE[i % PALETTE.length], width: 2 },
          marker: { color: PALETTE[i % PALETTE.length], size: chartType === 'scatter' ? 6 : 3 },
        });
      });
    }
    // Data-based charts
    else if (spec.data) {
      const datasets = Array.isArray(spec.data) ? spec.data : [spec.data];

      datasets.forEach((ds, i) => {
        switch (chartType) {
          case 'pie':
            traces.push({
              type: 'pie',
              labels: ds.x,
              values: ds.y,
              marker: { colors: PALETTE },
              textfont: { color: colors.text },
            });
            break;
          case 'scatter':
            traces.push({
              type: 'scatter',
              mode: 'markers',
              x: ds.x,
              y: ds.y,
              marker: { color: PALETTE[i % PALETTE.length], size: 8, opacity: 0.7 },
            });
            break;
          case 'line':
            traces.push({
              type: 'scatter',
              mode: 'lines+markers',
              x: ds.x,
              y: ds.y,
              line: { color: PALETTE[i % PALETTE.length], width: 2 },
              marker: { color: PALETTE[i % PALETTE.length], size: 5 },
            });
            break;
          case 'bar':
          default:
            traces.push({
              type: 'bar',
              x: ds.x,
              y: ds.y,
              marker: { color: PALETTE[i % PALETTE.length], borderRadius: 4 },
            });
            break;
        }
      });
    } else {
      return null;
    }

    const layout: any = {
      title: { text: spec.title, font: { color: colors.text, size: 14 } },
      paper_bgcolor: colors.paper,
      plot_bgcolor: colors.bg,
      font: { color: colors.text },
      margin: { l: 60, r: 30, t: 50, b: 60 },
      xaxis: {
        title: spec.xLabel || '',
        gridcolor: colors.grid,
        tickfont: { color: colors.text },
      },
      yaxis: {
        title: spec.yLabel || '',
        gridcolor: colors.grid,
        tickfont: { color: colors.text },
      },
      autosize: true,
      showlegend: traces.length > 1,
      legend: { font: { color: colors.text } },
    };

    return { data: traces, layout };
  }, [jsonString, darkMode]);

  if (!result) {
    return (
      <pre className="overflow-x-auto rounded-xl p-4 text-sm dark:bg-[#0d0d0e] bg-gray-50 dark:text-gray-300 text-gray-700 border dark:border-white/[0.06] border-gray-200">
        <code>{jsonString}</code>
      </pre>
    );
  }

  return (
    <div className="w-full min-h-[350px] my-2 rounded-xl overflow-hidden border dark:border-white/[0.06] border-gray-200">
      <Plot
        data={result.data}
        layout={result.layout}
        config={{ responsive: true, displayModeBar: true, displaylogo: false }}
        useResizeHandler
        style={{ width: '100%', height: '100%', minHeight: '350px' }}
      />
    </div>
  );
}
