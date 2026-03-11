'use client';

import dynamic from 'next/dynamic';
import { useMemo, forwardRef, useImperativeHandle, useRef, useCallback, useState, useEffect } from 'react';
import { getChartTheme, hexToRgba, buildAreaGradient, formatDataLabel, shouldShowDataLabels } from '@/utils/chart-theme';
import type { ChartTheme } from '@/utils/chart-theme';

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

export interface DrillLevel {
  column: string;
  label: string;
}

export interface DrillHierarchy {
  levels: DrillLevel[];
  currentLevel: number;
  filterStack: { column: string; value: string }[];
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
  drillHierarchy?: DrillHierarchy;
  categoryOrder?: 'value' | 'date' | 'alpha' | 'none';
  forecastPeriods?: number;
  movingAverage?: number;
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

const CURRENCY_PATTERNS = /revenue|salary|cost|price|amount|total_sales|income|profit|budget|payment|fee|spend|avg_|average_|sum_|total_|net_/i;
const PERCENT_PATTERNS = /rate|percent|pct|ratio|margin|growth|change/i;

/** Detect whether a column likely contains date/time values */
function isDateColumn(colName: string, sampleValues: any[]): boolean {
  if (/^(date|time|created|updated|timestamp|month|year|day|week|quarter|period)/i.test(colName)) return true;
  if (/(date|time|timestamp|_at|_on|month|year|quarter|period)$/i.test(colName)) return true;
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
  if (strs.every((s: string) => /^\d{4}-\d{2}$/.test(s))) return '%b %Y';
  if (strs.every((s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s))) {
    return values.length > 90 ? '%b %Y' : values.length > 31 ? '%b %d' : '%Y-%m-%d';
  }
  if (strs.every((s: string) => /^\d{4}$/.test(s))) return '%Y';
  if (strs.every((s: string) => /^\d{4}[- ]?Q[1-4]$/i.test(s))) return '';
  return '%b %Y';
}

/** Compute the longest tick label width to set smart margins */
function estimateLabelWidth(values: any[]): number {
  if (values.length === 0) return 0;
  const maxLen = Math.max(...values.slice(0, 50).map(v => String(v ?? '').length));
  return maxLen * 7;
}

/** Check if a column name is clean enough to use as-is (no underscores/SQL expressions) */
function isCleanLabel(label: string): boolean {
  if (!label) return false;
  if (label.includes('_')) return false;
  if (/^(SUM|COUNT|AVG|MIN|MAX|COALESCE|CASE)\s*\(/i.test(label)) return false;
  return true;
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
    return `${xFormat.replace('X', 'y')}<br>${valFormat.replace('VAL', 'x')}${extra}`;
  }
  return `${xFormat.replace('X', 'x')}<br>${valFormat.replace('VAL', 'y')}${extra}`;
}

/** Sort bar chart data by value for better readability */
function sortByValue(
  xValues: any[],
  yValues: any[],
  orientation: string | undefined,
  descending = true
): { x: any[]; y: any[] } {
  const pairs = xValues.map((x, i) => ({ x, y: yValues[i] }));
  const valKey = orientation === 'h' ? 'x' : 'y';
  pairs.sort((a, b) => {
    const va = typeof a[valKey] === 'number' ? a[valKey] : 0;
    const vb = typeof b[valKey] === 'number' ? b[valKey] : 0;
    return descending ? vb - va : va - vb;
  });
  return { x: pairs.map(p => p.x), y: pairs.map(p => p.y) };
}

/** Apply data labels to traces when appropriate */
function applyDataLabels(trace: any, chartType: string, yCol: string, rowCount: number) {
  if (!shouldShowDataLabels(chartType, rowCount)) return;

  if (chartType === 'pie') return; // pie uses textinfo instead

  const values = trace.orientation === 'h' ? trace.x : trace.y;
  if (!values || values.length === 0) return;

  trace.text = values.map((v: any) => {
    if (typeof v !== 'number') return '';
    return formatDataLabel(v, yCol);
  });

  if (['bar', 'grouped_bar', 'stacked_bar'].includes(chartType)) {
    trace.textposition = 'outside';
    trace.textfont = { size: 10 };
    trace.cliponaxis = false;
  } else if (['line', 'area'].includes(chartType)) {
    trace.textposition = 'top center';
    trace.textfont = { size: 9 };
    trace.mode = (trace.mode || '') + '+text';
  } else if (chartType === 'waterfall') {
    trace.textposition = 'outside';
    trace.textfont = { size: 10 };
  }
}

/** Detect time series gaps and insert nulls */
function fillTimeSeriesGaps(xValues: any[], yValues: any[]): { x: any[]; y: any[] } {
  if (xValues.length < 3) return { x: xValues, y: yValues };

  // Only work with date-like strings
  const dates = xValues.map(v => new Date(v));
  if (dates.some(d => isNaN(d.getTime()))) return { x: xValues, y: yValues };

  // Detect interval (most common gap)
  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    gaps.push(dates[i].getTime() - dates[i - 1].getTime());
  }
  gaps.sort((a, b) => a - b);
  const medianGap = gaps[Math.floor(gaps.length / 2)];
  if (medianGap <= 0) return { x: xValues, y: yValues };

