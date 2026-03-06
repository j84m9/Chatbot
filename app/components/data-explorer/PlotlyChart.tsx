'use client';

import dynamic from 'next/dynamic';
import { useMemo, forwardRef, useImperativeHandle, useRef, useCallback, useState, useEffect } from 'react';

const Plot = dynamic(
  () =>
    Promise.all([import('react-plotly.js/factory'), import('plotly.js-dist-min')]).then(
      ([{ default: createPlot }, { default: Plotly }]) => ({ default: createPlot(Plotly) })
    ),
  { ssr: false }
);

export interface ChartAnnotation {
  id: string;
  x: number | string;
  y: number | string;
  text: string;
}

export interface ChartConfig {
  chartType: 'bar' | 'line' | 'scatter' | 'pie' | 'histogram' | 'heatmap' | 'grouped_bar' | 'stacked_bar' | 'area' | 'box' | 'funnel' | 'waterfall' | 'gauge';
  title: string;
  xColumn: string;
  yColumn: string;
  xLabel?: string;
  yLabel?: string;
  colorColumn?: string;
  orientation?: 'v' | 'h';
  aggregation?: 'sum' | 'avg' | 'count' | 'none';
  yAxisType?: 'linear' | 'log';
  fillGradient?: boolean;
  annotations?: ChartAnnotation[];
  showAnnotations?: boolean;
}

export interface PlotlyChartHandle {
  getGraphDiv: () => HTMLElement | null;
}

interface PlotlyChartProps {
  chartConfig: ChartConfig;
  rows: Record<string, any>[];
  darkMode: boolean;
  annotationMode?: boolean;
  onChartClick?: (x: number | string, y: number | string) => void;
  hideTitle?: boolean;
}

const CHART_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
  '#818cf8', '#a78bfa', '#f472b6', '#fb7185', '#fb923c',
  '#facc15', '#4ade80', '#2dd4bf', '#22d3ee', '#60a5fa',
];

const CURRENCY_PATTERNS = /revenue|salary|cost|price|amount|total_sales|income|profit|budget|payment|fee|spend/i;
const DATE_PATTERNS = /date|time|created|updated|timestamp|month|year|day|week|quarter/i;

