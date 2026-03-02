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

export interface ChartConfig {
  chartType: 'bar' | 'line' | 'scatter' | 'pie' | 'histogram' | 'heatmap' | 'grouped_bar' | 'stacked_bar';
  title: string;
  xColumn: string;
  yColumn: string;
  xLabel?: string;
  yLabel?: string;
  colorColumn?: string;
  orientation?: 'v' | 'h';
  aggregation?: 'sum' | 'avg' | 'count' | 'none';
  yAxisType?: 'linear' | 'log';
}

interface PlotlyChartProps {
  chartConfig: ChartConfig;
  rows: Record<string, any>[];
  darkMode: boolean;
}

const CHART_COLORS = [
  '#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#818cf8',
  '#7c3aed', '#5b21b6', '#4f46e5', '#4338ca', '#3730a3',
];

export default function PlotlyChart({ chartConfig, rows, darkMode }: PlotlyChartProps) {
  const { data, layout } = useMemo(() => {
    const xValues = rows.map(r => r[chartConfig.xColumn]);
    const yValues = rows.map(r => r[chartConfig.yColumn]);

    const colors = {
      primary: '#6366f1',
      secondary: '#8b5cf6',
      bg: darkMode ? '#161718' : '#ffffff',
      text: darkMode ? '#d1d5db' : '#374151',
      grid: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
      paper: darkMode ? '#161718' : '#ffffff',
    };

    const traces: any[] = [];
    let barmode: string | undefined;

    // Helper: group rows by colorColumn and create one trace per group
    function buildGroupedTraces(type: string, mode?: string) {
      if (!chartConfig.colorColumn) {
        // No grouping — single trace
        const trace: any = { type: type === 'grouped_bar' || type === 'stacked_bar' ? 'bar' : type };
        if (mode) trace.mode = mode;
        if (chartConfig.orientation === 'h') {
          trace.x = yValues;
          trace.y = xValues;
          trace.orientation = 'h';
        } else {
          trace.x = xValues;
          trace.y = yValues;
        }
        trace.marker = { color: colors.primary };
        if (type === 'scatter' && !mode) trace.mode = 'markers';
        traces.push(trace);
        return;
      }

      const groups = new Map<string, { x: any[]; y: any[] }>();
      for (const row of rows) {
        const group = String(row[chartConfig.colorColumn] ?? 'Unknown');
        if (!groups.has(group)) groups.set(group, { x: [], y: [] });
        const g = groups.get(group)!;
        if (chartConfig.orientation === 'h') {
          g.x.push(row[chartConfig.yColumn]);
          g.y.push(row[chartConfig.xColumn]);
        } else {
          g.x.push(row[chartConfig.xColumn]);
          g.y.push(row[chartConfig.yColumn]);
        }
      }

      let idx = 0;
      for (const [name, { x, y }] of groups) {
        const trace: any = {
          type: type === 'grouped_bar' || type === 'stacked_bar' ? 'bar' : type,
          name,
          x,
          y,
          marker: { color: CHART_COLORS[idx % CHART_COLORS.length] },
        };
        if (chartConfig.orientation === 'h') trace.orientation = 'h';
        if (mode) trace.mode = mode;
        traces.push(trace);
        idx++;
      }
    }

    switch (chartConfig.chartType) {
      case 'pie':
        traces.push({
          type: 'pie',
          labels: xValues,
          values: yValues,
          marker: { colors: CHART_COLORS },
          textfont: { color: colors.text },
        });
        break;

      case 'histogram':
        traces.push({
          type: 'histogram',
          x: xValues,
          marker: { color: colors.primary },
        });
        break;

      case 'heatmap': {
        // Build z-matrix from two categorical columns + a numeric column
        const xCats = [...new Set(xValues.map(String))];
        const yCats = [...new Set(yValues.map(String))];
        const zMatrix: number[][] = yCats.map(() => xCats.map(() => 0));

        for (const row of rows) {
          const xi = xCats.indexOf(String(row[chartConfig.xColumn]));
          const yi = yCats.indexOf(String(row[chartConfig.yColumn]));
          if (xi >= 0 && yi >= 0) {
            // Use colorColumn as the value if available, otherwise count
            zMatrix[yi][xi] = chartConfig.colorColumn
              ? Number(row[chartConfig.colorColumn]) || 0
              : zMatrix[yi][xi] + 1;
          }
        }

        traces.push({
          type: 'heatmap',
          x: xCats,
          y: yCats,
          z: zMatrix,
          colorscale: [[0, '#312e81'], [0.5, '#6366f1'], [1, '#c4b5fd']],
        });
        break;
      }

      case 'grouped_bar':
        buildGroupedTraces('grouped_bar');
        barmode = 'group';
        break;

      case 'stacked_bar':
        buildGroupedTraces('stacked_bar');
        barmode = 'stack';
        break;

      case 'scatter':
        buildGroupedTraces('scatter', 'markers');
        break;

      case 'line':
        buildGroupedTraces('scatter', 'lines+markers');
        break;

      case 'bar':
      default:
        buildGroupedTraces('bar');
        break;
    }

    // Apply marker defaults for simple single traces
    for (const trace of traces) {
      if (trace.type === 'scatter' && trace.mode === 'markers' && !trace.marker?.size) {
        trace.marker = { ...trace.marker, size: 8, opacity: 0.7 };
      }
      if (trace.type === 'scatter' && trace.mode === 'lines+markers') {
        if (!trace.line) trace.line = { width: 2 };
        if (!trace.marker?.size) trace.marker = { ...trace.marker, size: 5 };
      }
    }

    const isHorizontal = chartConfig.orientation === 'h';
    const plotLayout: any = {
      title: {
        text: chartConfig.title,
        font: { color: colors.text, size: 14 },
      },
      paper_bgcolor: colors.paper,
      plot_bgcolor: colors.bg,
      font: { color: colors.text },
      margin: { l: 60, r: 30, t: 50, b: 60 },
      xaxis: {
        title: isHorizontal
          ? (chartConfig.yLabel || chartConfig.yColumn)
          : (chartConfig.xLabel || chartConfig.xColumn),
        gridcolor: colors.grid,
        tickfont: { color: colors.text },
        type: isHorizontal && chartConfig.yAxisType === 'log' ? 'log' : undefined,
      },
      yaxis: {
        title: isHorizontal
          ? (chartConfig.xLabel || chartConfig.xColumn)
          : (chartConfig.yLabel || chartConfig.yColumn),
        gridcolor: colors.grid,
        tickfont: { color: colors.text },
        type: !isHorizontal && chartConfig.yAxisType === 'log' ? 'log' : undefined,
      },
      autosize: true,
    };

    if (barmode) plotLayout.barmode = barmode;

    return { data: traces, layout: plotLayout };
  }, [chartConfig, rows, darkMode]);

  return (
    <div className="w-full h-full min-h-[300px]">
      <Plot
        data={data}
        layout={layout}
        config={{ responsive: true, displayModeBar: true, displaylogo: false }}
        useResizeHandler
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