  const newX: any[] = [];
  const newY: any[] = [];

  for (let i = 0; i < xValues.length; i++) {
    newX.push(xValues[i]);
    newY.push(yValues[i]);

    if (i < xValues.length - 1) {
      const gap = dates[i + 1].getTime() - dates[i].getTime();
      // If gap is more than 1.5x the median, insert null points
      if (gap > medianGap * 1.5) {
        const steps = Math.round(gap / medianGap) - 1;
        for (let j = 1; j <= Math.min(steps, 10); j++) {
          const fakeDate = new Date(dates[i].getTime() + medianGap * j);
          newX.push(fakeDate.toISOString().split('T')[0]);
          newY.push(null);
        }
      }
    }
  }

  return { x: newX, y: newY };
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
    const theme = getChartTheme(darkMode);

    // Detect date column and sort rows if needed
    const xIsDate = isDateColumn(chartConfig.xColumn, rows.map(r => r[chartConfig.xColumn]));
    const sortedRows = xIsDate ? sortByDate(rows, chartConfig.xColumn) : rows;

    let effectiveRows = sortedRows;

    // Client-side aggregation: group by x-value and apply aggregation
    if (chartConfig.aggregation && chartConfig.aggregation !== 'none') {
      const xCol = chartConfig.xColumn;
      const yCol = chartConfig.yColumn;
      const xSet = new Set(sortedRows.map(r => String(r[xCol])));
      if (xSet.size < sortedRows.length) {
        const groups = new Map<string, number[]>();
        for (const row of sortedRows) {
          const key = String(row[xCol]);
          if (!groups.has(key)) groups.set(key, []);
          const val = typeof row[yCol] === 'number' ? row[yCol] : Number(row[yCol]);
          if (!isNaN(val)) groups.get(key)!.push(val);
        }

        const aggregated: Record<string, any>[] = [];
        for (const [key, vals] of groups) {
          let aggVal: number;
          switch (chartConfig.aggregation) {
            case 'sum':
              aggVal = vals.reduce((a, b) => a + b, 0);
              break;
            case 'avg':
              aggVal = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
              break;
            case 'count':
              aggVal = vals.length;
              break;
            default:
              aggVal = vals.reduce((a, b) => a + b, 0);
          }
          aggregated.push({ ...sortedRows.find(r => String(r[xCol]) === key), [yCol]: aggVal });
        }
        effectiveRows = aggregated;
      }
    }

    const xValues = effectiveRows.map(r => r[chartConfig.xColumn]);
    const yValues = effectiveRows.map(r => r[chartConfig.yColumn]);

    const traces: any[] = [];
    let barmode: string | undefined;
    const xCol = chartConfig.xColumn;
    const yCol = chartConfig.yColumn;
    const rowCount = effectiveRows.length;

