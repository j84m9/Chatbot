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
  isAnomaly?: boolean;
  severity?: 'warning' | 'critical';
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
  referenceLine?: { value: number; label: string };
  secondaryY?: { column: string; label: string };
  trendline?: boolean;
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

const CURRENCY_PATTERNS = /revenue|salary|cost|price|amount|total_sales|income|profit|budget|payment|fee|spend|avg_|average_|sum_|total_|net_/i;
const PERCENT_PATTERNS = /rate|percent|pct|ratio|margin|growth|change/i;

/** Detect whether a column likely contains date/time values */
function isDateColumn(colName: string, sampleValues: any[]): boolean {
  // Check column name patterns
  if (/^(date|time|created|updated|timestamp|month|year|day|week|quarter|period)/i.test(colName)) return true;
  if (/(date|time|timestamp|_at|_on|month|year|quarter|period)$/i.test(colName)) return true;

  // Check actual values — ISO dates, YYYY-MM, YYYY-MM-DD patterns
  const nonNull = sampleValues.filter(v => v != null).slice(0, 10);
  if (nonNull.length === 0) return false;
  const datePattern = /^\d{4}[-/]\d{2}([-/]\d{2})?/;
  const matchCount = nonNull.filter(v => typeof v === 'string' && datePattern.test(v)).length;
  return matchCount >= nonNull.length * 0.7;
}

/** Parse date values and sort rows by date for time series */
function sortByDate(rows: Record<string, any>[], col: string): Record<string, any>[] {
  return [...rows].sort((a, b) => {
    const da = new Date(a[col]);
    const db = new Date(b[col]);
    return da.getTime() - db.getTime();
  });
}

/** Auto-detect the best tick format for date values */
function detectDateFormat(values: any[]): string {
  const strs = values.filter(v => typeof v === 'string').slice(0, 10);
  if (strs.length === 0) return '';
  // YYYY-MM format (monthly)
  if (strs.every((s: string) => /^\d{4}-\d{2}$/.test(s))) return '%b %Y';
  // YYYY-MM-DD format (daily)
  if (strs.every((s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s))) {
    return values.length > 90 ? '%b %Y' : values.length > 31 ? '%b %d' : '%Y-%m-%d';
  }
  // YYYY format (yearly)
  if (strs.every((s: string) => /^\d{4}$/.test(s))) return '%Y';
  // Quarter format
  if (strs.every((s: string) => /^\d{4}[- ]?Q[1-4]$/i.test(s))) return '';
  return '%b %Y';
}

/** Compute the longest tick label width to set smart margins */
function estimateLabelWidth(values: any[]): number {
  if (values.length === 0) return 0;
  const maxLen = Math.max(...values.slice(0, 50).map(v => String(v ?? '').length));
  return maxLen * 7; // ~7px per character
}

/** Format large numbers with K/M/B suffixes for axis labels */
function formatNumber(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1e9) return (val / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return (val / 1e6).toFixed(1) + 'M';
  if (abs >= 1e4) return (val / 1e3).toFixed(1) + 'K';
  return val.toLocaleString();
}

