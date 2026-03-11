/**
 * Chart Design System — centralized theme for all Plotly charts.
 * Provides dark/light mode palettes, typography, layout defaults, and trace defaults.
 */

// ═══════════════════════════════════════════════════
// Color Palettes
// ═══════════════════════════════════════════════════

/** 20-color categorical palette — dark mode (lighter/more saturated) */
const DARK_CATEGORICAL = [
  '#818cf8', '#a78bfa', '#f472b6', '#fb7185', '#fb923c',
  '#fbbf24', '#4ade80', '#2dd4bf', '#22d3ee', '#60a5fa',
  '#c084fc', '#e879f9', '#f9a8d4', '#fca5a5', '#fdba74',
  '#fde047', '#86efac', '#5eead4', '#67e8f9', '#93c5fd',
];

/** 20-color categorical palette — light mode (deeper/richer) */
const LIGHT_CATEGORICAL = [
  '#4f46e5', '#7c3aed', '#db2777', '#e11d48', '#ea580c',
  '#ca8a04', '#16a34a', '#0d9488', '#0891b2', '#2563eb',
  '#9333ea', '#c026d3', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
];

/** Sequential scales */
export const SEQUENTIAL_SCALES = {
  viridis: [[0, '#440154'], [0.25, '#31688e'], [0.5, '#35b779'], [0.75, '#fde725'], [1, '#fde725']] as [number, string][],
  indigo: [[0, '#312e81'], [0.33, '#4338ca'], [0.66, '#818cf8'], [1, '#e0e7ff']] as [number, string][],
  warm: [[0, '#7f1d1d'], [0.33, '#dc2626'], [0.66, '#fb923c'], [1, '#fef3c7']] as [number, string][],
};

/** Semantic colors */
const SEMANTIC = {
  positive: '#22c55e',
  negative: '#ef4444',
  neutral: '#94a3b8',
  warning: '#f59e0b',
  positiveBg: 'rgba(34, 197, 94, 0.1)',
  negativeBg: 'rgba(239, 68, 68, 0.1)',
};

// ═══════════════════════════════════════════════════
// Theme Interface
// ═══════════════════════════════════════════════════

export interface ChartTheme {
  colors: {
    categorical: string[];
    primary: string;
    secondary: string;
    bg: string;
    paper: string;
    text: string;
    textMuted: string;
    grid: string;
    gridDash: string;
    zeroline: string;
    border: string;
    hoverBg: string;
    hoverBorder: string;
    legendBg: string;
    positive: string;
    negative: string;
    neutral: string;
    warning: string;
    positiveBg: string;
    negativeBg: string;
  };
  font: {
    family: string;
    title: { size: number; color: string };
    axis: { size: number; color: string };
    tick: { size: number; color: string };
    hover: { size: number; color: string };
    dataLabel: { size: number; color: string };
  };
  layout: {
    paperBg: string;
    plotBg: string;
    gridWidth: number;
    gridDash: string;
    zerolineWidth: number;
    margin: { l: number; r: number; t: number; b: number };
  };
  trace: {
    bar: {
      cornerRadius: number;
      borderWidth: number;
      borderColor: string;
      gap: number;
    };
    line: {
      width: number;
      markerSize: number;
    };
    area: {
      fillOpacityStart: number;
      fillOpacityEnd: number;
    };
    scatter: {
      markerSize: number;
      markerOpacity: number;
      borderWidth: number;
      borderColor: string;
    };
    pie: {
      hole: number;
      sliceGapWidth: number;
      sliceGapColor: string;
    };
  };
}

// ═══════════════════════════════════════════════════
// Theme Factory
// ═══════════════════════════════════════════════════

export function getChartTheme(darkMode: boolean): ChartTheme {
  const categorical = darkMode ? DARK_CATEGORICAL : LIGHT_CATEGORICAL;
  const primary = categorical[0];
  const secondary = categorical[1];

  const text = darkMode ? '#d1d5db' : '#374151';
  const textMuted = darkMode ? '#6b7280' : '#9ca3af';
  const bg = darkMode ? '#161718' : '#ffffff';
  const paper = darkMode ? '#161718' : '#ffffff';
  const grid = darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const zeroline = darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  const border = darkMode ? '#2a2b2d' : '#e5e7eb';
  const hoverBg = darkMode ? '#1e1f20' : '#ffffff';
  const legendBg = darkMode ? 'rgba(22,23,24,0.9)' : 'rgba(255,255,255,0.9)';

  return {
    colors: {
      categorical,
      primary,
      secondary,
      bg,
      paper,
      text,
      textMuted,
      grid,
      gridDash: grid,
      zeroline,
      border,
      hoverBg,
      hoverBorder: border,
      legendBg,
      ...SEMANTIC,
    },
    font: {
      family: 'Inter, system-ui, -apple-system, sans-serif',
      title: { size: 14, color: text },
      axis: { size: 11, color: textMuted },
      tick: { size: 11, color: text },
      hover: { size: 12, color: text },
      dataLabel: { size: 10, color: text },
    },
    layout: {
      paperBg: paper,
      plotBg: bg,
      gridWidth: 0.5,
      gridDash: 'dot',
      zerolineWidth: 1,
      margin: { l: 60, r: 30, t: 45, b: 60 },
    },
    trace: {
      bar: {
        cornerRadius: 4,
        borderWidth: 1,
        borderColor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
        gap: 0.2,
      },
      line: {
        width: 2.5,
        markerSize: 4,
      },
      area: {
        fillOpacityStart: 0.25,
        fillOpacityEnd: 0.02,
      },
      scatter: {
        markerSize: 8,
        markerOpacity: 0.75,
        borderWidth: 1.5,
        borderColor: darkMode ? '#161718' : '#ffffff',
      },
      pie: {
        hole: 0.45,
        sliceGapWidth: 2,
        sliceGapColor: paper,
      },
    },
  };
}

// ═══════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════

/** Convert hex color to rgba */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Build a vertical fill gradient config for Plotly area charts */
export function buildAreaGradient(color: string, startOpacity: number, endOpacity: number): any {
  return {
    type: 'vertical',
    colorscale: [
      [0, hexToRgba(color, startOpacity)],
      [1, hexToRgba(color, endOpacity)],
    ],
  };
}

/** Format number for data labels */
export function formatDataLabel(val: number, column: string): string {
  const CURRENCY = /revenue|salary|cost|price|amount|total_sales|income|profit|budget|payment|fee|spend|avg_|average_|sum_|total_|net_/i;
  const PERCENT = /rate|percent|pct|ratio|margin|growth|change/i;

  const abs = Math.abs(val);
  if (CURRENCY.test(column)) {
    if (abs >= 1e9) return '$' + (val / 1e9).toFixed(1) + 'B';
    if (abs >= 1e6) return '$' + (val / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return '$' + (val / 1e3).toFixed(1) + 'K';
    return '$' + val.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  if (PERCENT.test(column)) {
    return val.toFixed(1) + '%';
  }
  if (abs >= 1e9) return (val / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return (val / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return (val / 1e3).toFixed(1) + 'K';
  if (Number.isInteger(val)) return val.toLocaleString();
  return val.toFixed(1);
}

/** Determine if data labels should be shown based on chart type and data density */
export function shouldShowDataLabels(chartType: string, rowCount: number): boolean {
  if (chartType === 'pie') return true;
  if (chartType === 'waterfall') return rowCount <= 20;
  if (chartType === 'funnel') return true;
  if (['bar', 'grouped_bar', 'stacked_bar'].includes(chartType)) return rowCount <= 15;
  if (chartType === 'line' || chartType === 'area') return rowCount <= 12;
  return false;
}