    // Helper: group rows by colorColumn and create one trace per group
    function buildGroupedTraces(type: string, mode?: string) {
      if (!chartConfig.colorColumn) {
        const traceName = chartConfig.yLabel || yCol;
        const trace: any = { type: type === 'grouped_bar' || type === 'stacked_bar' ? 'bar' : type, name: traceName };
        if (mode) trace.mode = mode;

        // Smart value sorting for bars (non-date)
        let finalX = xValues;
        let finalY = yValues;
        if (type === 'bar' && !xIsDate && chartConfig.categoryOrder !== 'none') {
          const sorted = sortByValue(xValues, yValues, chartConfig.orientation);
          finalX = sorted.x;
          finalY = sorted.y;
        }

        if (chartConfig.orientation === 'h') {
          trace.x = finalY;
          trace.y = finalX;
          trace.orientation = 'h';
        } else {
          trace.x = finalX;
          trace.y = finalY;
        }
        trace.marker = { color: theme.colors.primary };
        if (type === 'bar') {
          trace.marker = {
            color: theme.colors.primary,
            line: { color: theme.trace.bar.borderColor, width: theme.trace.bar.borderWidth },
            cornerradius: theme.trace.bar.cornerRadius,
          };
        }
        if (type === 'scatter' && !mode) trace.mode = 'markers';
        trace.hovertemplate = buildHoverTemplate(xCol, yCol, traceName, xIsDate, chartConfig.orientation === 'h');

        // Data labels
        applyDataLabels(trace, chartConfig.chartType, yCol, rowCount);

        traces.push(trace);
        return;
      }

      const groups = new Map<string, { x: any[]; y: any[] }>();
      for (const row of effectiveRows) {
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
        const color = theme.colors.categorical[idx % theme.colors.categorical.length];
        const trace: any = {
          type: type === 'grouped_bar' || type === 'stacked_bar' ? 'bar' : type,
          name,
          x,
          y,
          marker: { color },
        };
        if (type === 'bar' || type === 'grouped_bar' || type === 'stacked_bar') {
          trace.marker = {
            color,
            line: { color: theme.trace.bar.borderColor, width: theme.trace.bar.borderWidth },
            cornerradius: theme.trace.bar.cornerRadius,
          };
        }
        if (chartConfig.orientation === 'h') trace.orientation = 'h';
        if (mode) trace.mode = mode;
        trace.hovertemplate = buildHoverTemplate(xCol, yCol, name, xIsDate, chartConfig.orientation === 'h');
        traces.push(trace);
        idx++;
      }
    }