/** Build a Plotly hovertemplate with smart formatting based on column names */
function buildHoverTemplate(
  xCol: string,
  yCol: string,
  traceName: string | null,
  xIsDate: boolean,
  isHorizontal: boolean
): string {
  const isCurrency = CURRENCY_PATTERNS.test(yCol);
  const isPercent = PERCENT_PATTERNS.test(yCol);

  let valFormat: string;
  if (isCurrency) valFormat = '$%{VAL:,.0f}';
  else if (isPercent) valFormat = '%{VAL:.1f}%';
  else valFormat = '%{VAL:,.2~f}';

  let xFormat: string;
  if (xIsDate) xFormat = '%{X|%b %d, %Y}';
  else xFormat = '%{X}';

  const extra = traceName ? `<extra>${traceName}</extra>` : '<extra></extra>';

  if (isHorizontal) {
    // Horizontal: x=value, y=category
    return `${xFormat.replace('X', 'y')}<br>${valFormat.replace('VAL', 'x')}${extra}`;
  }
  return `${xFormat.replace('X', 'x')}<br>${valFormat.replace('VAL', 'y')}${extra}`;
}

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
    // Detect date column and sort rows if needed
    const xIsDate = isDateColumn(chartConfig.xColumn, rows.map(r => r[chartConfig.xColumn]));
    const sortedRows = xIsDate ? sortByDate(rows, chartConfig.xColumn) : rows;

    const xValues = sortedRows.map(r => r[chartConfig.xColumn]);
    const yValues = sortedRows.map(r => r[chartConfig.yColumn]);

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
    const xCol = chartConfig.xColumn;
    const yCol = chartConfig.yColumn;

    // Helper: group rows by colorColumn and create one trace per group
    function buildGroupedTraces(type: string, mode?: string) {
      if (!chartConfig.colorColumn) {
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
        if (type === 'bar') {
          trace.marker = {
            color: colors.primary,
            line: { color: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', width: 0.5 },
          };
        }
        if (type === 'scatter' && !mode) trace.mode = 'markers';
        trace.hovertemplate = buildHoverTemplate(xCol, yCol, null, xIsDate, chartConfig.orientation === 'h');
        traces.push(trace);
        return;
      }

      const groups = new Map<string, { x: any[]; y: any[] }>();
      for (const row of sortedRows) {
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
        trace.hovertemplate = buildHoverTemplate(xCol, yCol, name, xIsDate, chartConfig.orientation === 'h');
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
          textinfo: 'percent+label',
          hovertemplate: CURRENCY_PATTERNS.test(yCol)
            ? '%{label}<br>$%{value:,.0f} (%{percent})<extra></extra>'
            : '%{label}<br>%{value:,.2~f} (%{percent})<extra></extra>',
          hole: 0.35,
          pull: xValues.map((_: any, i: number) => i === 0 ? 0.03 : 0),
        });
        break;

      case 'histogram':
        traces.push({
          type: 'histogram',
          x: xValues,
          marker: { color: colors.primary, line: { color: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', width: 0.5 } },
          nbinsx: Math.min(50, Math.max(10, Math.ceil(Math.sqrt(xValues.length)))),
          hovertemplate: '%{x}<br>Count: %{y}<extra></extra>',
        });
        break;

      case 'heatmap': {
        const xCats = [...new Set(xValues.map(String))];
        const yCats = [...new Set(yValues.map(String))];
        const zMatrix: number[][] = yCats.map(() => xCats.map(() => 0));

        for (const row of sortedRows) {
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
          hoverongaps: false,
          hovertemplate: '%{x}<br>%{y}<br>Value: %{z:,.2~f}<extra></extra>',
        });
        break;
      }

      case 'area':
        if (!chartConfig.colorColumn) {
          traces.push({
            type: 'scatter',
            mode: 'lines',
            x: xValues,
            y: yValues,
            fill: 'tozeroy',
            fillcolor: 'rgba(99, 102, 241, 0.12)',
            line: { color: colors.primary, width: 2, shape: 'spline' },
            hovertemplate: buildHoverTemplate(xCol, yCol, null, xIsDate, false),
          });
        } else {
          const groups = new Map<string, { x: any[]; y: any[] }>();
          for (const row of sortedRows) {
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
              fillcolor: c + '1A',
              line: { color: c, width: 2, shape: 'spline' },
              hovertemplate: buildHoverTemplate(xCol, yCol, name, xIsDate, false),
            });
            idx++;
          }
        }
        break;

      case 'box':
        if (chartConfig.colorColumn) {
          const groups = new Map<string, any[]>();
          for (const row of sortedRows) {
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
              boxmean: 'sd',
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
            boxmean: 'sd',
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
          connector: { line: { color: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', width: 1 } },
          hovertemplate: CURRENCY_PATTERNS.test(yCol)
            ? '%{y}<br>$%{x:,.0f}<extra></extra>'
            : '%{y}<br>%{x:,.2~f}<extra></extra>',
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
          textposition: 'outside',
          hovertemplate: CURRENCY_PATTERNS.test(yCol)
            ? '%{x}<br>$%{y:,.0f}<extra></extra>'
            : '%{x}<br>%{y:,.2~f}<extra></extra>',
        });
        break;

      case 'gauge': {
        const gaugeValue = typeof yValues[0] === 'number' ? yValues[0] : Number(yValues[0]) || 0;
        const allNumeric = yValues.filter((v: any) => typeof v === 'number') as number[];
        const maxVal = allNumeric.length > 0 ? Math.max(...allNumeric) * 1.2 : gaugeValue * 1.5;
        traces.push({
          type: 'indicator',
          mode: 'gauge+number+delta',
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
          number: { font: { color: colors.text }, valueformat: ',.0f' },
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

    // Apply marker/line defaults
    for (const trace of traces) {
      if (trace.type === 'scatter' && trace.mode === 'markers' && !trace.marker?.size) {
        trace.marker = { ...trace.marker, size: 8, opacity: 0.7 };
      }
      if (trace.type === 'scatter' && trace.mode === 'lines+markers') {
        if (!trace.line) trace.line = {};
        trace.line.width = trace.line.width || 2.5;
        trace.line.shape = trace.line.shape || (xIsDate ? 'spline' : 'linear');
        if (!trace.marker?.size) trace.marker = { ...trace.marker, size: 4 };
      }
    }

    // Trendline
    if (chartConfig.trendline && ['line', 'scatter', 'bar', 'area'].includes(chartConfig.chartType)) {
      const numericY = yValues.map((v: any) => (typeof v === 'number' ? v : Number(v))).filter((v: number) => !isNaN(v));
      if (numericY.length >= 2) {
        const n = numericY.length;
        const xIdx = numericY.map((_: number, i: number) => i);
        const sumX = xIdx.reduce((a: number, b: number) => a + b, 0);
        const sumY = numericY.reduce((a: number, b: number) => a + b, 0);
        const sumXY = xIdx.reduce((a: number, i: number) => a + i * numericY[i], 0);
        const sumX2 = xIdx.reduce((a: number, i: number) => a + i * i, 0);
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        const trendY = xIdx.map((i: number) => slope * i + intercept);
        traces.push({
          type: 'scatter',
          mode: 'lines',
          x: xValues.slice(0, numericY.length),
          y: trendY,
          name: 'Trend',
          line: { color: '#f97316', dash: 'dash', width: 2 },
          showlegend: true,
          hoverinfo: 'skip',
        });
      }
    }

    // Secondary Y-axis
    if (chartConfig.secondaryY?.column && sortedRows.length > 0 && sortedRows[0][chartConfig.secondaryY.column] !== undefined) {
      const secondaryValues = sortedRows.map(r => r[chartConfig.secondaryY!.column]);
      traces.push({
        type: 'scatter',
        mode: 'lines+markers',
        x: xValues,
        y: secondaryValues,
        name: chartConfig.secondaryY.label || chartConfig.secondaryY.column,
        yaxis: 'y2',
        line: { color: '#f97316', width: 2 },
        marker: { color: '#f97316', size: 4 },
      });
    }

    const isHorizontal = chartConfig.orientation === 'h';

    // Smart axis formatting
    const isCurrency = CURRENCY_PATTERNS.test(yCol);

    // Date formatting — detect from actual values, not just column name
    const xTickformat = xIsDate ? detectDateFormat(xValues) : undefined;

    // Smart number formatting for y-axis
    const numericYVals = yValues.filter((v: any) => typeof v === 'number') as number[];
    const maxYVal = numericYVals.length > 0 ? Math.max(...numericYVals) : 0;
    const yTickformat = isCurrency
      ? (maxYVal >= 1e6 ? '$,.2s' : maxYVal >= 1e3 ? '$,.0f' : '$,.2f')
      : (maxYVal >= 1e6 ? ',.2s' : undefined);

    // Smart margins based on content
    const xLabelWidth = isHorizontal ? 0 : estimateLabelWidth(xValues);
    const yLabelWidth = estimateLabelWidth(yValues);
    const needsXRotation = !isHorizontal && !xIsDate && xValues.length > 5 && xLabelWidth > 60;
    const leftMargin = Math.max(60, Math.min(150, yLabelWidth + 20));
    const bottomMargin = needsXRotation ? Math.max(80, Math.min(180, xLabelWidth * 0.7)) : 60;
    const rightMargin = chartConfig.secondaryY?.column ? 70 : 30;

    const plotLayout: any = {
      ...(hideTitle ? {} : { title: { text: chartConfig.title, font: { color: colors.text, size: 14, family: 'Inter, system-ui, sans-serif' }, x: 0.01, xanchor: 'left' } }),
      paper_bgcolor: colors.paper,
      plot_bgcolor: colors.bg,
      font: { color: colors.text, family: 'Inter, system-ui, sans-serif', size: 12 },
      margin: { l: leftMargin, r: rightMargin, t: hideTitle ? 10 : 45, b: bottomMargin, pad: 4 },
      xaxis: {
        title: { text: isHorizontal ? (chartConfig.yLabel || chartConfig.yColumn) : (chartConfig.xLabel || chartConfig.xColumn), standoff: 10 },
        gridcolor: colors.grid,
        tickfont: { color: colors.text, size: 11 },
        type: isHorizontal && chartConfig.yAxisType === 'log' ? 'log' : (xIsDate ? 'date' : undefined),
        tickformat: isHorizontal ? undefined : xTickformat,
        tickprefix: isHorizontal && isCurrency ? '$' : undefined,
        tickangle: needsXRotation ? -45 : undefined,
        automargin: true,
        zeroline: false,
        showgrid: chartConfig.chartType !== 'bar',
        dtick: xIsDate && xValues.length <= 12 ? 'M1' : undefined,
      },
      yaxis: {
        title: { text: isHorizontal ? (chartConfig.xLabel || chartConfig.xColumn) : (chartConfig.yLabel || chartConfig.yColumn), standoff: 10 },
        gridcolor: colors.grid,
        tickfont: { color: colors.text, size: 11 },
        type: !isHorizontal && chartConfig.yAxisType === 'log' ? 'log' : undefined,
        tickformat: isHorizontal ? undefined : yTickformat,
        tickprefix: !isHorizontal && isCurrency && !yTickformat?.startsWith('$') ? '$' : undefined,
        automargin: true,
        zeroline: false,
        rangemode: 'tozero',
      },
      autosize: true,
      transition: { duration: 300 },
      hoverlabel: {
        bgcolor: darkMode ? '#1e1f20' : '#ffffff',
        bordercolor: darkMode ? '#3a3b3d' : '#e5e7eb',
        font: { color: colors.text, size: 12 },
        namelength: -1,
      },
      hovermode: xIsDate || chartConfig.chartType === 'line' || chartConfig.chartType === 'area' ? 'x unified' : 'closest',
      showlegend: traces.length > 1,
      legend: {
        font: { size: 11 },
        bgcolor: darkMode ? 'rgba(22,23,24,0.85)' : 'rgba(255,255,255,0.85)',
        orientation: traces.length > 4 ? 'v' : 'h',
        x: traces.length > 4 ? 0.98 : 0.5,
        xanchor: traces.length > 4 ? 'right' : 'center',
        y: traces.length > 4 ? 1 : -0.05,
        yanchor: traces.length > 4 ? 'top' : 'top',
      },
    };

    if (barmode) plotLayout.barmode = barmode;

    // Adjust bar gap for readability
    if (['bar', 'grouped_bar', 'stacked_bar'].includes(chartConfig.chartType)) {
      plotLayout.bargap = xValues.length > 20 ? 0.1 : 0.2;
      plotLayout.bargroupgap = 0.1;
    }

    // Truncate long category labels for bar-type charts
    if (['bar', 'grouped_bar', 'stacked_bar'].includes(chartConfig.chartType) && !xIsDate) {
      const maxLabelLen = 30;
      const categoryAxis = isHorizontal ? 'yaxis' : 'xaxis';
      const catValues = isHorizontal ? xValues : xValues;
      const hasLongLabels = catValues.some((v: any) => String(v ?? '').length > maxLabelLen);
      if (hasLongLabels && plotLayout[categoryAxis]) {
        const tickvals = catValues.map(String);
        const ticktext = tickvals.map((v: string) => v.length > maxLabelLen ? v.slice(0, maxLabelLen - 1) + '…' : v);
        plotLayout[categoryAxis].tickmode = 'array';
        plotLayout[categoryAxis].tickvals = tickvals;
        plotLayout[categoryAxis].ticktext = ticktext;
      }
    }

    // Gauge charts don't need axis config
    if (chartConfig.chartType === 'gauge') {
      delete plotLayout.xaxis;
      delete plotLayout.yaxis;
      plotLayout.margin = { l: 30, r: 30, t: 10, b: 10 };
    }

    // Pie charts — clean layout
    if (chartConfig.chartType === 'pie') {
      delete plotLayout.xaxis;
      delete plotLayout.yaxis;
      plotLayout.margin = { l: 20, r: 20, t: hideTitle ? 10 : 40, b: 20 };
      plotLayout.showlegend = xValues.length <= 10;
    }

    // User annotations
    if (chartConfig.annotations && chartConfig.annotations.length > 0 && chartConfig.showAnnotations !== false) {
      plotLayout.annotations = chartConfig.annotations.map(a => {
        const isAnomaly = (a as any).isAnomaly;
        const severity = (a as any).severity;
        return {
          x: a.x,
          y: a.y,
          text: a.text,
          showarrow: true,
          arrowhead: 2,
          arrowsize: 1,
          arrowwidth: isAnomaly ? 2 : 1.5,
          arrowcolor: isAnomaly ? '#ef4444' : '#6366f1',
          ax: 0,
          ay: -40,
          bgcolor: isAnomaly ? (darkMode ? '#2a1215' : '#fef2f2') : (darkMode ? '#1e1f20' : '#ffffff'),
          bordercolor: isAnomaly ? '#ef4444' : (darkMode ? '#2a2b2d' : '#e5e7eb'),
          borderwidth: isAnomaly && severity === 'critical' ? 2 : 1,
          borderpad: 4,
          font: { color: isAnomaly ? '#ef4444' : (darkMode ? '#d1d5db' : '#374151'), size: 11 },
        };
      });
    }

    // Reference line
    if (chartConfig.referenceLine) {
      plotLayout.shapes = [
        ...(plotLayout.shapes || []),
        {
          type: 'line',
          x0: 0,
          x1: 1,
          xref: 'paper',
          y0: chartConfig.referenceLine.value,
          y1: chartConfig.referenceLine.value,
          line: { color: '#f97316', width: 2, dash: 'dash' },
        },
      ];
      plotLayout.annotations = [
        ...(plotLayout.annotations || []),
        {
          x: 1,
          xref: 'paper',
          y: chartConfig.referenceLine.value,
          text: chartConfig.referenceLine.label,
          showarrow: false,
          xanchor: 'left',
          font: { color: '#f97316', size: 11 },
        },
      ];
    }

    // Secondary Y-axis layout
    if (chartConfig.secondaryY?.column) {
      plotLayout.yaxis2 = {
        title: { text: chartConfig.secondaryY.label || chartConfig.secondaryY.column, standoff: 10 },
        overlaying: 'y',
        side: 'right',
        titlefont: { color: '#f97316' },
        tickfont: { color: '#f97316', size: 11 },
        gridcolor: 'rgba(0,0,0,0)',
        zeroline: false,
        automargin: true,
      };
    }

    return { data: traces, layout: plotLayout };
  }, [chartConfig, rows, darkMode, hideTitle]);

  const handlePlotClick = useCallback((event: any) => {
    if (!onChartClick) return;
    const point = event.points?.[0];
    if (point) {
      // For pie charts, use label instead of x
      const x = point.label !== undefined ? point.label : point.x;
      const y = point.y !== undefined ? point.y : point.value;
      onChartClick(x, y);
    }
  }, [onChartClick]);

  if (!mounted) return <div className="w-full h-full min-h-[300px]" />;

  return (
    <div className={`w-full h-full min-h-[300px] ${annotationMode ? 'ring-2 ring-indigo-500 rounded-lg' : ''}`}>
      <Plot
        data={data}
        layout={layout}
        config={{
          responsive: true,
          displayModeBar: true,
          displaylogo: false,
          modeBarButtonsToRemove: ['lasso2d', 'select2d'],
        }}
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