const PlotlyChart = forwardRef<PlotlyChartHandle, PlotlyChartProps>(function PlotlyChart({ chartConfig, rows, darkMode, annotationMode, onChartClick, hideTitle }, ref) {
  const plotRef = useRef<any>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const onInitialized = useCallback((_figure: any, graphDiv: HTMLElement) => {
    plotRef.current = graphDiv;
  }, []);

  useImperativeHandle(ref, () => ({
    getGraphDiv: () => plotRef.current,
  }));

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
        const xCats = [...new Set(xValues.map(String))];
        const yCats = [...new Set(yValues.map(String))];
        const zMatrix: number[][] = yCats.map(() => xCats.map(() => 0));

        for (const row of rows) {
          const xi = xCats.indexOf(String(row[chartConfig.xColumn]));
          const yi = yCats.indexOf(String(row[chartConfig.yColumn]));
          if (xi >= 0 && yi >= 0) {
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

      case 'area':
        // Area chart — line with fill to zero
        if (!chartConfig.colorColumn) {
          traces.push({
            type: 'scatter',
            mode: 'lines',
            x: xValues,
            y: yValues,
            fill: 'tozeroy',
            fillcolor: 'rgba(99, 102, 241, 0.15)',
            line: { color: colors.primary, width: 2 },
          });
        } else {
          const groups = new Map<string, { x: any[]; y: any[] }>();
          for (const row of rows) {
            const group = String(row[chartConfig.colorColumn] ?? 'Unknown');
            if (!groups.has(group)) groups.set(group, { x: [], y: [] });
            const g = groups.get(group)!;
            g.x.push(row[chartConfig.xColumn]);
            g.y.push(row[chartConfig.yColumn]);
          }
          let idx = 0;
          for (const [name, { x, y }] of groups) {
            const c = CHART_COLORS[idx % CHART_COLORS.length];
            traces.push({
              type: 'scatter',
              mode: 'lines',
              name,
              x,
              y,
              fill: 'tozeroy',
              fillcolor: c + '26',
              line: { color: c, width: 2 },
            });
            idx++;
          }
        }
        break;

      case 'box':
        // Box plot — distribution analysis
        if (chartConfig.colorColumn) {
          const groups = new Map<string, any[]>();
          for (const row of rows) {
            const group = String(row[chartConfig.colorColumn] ?? 'Unknown');
            if (!groups.has(group)) groups.set(group, []);
            groups.get(group)!.push(row[chartConfig.yColumn]);
          }
          let idx = 0;
          for (const [name, values] of groups) {
            traces.push({
              type: 'box',
              name,
              y: values,
              marker: { color: CHART_COLORS[idx % CHART_COLORS.length] },
              boxpoints: 'outliers',
            });
            idx++;
          }
        } else {
          traces.push({
            type: 'box',
            y: yValues,
            name: chartConfig.yLabel || chartConfig.yColumn,
            marker: { color: colors.primary },
            boxpoints: 'outliers',
          });
        }
        break;

      case 'funnel':
        traces.push({
          type: 'funnel',
          y: xValues.map(String),
          x: yValues,
          textinfo: 'value+percent initial',
          marker: {
            color: xValues.map((_: any, i: number) => CHART_COLORS[i % CHART_COLORS.length]),
          },
        });
        break;

      case 'waterfall':
        traces.push({
          type: 'waterfall',
          x: xValues.map(String),
          y: yValues,
          measure: xValues.map((_: any, i: number) =>
            i === 0 ? 'absolute' : i === xValues.length - 1 ? 'total' : 'relative'
          ),
          connector: { line: { color: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' } },
          increasing: { marker: { color: '#22c55e' } },
          decreasing: { marker: { color: '#f43f5e' } },
          totals: { marker: { color: '#6366f1' } },
        });
        break;

      case 'gauge': {
        // Single KPI gauge — use the first numeric value
        const gaugeValue = typeof yValues[0] === 'number' ? yValues[0] : Number(yValues[0]) || 0;
        const allNumeric = yValues.filter((v: any) => typeof v === 'number') as number[];
        const maxVal = allNumeric.length > 0 ? Math.max(...allNumeric) * 1.2 : gaugeValue * 1.5;
        traces.push({
          type: 'indicator',
          mode: 'gauge+number',
          value: gaugeValue,
          title: { text: chartConfig.title, font: { color: colors.text, size: 14 } },
          gauge: {
            axis: { range: [0, maxVal || 100], tickfont: { color: colors.text } },
            bar: { color: '#6366f1' },
            bgcolor: darkMode ? '#1e1f20' : '#f3f4f6',
            borderwidth: 0,
            steps: [
              { range: [0, maxVal * 0.33], color: 'rgba(99, 102, 241, 0.1)' },
              { range: [maxVal * 0.33, maxVal * 0.66], color: 'rgba(99, 102, 241, 0.2)' },
              { range: [maxVal * 0.66, maxVal], color: 'rgba(99, 102, 241, 0.3)' },
            ],
          },
          number: { font: { color: colors.text } },
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

    // Auto-detect axis formatting
    const xCol = chartConfig.xColumn;
    const yCol = chartConfig.yColumn;
    const xTickformat = DATE_PATTERNS.test(xCol) ? '%b %Y' : undefined;
    const yTickprefix = CURRENCY_PATTERNS.test(yCol) ? '$' : undefined;
    const xTickprefix = isHorizontal && CURRENCY_PATTERNS.test(yCol) ? '$' : undefined;

    const plotLayout: any = {
      ...(hideTitle ? {} : { title: { text: chartConfig.title, font: { color: colors.text, size: 14 } } }),
      paper_bgcolor: colors.paper,
      plot_bgcolor: colors.bg,
      font: { color: colors.text },
      margin: { l: 60, r: 30, t: hideTitle ? 20 : 50, b: 60 },
      xaxis: {
        title: isHorizontal
          ? (chartConfig.yLabel || chartConfig.yColumn)
          : (chartConfig.xLabel || chartConfig.xColumn),
        gridcolor: colors.grid,
        tickfont: { color: colors.text },
        type: isHorizontal && chartConfig.yAxisType === 'log' ? 'log' : undefined,
        tickformat: isHorizontal ? undefined : xTickformat,
        tickprefix: xTickprefix,
      },
      yaxis: {
        title: isHorizontal
          ? (chartConfig.xLabel || chartConfig.xColumn)
          : (chartConfig.yLabel || chartConfig.yColumn),
        gridcolor: colors.grid,
        tickfont: { color: colors.text },
        type: !isHorizontal && chartConfig.yAxisType === 'log' ? 'log' : undefined,
        tickprefix: isHorizontal ? undefined : yTickprefix,
      },
      autosize: true,
      transition: { duration: 500 },
    };

    if (barmode) plotLayout.barmode = barmode;

    // Gauge charts don't need axis config
    if (chartConfig.chartType === 'gauge') {
      delete plotLayout.xaxis;
      delete plotLayout.yaxis;
    }

    // Map ChartAnnotation[] to Plotly annotations
    if (chartConfig.annotations && chartConfig.annotations.length > 0 && chartConfig.showAnnotations !== false) {
      plotLayout.annotations = chartConfig.annotations.map(a => ({
        x: a.x,
        y: a.y,
        text: a.text,
        showarrow: true,
        arrowhead: 2,
        arrowsize: 1,
        arrowwidth: 1.5,
        arrowcolor: '#6366f1',
        ax: 0,
        ay: -40,
        bgcolor: darkMode ? '#1e1f20' : '#ffffff',
        bordercolor: darkMode ? '#2a2b2d' : '#e5e7eb',
        borderwidth: 1,
        borderpad: 4,
        font: { color: darkMode ? '#d1d5db' : '#374151', size: 11 },
      }));
    }

    return { data: traces, layout: plotLayout };
  }, [chartConfig, rows, darkMode]);

  const handlePlotClick = useCallback((event: any) => {
    if (!annotationMode || !onChartClick) return;
    const point = event.points?.[0];
    if (point) {
      onChartClick(point.x, point.y);
    }
  }, [annotationMode, onChartClick]);

  if (!mounted) return <div className="w-full h-full min-h-[300px]" />;

  return (
    <div className={`w-full h-full min-h-[300px] ${annotationMode ? 'ring-2 ring-indigo-500 rounded-lg' : ''}`}>
      <Plot
        data={data}
        layout={layout}
        config={{ responsive: true, displayModeBar: true, displaylogo: false }}
        useResizeHandler
        style={{ width: '100%', height: '100%' }}
        onInitialized={onInitialized}
        onUpdate={(_figure: any, graphDiv: HTMLElement) => { plotRef.current = graphDiv; }}
        onClick={handlePlotClick}
      />
    </div>
  );
});

export default PlotlyChart;