    switch (chartConfig.chartType) {
      case 'pie': {
        // Compute total for center annotation
        const numericVals = yValues.filter((v: any) => typeof v === 'number') as number[];
        const total = numericVals.reduce((a, b) => a + b, 0);
        const isCurrency = CURRENCY_PATTERNS.test(yCol);

        traces.push({
          type: 'pie',
          name: chartConfig.yLabel || yCol,
          labels: xValues,
          values: yValues,
          marker: {
            colors: theme.colors.categorical,
            line: { color: theme.trace.pie.sliceGapColor, width: theme.trace.pie.sliceGapWidth },
          },
          textfont: { color: theme.colors.text, size: 11 },
          textinfo: 'percent+label',
          hovertemplate: isCurrency
            ? '%{label}<br>$%{value:,.0f} (%{percent})<extra></extra>'
            : '%{label}<br>%{value:,.2~f} (%{percent})<extra></extra>',
          hole: theme.trace.pie.hole,
          pull: xValues.map((_: any, i: number) => i === 0 ? 0.03 : 0),
          sort: false,
        });

        // Center annotation showing total
        if (total > 0) {
          traces[traces.length - 1]._centerAnnotation = {
            text: `<b>${formatDataLabel(total, yCol)}</b><br><span style="font-size:10px;color:${theme.colors.textMuted}">Total</span>`,
            font: { size: 16, color: theme.colors.text },
          };
        }
        break;
      }

      case 'histogram':
        traces.push({
          type: 'histogram',
          name: chartConfig.xLabel || xCol,
          x: xValues,
          marker: {
            color: theme.colors.primary,
            line: { color: theme.trace.bar.borderColor, width: 0.5 },
            cornerradius: 2,
          },
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

        // Cell text annotations for heatmap
        const textMatrix = zMatrix.map(row => row.map(v => formatDataLabel(v, yCol)));

        traces.push({
          type: 'heatmap',
          name: chartConfig.colorColumn || yCol,
          x: xCats,
          y: yCats,
          z: zMatrix,
          text: textMatrix,
          texttemplate: '%{text}',
          textfont: { size: 10 },
          colorscale: 'Viridis',
          hoverongaps: false,
          hovertemplate: '%{x}<br>%{y}<br>Value: %{z:,.2~f}<extra></extra>',
          zsmooth: xCats.length > 20 || yCats.length > 20 ? 'best' : false,
        });
        break;
      }

      case 'area': {
        if (!chartConfig.colorColumn) {
          const areaName = chartConfig.yLabel || yCol;
          const color = theme.colors.primary;

          // Fill time series gaps
          const filled = xIsDate ? fillTimeSeriesGaps(xValues, yValues) : { x: xValues, y: yValues };

          traces.push({
            type: 'scatter',
            mode: 'lines',
            name: areaName,
            x: filled.x,
            y: filled.y,
            fill: 'tozeroy',
            fillgradient: buildAreaGradient(color, theme.trace.area.fillOpacityStart, theme.trace.area.fillOpacityEnd),
            fillcolor: hexToRgba(color, 0.12), // fallback for older Plotly
            line: { color, width: theme.trace.line.width, shape: 'spline' },
            connectgaps: false,
            hovertemplate: buildHoverTemplate(xCol, yCol, areaName, xIsDate, false),
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
            const c = theme.colors.categorical[idx % theme.colors.categorical.length];
            traces.push({
              type: 'scatter',
              mode: 'lines',
              name,
              x,
              y,
              fill: 'tozeroy',
              fillgradient: buildAreaGradient(c, 0.2, 0.02),
              fillcolor: hexToRgba(c, 0.1), // fallback
              line: { color: c, width: theme.trace.line.width, shape: 'spline' },
              hovertemplate: buildHoverTemplate(xCol, yCol, name, xIsDate, false),
            });
            idx++;
          }
        }
        break;
      }

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
              marker: { color: theme.colors.categorical[idx % theme.colors.categorical.length] },
              boxpoints: 'outliers',
              boxmean: 'sd',
              line: { width: 1.5 },
            });
            idx++;
          }
        } else {
          traces.push({
            type: 'box',
            y: yValues,
            name: chartConfig.yLabel || chartConfig.yColumn,
            marker: { color: theme.colors.primary },
            boxpoints: 'outliers',
            boxmean: 'sd',
            line: { width: 1.5 },
          });
        }
        break;

      case 'funnel':
        traces.push({
          type: 'funnel',
          name: chartConfig.yLabel || yCol,
          y: xValues.map(String),
          x: yValues,
          textinfo: 'value+percent initial',
          marker: {
            color: xValues.map((_: any, i: number) => theme.colors.categorical[i % theme.colors.categorical.length]),
          },
          connector: { line: { color: theme.colors.border, width: 1, dash: 'dot' } },
          hovertemplate: CURRENCY_PATTERNS.test(yCol)
            ? '%{y}<br>$%{x:,.0f}<extra></extra>'
            : '%{y}<br>%{x:,.2~f}<extra></extra>',
        });
        break;

      case 'waterfall': {
        const wfTrace: any = {
          type: 'waterfall',
          name: chartConfig.yLabel || yCol,
          x: xValues.map(String),
          y: yValues,
          measure: xValues.map((_: any, i: number) =>
            i === 0 ? 'absolute' : i === xValues.length - 1 ? 'total' : 'relative'
          ),
          connector: { line: { color: theme.colors.border, dash: 'dot', width: 1 } },
          increasing: { marker: { color: theme.colors.positive, line: { color: hexToRgba(theme.colors.positive, 0.3), width: 1 } } },
          decreasing: { marker: { color: theme.colors.negative, line: { color: hexToRgba(theme.colors.negative, 0.3), width: 1 } } },
          totals: { marker: { color: theme.colors.primary, line: { color: hexToRgba(theme.colors.primary, 0.3), width: 1 } } },
          textposition: 'outside',
          hovertemplate: CURRENCY_PATTERNS.test(yCol)
            ? '%{x}<br>$%{y:,.0f}<extra></extra>'
            : '%{x}<br>%{y:,.2~f}<extra></extra>',
        };
        applyDataLabels(wfTrace, 'waterfall', yCol, rowCount);
        traces.push(wfTrace);
        break;
      }

      case 'gauge': {
        const gaugeValue = typeof yValues[0] === 'number' ? yValues[0] : Number(yValues[0]) || 0;
        const isCurrency = CURRENCY_PATTERNS.test(yCol);

        // KPI-style indicator: big number with delta
        traces.push({
          type: 'indicator',
          mode: 'number+delta',
          value: gaugeValue,
          title: { text: chartConfig.title, font: { color: theme.colors.text, size: 13, family: theme.font.family } },
          number: {
            font: { color: theme.colors.text, size: 40, family: theme.font.family, weight: 700 },
            valueformat: isCurrency ? '$,.0f' : ',.0f',
          },
          delta: {
            reference: gaugeValue * 0.9, // placeholder — real delta from data
            relative: true,
            valueformat: '.1%',
            increasing: { color: theme.colors.positive },
            decreasing: { color: theme.colors.negative },
            font: { size: 14 },
          },
          domain: { x: [0, 1], y: [0, 1] },
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

    // Apply marker/line defaults using theme
    for (const trace of traces) {
      if (trace.type === 'scatter' && trace.mode === 'markers' && !trace.marker?.size) {
        trace.marker = {
          ...trace.marker,
          size: theme.trace.scatter.markerSize,
          opacity: theme.trace.scatter.markerOpacity,
          line: { color: theme.trace.scatter.borderColor, width: theme.trace.scatter.borderWidth },
        };
      }
      if (trace.type === 'scatter' && trace.mode?.includes('lines')) {
        if (!trace.line) trace.line = {};
        trace.line.width = trace.line.width || theme.trace.line.width;
        trace.line.shape = trace.line.shape || (xIsDate ? 'spline' : 'linear');
        if (!trace.marker?.size && trace.mode.includes('markers')) {
          trace.marker = { ...trace.marker, size: theme.trace.line.markerSize };
        }
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
          line: { color: theme.colors.categorical[4], dash: 'dash', width: 2 },
          showlegend: true,
          hoverinfo: 'skip',
        });
      }
    }

    // Moving average overlay
    if (chartConfig.movingAverage && chartConfig.movingAverage > 1 && ['line', 'area'].includes(chartConfig.chartType)) {
      const window = chartConfig.movingAverage;
      const numericY = yValues.map((v: any) => typeof v === 'number' ? v : Number(v));
      const maValues: (number | null)[] = numericY.map((_, i) => {
        if (i < window - 1) return null;
        let sum = 0;
        for (let j = i - window + 1; j <= i; j++) sum += numericY[j];
        return sum / window;
      });
      traces.push({
        type: 'scatter',
        mode: 'lines',
        x: xValues,
        y: maValues,
        name: `${window}-period MA`,
        line: { color: theme.colors.warning, dash: 'dot', width: 2 },
        showlegend: true,
        hoverinfo: 'skip',
        connectgaps: true,
      });
    }

    // Forecast extension
    if (chartConfig.forecastPeriods && chartConfig.forecastPeriods > 0 && ['line', 'area'].includes(chartConfig.chartType)) {
      const numericY = yValues.map((v: any) => typeof v === 'number' ? v : Number(v)).filter((v: number) => !isNaN(v));
      if (numericY.length >= 5) {
        const n = numericY.length;
        const xIdx = Array.from({ length: n }, (_, i) => i);
        const sumX = xIdx.reduce((a, b) => a + b, 0);
        const sumY = numericY.reduce((a, b) => a + b, 0);
        const sumXY = xIdx.reduce((a, i) => a + i * numericY[i], 0);
        const sumX2 = xIdx.reduce((a, i) => a + i * i, 0);
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        // Residual std for confidence band
        const residuals = numericY.map((y, i) => y - (slope * i + intercept));
        const residStd = Math.sqrt(residuals.reduce((a, r) => a + r * r, 0) / n);

        const forecastX: any[] = [];
        const forecastY: number[] = [];
        const upperBand: number[] = [];
        const lowerBand: number[] = [];

        // Start from last data point
        forecastX.push(xValues[n - 1]);
        forecastY.push(numericY[n - 1]);
        upperBand.push(numericY[n - 1]);
        lowerBand.push(numericY[n - 1]);

        for (let i = 1; i <= chartConfig.forecastPeriods; i++) {
          const fIdx = n - 1 + i;
          const yPred = slope * fIdx + intercept;
          forecastY.push(yPred);
          upperBand.push(yPred + 1.96 * residStd);
          lowerBand.push(yPred - 1.96 * residStd);
          forecastX.push(`Forecast +${i}`);
        }

        traces.push({
          type: 'scatter',
          mode: 'lines',
          x: forecastX,
          y: forecastY,
          name: 'Forecast',
          line: { color: theme.colors.categorical[3], dash: 'dash', width: 2 },
          showlegend: true,
        });
        // Confidence band
        traces.push({
          type: 'scatter',
          mode: 'lines',
          x: [...forecastX, ...forecastX.slice().reverse()],
          y: [...upperBand, ...lowerBand.slice().reverse()],
          fill: 'toself',
          fillcolor: hexToRgba(theme.colors.categorical[3], 0.1),
          line: { color: 'transparent' },
          name: '95% CI',
          showlegend: false,
          hoverinfo: 'skip',
        });
      }
    }

    // Secondary Y-axis
    if (chartConfig.secondaryY?.column && effectiveRows.length > 0 && effectiveRows[0][chartConfig.secondaryY.column] !== undefined) {
      const secondaryValues = effectiveRows.map(r => r[chartConfig.secondaryY!.column]);
      const secColor = theme.colors.categorical[5];
      traces.push({
        type: 'scatter',
        mode: 'lines+markers',
        x: xValues,
        y: secondaryValues,
        name: chartConfig.secondaryY.label || chartConfig.secondaryY.column,
        yaxis: 'y2',
        line: { color: secColor, width: 2 },
        marker: { color: secColor, size: 4 },
      });
    }

    const isHorizontal = chartConfig.orientation === 'h';

    // Smart axis formatting
    const isCurrency = CURRENCY_PATTERNS.test(yCol);
    const xTickformat = xIsDate ? detectDateFormat(xValues) : undefined;

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

    // Smart axis title: hide if column name is already clean/readable
    const xAxisTitle = isHorizontal
      ? (chartConfig.yLabel || chartConfig.yColumn)
      : (chartConfig.xLabel || chartConfig.xColumn);
    const yAxisTitle = isHorizontal
      ? (chartConfig.xLabel || chartConfig.xColumn)
      : (chartConfig.yLabel || chartConfig.yColumn);
    const showXTitle = !isCleanLabel(xAxisTitle) || xAxisTitle !== (isHorizontal ? chartConfig.yColumn : chartConfig.xColumn);
    const showYTitle = !isCleanLabel(yAxisTitle) || yAxisTitle !== (isHorizontal ? chartConfig.xColumn : chartConfig.yColumn);

    const isTimeSeries = xIsDate || chartConfig.chartType === 'line' || chartConfig.chartType === 'area';

    const plotLayout: any = {
      ...(hideTitle ? {} : { title: { text: chartConfig.title, font: { color: theme.font.title.color, size: theme.font.title.size, family: theme.font.family }, x: 0.01, xanchor: 'left' } }),
      paper_bgcolor: theme.layout.paperBg,
      plot_bgcolor: theme.layout.plotBg,
      font: { color: theme.colors.text, family: theme.font.family, size: 12 },
      margin: { l: leftMargin, r: rightMargin, t: hideTitle ? 10 : 45, b: bottomMargin, pad: 4 },
      xaxis: {
        title: showXTitle ? { text: xAxisTitle, standoff: 10, font: { size: theme.font.axis.size, color: theme.font.axis.color } } : undefined,
        gridcolor: theme.colors.grid,
        gridwidth: theme.layout.gridWidth,
        griddash: theme.layout.gridDash,
        tickfont: { color: theme.font.tick.color, size: theme.font.tick.size },
        type: isHorizontal && chartConfig.yAxisType === 'log' ? 'log' : (xIsDate ? 'date' : undefined),
        tickformat: isHorizontal ? undefined : xTickformat,
        tickprefix: isHorizontal && isCurrency ? '$' : undefined,
        tickangle: needsXRotation ? -45 : undefined,
        automargin: true,
        zeroline: true,
        zerolinecolor: theme.colors.zeroline,
        zerolinewidth: theme.layout.zerolineWidth,
        showgrid: !['bar', 'grouped_bar', 'stacked_bar'].includes(chartConfig.chartType),
        dtick: xIsDate && xValues.length <= 12 ? 'M1' : undefined,
        // Crosshair spikes for line/scatter
        ...(isTimeSeries || chartConfig.chartType === 'scatter' ? {
          showspikes: true,
          spikemode: 'across',
          spikethickness: 1,
          spikecolor: theme.colors.grid,
          spikedash: 'dot',
        } : {}),
      },
      yaxis: {
        title: showYTitle ? { text: yAxisTitle, standoff: 10, font: { size: theme.font.axis.size, color: theme.font.axis.color } } : undefined,
        gridcolor: theme.colors.grid,
        gridwidth: theme.layout.gridWidth,
        griddash: theme.layout.gridDash,
        tickfont: { color: theme.font.tick.color, size: theme.font.tick.size },
        type: !isHorizontal && chartConfig.yAxisType === 'log' ? 'log' : undefined,
        tickformat: isHorizontal ? undefined : yTickformat,
        tickprefix: !isHorizontal && isCurrency && !yTickformat?.startsWith('$') ? '$' : undefined,
        automargin: true,
        zeroline: true,
        zerolinecolor: theme.colors.zeroline,
        zerolinewidth: theme.layout.zerolineWidth,
        rangemode: 'tozero',
        showgrid: true,
        // Crosshair spikes for line/scatter
        ...(isTimeSeries || chartConfig.chartType === 'scatter' ? {
          showspikes: true,
          spikemode: 'across',
          spikethickness: 1,
          spikecolor: theme.colors.grid,
          spikedash: 'dot',
        } : {}),
      },
      autosize: true,
      transition: { duration: 300 },
      hoverlabel: {
        bgcolor: theme.colors.hoverBg,
        bordercolor: theme.colors.hoverBorder,
        font: { color: theme.font.hover.color, size: theme.font.hover.size, family: theme.font.family },
        namelength: -1,
      },
      hoverdistance: 30,
      hovermode: isTimeSeries ? 'x unified' : 'closest',
      showlegend: traces.length > 1,
      legend: {
        font: { size: 11, family: theme.font.family },
        bgcolor: theme.colors.legendBg,
        borderwidth: 0,
        // Horizontal legend for 2-3 series, inside chart; vertical for 4+
        orientation: traces.length <= 3 ? 'h' : 'v',
        x: traces.length <= 3 ? 0.5 : 0.98,
        xanchor: traces.length <= 3 ? 'center' : 'right',
        y: traces.length <= 3 ? -0.12 : 1,
        yanchor: traces.length <= 3 ? 'top' : 'top',
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
      const catValues = xValues;
      const hasLongLabels = catValues.some((v: any) => String(v ?? '').length > maxLabelLen);
      if (hasLongLabels && plotLayout[categoryAxis]) {
        const tickvals = catValues.map(String);
        const ticktext = tickvals.map((v: string) => v.length > maxLabelLen ? v.slice(0, maxLabelLen - 1) + '…' : v);
        plotLayout[categoryAxis].tickmode = 'array';
        plotLayout[categoryAxis].tickvals = tickvals;
        plotLayout[categoryAxis].ticktext = ticktext;
      }
    }

    // Gauge/KPI charts don't need axis config
    if (chartConfig.chartType === 'gauge') {
      delete plotLayout.xaxis;
      delete plotLayout.yaxis;
      plotLayout.margin = { l: 20, r: 20, t: 10, b: 10 };
    }

    // Pie/donut charts — clean layout with center annotation
    if (chartConfig.chartType === 'pie') {
      delete plotLayout.xaxis;
      delete plotLayout.yaxis;
      plotLayout.margin = { l: 20, r: 20, t: hideTitle ? 10 : 40, b: 20 };
      plotLayout.showlegend = xValues.length <= 10;

      // Add center annotation for donut
      const centerAnnotation = traces[0]?._centerAnnotation;
      if (centerAnnotation) {
        plotLayout.annotations = [
          ...(plotLayout.annotations || []),
          {
            text: centerAnnotation.text,
            font: centerAnnotation.font,
            showarrow: false,
            x: 0.5,
            y: 0.5,
            xref: 'paper',
            yref: 'paper',
          },
        ];
        delete traces[0]._centerAnnotation;
      }
    }

    // Range slider for time series line/area charts
    if (isTimeSeries && rowCount > 20 && ['line', 'area'].includes(chartConfig.chartType)) {
      plotLayout.xaxis.rangeslider = { visible: true, thickness: 0.06 };
      plotLayout.margin.b = Math.max(plotLayout.margin.b, 70);
    }

    // Scroll zoom for scatter plots
    if (chartConfig.chartType === 'scatter') {
      plotLayout.dragmode = 'zoom';
    }

    // User annotations
    if (chartConfig.annotations && chartConfig.annotations.length > 0 && chartConfig.showAnnotations !== false) {
      plotLayout.annotations = [
        ...(plotLayout.annotations || []),
        ...chartConfig.annotations.map(a => {
          const isAnomaly = a.isAnomaly;
          const severity = a.severity;
          return {
            x: a.x,
            y: a.y,
            text: a.text,
            showarrow: true,
            arrowhead: 2,
            arrowsize: 1,
            arrowwidth: isAnomaly ? 2 : 1.5,
            arrowcolor: isAnomaly ? theme.colors.negative : theme.colors.primary,
            ax: 0,
            ay: -40,
            bgcolor: isAnomaly ? (darkMode ? '#2a1215' : '#fef2f2') : theme.colors.hoverBg,
            bordercolor: isAnomaly ? theme.colors.negative : theme.colors.border,
            borderwidth: isAnomaly && severity === 'critical' ? 2 : 1,
            borderpad: 4,
            font: { color: isAnomaly ? theme.colors.negative : theme.colors.text, size: 11 },
          };
        }),
      ];
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
          line: { color: theme.colors.negative, width: 2, dash: 'dot' },
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
          font: { color: theme.colors.negative, size: 11 },
        },
      ];
    }

    // Secondary Y-axis layout
    if (chartConfig.secondaryY?.column) {
      const secColor = theme.colors.categorical[5];
      plotLayout.yaxis2 = {
        title: { text: chartConfig.secondaryY.label || chartConfig.secondaryY.column, standoff: 10 },
        overlaying: 'y',
        side: 'right',
        titlefont: { color: secColor },
        tickfont: { color: secColor, size: 11 },
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
      const x = point.label !== undefined ? point.label : point.x;
      const y = point.y !== undefined ? point.y : point.value;
      onChartClick(x, y);
    }
  }, [onChartClick]);

  if (!mounted) return <div className="w-full h-full min-h-[300px]" />;

  return (
    <div className={`w-full h-full min-h-[300px] min-w-0 overflow-hidden ${annotationMode ? 'ring-2 ring-indigo-500 rounded-lg' : ''}`}>
      <Plot
        data={data}
        layout={layout}
        config={{
          responsive: true,
          displayModeBar: true,
          displaylogo: false,
          modeBarButtonsToRemove: ['lasso2d', 'select2d'],
          scrollZoom: chartConfig.chartType === 'scatter',
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
